import type {
  AgentRuntime,
  GameConfig,
  GameState,
  InboxMessage,
  SimEvent,
} from "./types";
import type { Pledge, PledgeSettlement } from "./pledge";
import { makeRng } from "./rng";
import { buildDecisionView, buildResponseView } from "./view";
import {
  routeRequests,
  settleResponses,
  type DecisionInput,
  type ResponseInput,
} from "./settle";

export function initState(config: GameConfig): GameState {
  const energies: Record<string, number> = {};
  for (const a of config.agents) {
    energies[a.id] = config.initial_energy;
  }
  return {
    config,
    round: 1,
    energies,
    eliminated: new Set(),
    history: [],
    public_pledges: [],
    recent_defections: [],
    rng: makeRng(config.master_seed),
  };
}

type DecisionEventPayload = Omit<
  Extract<SimEvent, { type: "agent_decision_phase" }>,
  "type" | "sim_id" | "t"
>;
type ResponseEventPayload = Omit<
  Extract<SimEvent, { type: "agent_response_phase" }>,
  "type" | "sim_id" | "t"
>;

export type RoundOutput = {
  decision_events: DecisionEventPayload[];
  response_events: ResponseEventPayload[];
  next_state: GameState;
  prev_energies: Record<string, number>;
  transfers: Array<{ from: string; to: string; amount: number; reason?: string }>;
  pressure_cost: number;
  newly_eliminated: string[];
  pledges_made_this_round: Pledge[];
  pledges_settled_this_round: PledgeSettlement[];
};

export async function runRound(
  state: GameState,
  agents: readonly AgentRuntime[],
): Promise<RoundOutput> {
  const living = agents.filter((a) => !state.eliminated.has(a.id));

  // ───── Decision phase (parallel) ─────
  const decisionRaw = await Promise.all(
    living.map(async (a) => {
      const view = buildDecisionView(state, a.id);
      const result = await a.decide_phase(view);
      return { agent_id: a.id, result };
    }),
  );

  const decisionInputs: DecisionInput[] = decisionRaw.map(({ agent_id, result }) => ({
    agent_id,
    action: result.parsed ?? {
      phase: "decision",
      requests: [],
      pledges: [],
      inner_thought: "",
    },
  }));

  const decision_events = decisionRaw.map(({ agent_id, result }) => ({
    round: state.round,
    agent: agent_id,
    raw: result.raw,
    parsed: result.parsed,
    ...(result.parse_error !== undefined ? { parse_error: result.parse_error } : {}),
    ...(result.policy_truncated !== undefined ? { policy_truncated: result.policy_truncated } : {}),
    ...(result.tokens !== undefined ? { tokens: result.tokens } : {}),
  }));

  // ───── Request routing into this round's response inbox ─────
  const { inboxes_this_round, request_events } = routeRequests(state, decisionInputs);

  // ───── Response phase (parallel) ─────
  const responseRaw = await Promise.all(
    living.map(async (a) => {
      const inbox: InboxMessage[] = inboxes_this_round[a.id] ?? [];
      const view = buildResponseView(state, a.id, inbox);
      const result = await a.respond_phase(view);
      return { agent_id: a.id, result };
    }),
  );

  const responseInputs: ResponseInput[] = responseRaw.map(({ agent_id, result }) => ({
    agent_id,
    action: result.parsed,
  }));

  const response_events = responseRaw.map(({ agent_id, result }) => ({
    round: state.round,
    agent: agent_id,
    raw: result.raw,
    parsed: result.parsed,
    ...(result.parse_error !== undefined ? { parse_error: result.parse_error } : {}),
    ...(result.policy_truncated !== undefined ? { policy_truncated: result.policy_truncated } : {}),
    ...(result.tokens !== undefined ? { tokens: result.tokens } : {}),
  }));

  // ───── Pledge settlement + transfers + pressure + elimination ─────
  const settled = settleResponses(state, decisionInputs, responseInputs, request_events);

  return {
    decision_events,
    response_events,
    next_state: settled.next_state,
    prev_energies: settled.prev_energies,
    transfers: settled.transfers,
    pressure_cost: settled.pressure_cost,
    newly_eliminated: settled.newly_eliminated,
    pledges_made_this_round: settled.pledges_made_this_round,
    pledges_settled_this_round: settled.pledges_settled_this_round,
  };
}

export type TerminationReason = "max_rounds" | "all_eliminated" | "one_survivor";

export function terminationReason(state: GameState): TerminationReason | null {
  const living = Object.keys(state.energies).filter((a) => !state.eliminated.has(a));
  if (living.length === 0) return "all_eliminated";
  if (living.length === 1) return "one_survivor";
  if (state.round > state.config.max_rounds) return "max_rounds";
  return null;
}

export type SimRunOptions = {
  sim_id: string;
  agents: readonly AgentRuntime[];
  emit: (event: SimEvent) => void;
};

export async function runSimulation(
  config: GameConfig,
  opts: SimRunOptions,
): Promise<void> {
  const now = (): string => new Date().toISOString();
  let state = initState(config);

  opts.emit({ type: "sim_started", sim_id: opts.sim_id, config, t: now() });

  while (true) {
    const reason = terminationReason(state);
    if (reason !== null) {
      opts.emit({
        type: "sim_ended",
        sim_id: opts.sim_id,
        reason,
        survivors: Object.keys(state.energies).filter((a) => !state.eliminated.has(a)),
        t: now(),
      });
      return;
    }

    opts.emit({ type: "round_started", sim_id: opts.sim_id, round: state.round, t: now() });

    const {
      decision_events,
      response_events,
      next_state,
      prev_energies,
      transfers,
      pressure_cost,
      pledges_made_this_round,
      pledges_settled_this_round,
    } = await runRound(state, opts.agents);

    for (const ev of decision_events) {
      opts.emit({
        type: "agent_decision_phase",
        sim_id: opts.sim_id,
        ...ev,
        t: now(),
      });
    }
    for (const ev of response_events) {
      opts.emit({
        type: "agent_response_phase",
        sim_id: opts.sim_id,
        ...ev,
        t: now(),
      });
    }

    opts.emit({
      type: "round_settled",
      sim_id: opts.sim_id,
      round: state.round,
      prev_energies,
      energies: { ...next_state.energies },
      transfers,
      pressure_cost,
      eliminated: [...next_state.eliminated].filter((a) => !state.eliminated.has(a)),
      pledges_made_this_round,
      pledges_settled_this_round,
      t: now(),
    });

    state = next_state;
  }
}
