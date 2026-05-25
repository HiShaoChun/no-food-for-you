import type {
  AgentRuntime,
  GameConfig,
  GameState,
  SimEvent,
} from "./types";
import { makeRng } from "./rng";
import { buildView } from "./view";
import { settleRound, type DecidedAction } from "./settle";

export type RoundOutput = {
  decision_events: Omit<SimEvent & { type: "agent_decision" }, "type" | "sim_id" | "t">[];
  newly_eliminated: string[];
  next_state: GameState;
  prev_energies: Record<string, number>;
  transfers: Array<{ from: string; to: string; amount: number }>;
  pressure_cost: number;
};

export function initState(config: GameConfig): GameState {
  const energies: Record<string, number> = {};
  const inboxes: Record<string, never[]> = {};
  for (const a of config.agents) {
    energies[a.id] = config.initial_energy;
    inboxes[a.id] = [];
  }
  return {
    config,
    round: 1,
    energies,
    eliminated: new Set(),
    inboxes,
    history: [],
    rng: makeRng(config.master_seed),
  };
}

export async function runRound(
  state: GameState,
  agents: readonly AgentRuntime[],
): Promise<RoundOutput> {
  const living = agents.filter((a) => !state.eliminated.has(a.id));

  // ② Decision phase — parallel within a single round
  const decisionPromises = living.map(async (a) => {
    const view = buildView(state, a.id);
    const result = await a.decide(view);
    return { agent_id: a.id, result };
  });
  const decisionResults = await Promise.all(decisionPromises);

  // Build DecidedAction list (parse failure → noop)
  const decided: DecidedAction[] = decisionResults.map(({ agent_id, result }) => {
    const action = result.parsed ?? { action: "noop" as const };
    return { agent_id, action };
  });

  // ⑤ Settlement
  const settled = settleRound(state, decided);

  // Build decision_events for emit
  const decision_events = decisionResults.map(({ agent_id, result }) => ({
    round: state.round,
    agent: agent_id,
    raw: result.raw,
    parsed: result.parsed,
    ...(result.parse_error !== undefined ? { parse_error: result.parse_error } : {}),
    ...(result.tokens !== undefined ? { tokens: result.tokens } : {}),
  }));

  return {
    decision_events,
    newly_eliminated: settled.newly_eliminated,
    next_state: settled.next_state,
    prev_energies: settled.prev_energies,
    transfers: settled.transfers,
    pressure_cost: settled.pressure_cost,
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

/**
 * Top-level simulation loop. Emits events; the registry/SSE layer handles delivery.
 */
export async function runSimulation(
  config: GameConfig,
  opts: SimRunOptions,
): Promise<void> {
  const now = () => new Date().toISOString();
  let state = initState(config);

  opts.emit({ type: "sim_started", sim_id: opts.sim_id, config, t: now() });

  while (true) {
    // Termination check BEFORE running the round (so max_rounds=0 terminates immediately)
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

    const { decision_events, next_state, prev_energies, transfers, pressure_cost } =
      await runRound(state, opts.agents);

    for (const ev of decision_events) {
      opts.emit({
        type: "agent_decision",
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
      t: now(),
    });

    state = next_state;
  }
}
