import type {
  Allocation,
  AllocationPolicy,
  DecisionAction,
  GameState,
  HistoryEvent,
  InboxMessage,
  ResponseAction,
} from "./types";
import type { DefectionRecord, Pledge, PledgeSettlement } from "./pledge";
import { lookupBetrayalBonus } from "./pledge";
import { pressureCost } from "./view";
import { shuffle } from "./rng";

// ───── Phase 3: route requests synchronously into this round's response inbox ─────

export type DecisionInput = {
  agent_id: string;
  action: DecisionAction;
};

export type RouteResult = {
  inboxes_this_round: Record<string, InboxMessage[]>;
  request_events: HistoryEvent[]; // appended to history at end-of-round
};

export function routeRequests(state: GameState, decisions: readonly DecisionInput[]): RouteResult {
  const inboxes: Record<string, InboxMessage[]> = {};
  for (const id of Object.keys(state.energies)) inboxes[id] = [];

  // Flatten (agent, request) pairs and shuffle for deterministic delivery order
  const pairs: { from: string; target: string; message: string }[] = [];
  for (const d of decisions) {
    if (state.eliminated.has(d.agent_id)) continue;
    for (const r of d.action.requests) {
      if (r.target === d.agent_id) continue;
      if (state.eliminated.has(r.target)) continue;
      if (!(r.target in inboxes)) continue;
      pairs.push({ from: d.agent_id, target: r.target, message: r.message });
    }
  }
  const shuffled = shuffle(pairs, state.rng);

  const request_events: HistoryEvent[] = [];
  for (const p of shuffled) {
    inboxes[p.target]!.push({ from: p.from, round: state.round, message: p.message });
    request_events.push({ kind: "request", from: p.from, to: p.target, message: p.message });
  }
  return { inboxes_this_round: inboxes, request_events };
}

// ───── Phase 5+6+7: apply allocations, settle pledges, deduct pressure, eliminate ─────

export type ResponseInput = {
  agent_id: string;
  action: ResponseAction | null; // null = phase failed → 0 allocations, 0 new pledges
};

export type SettleResult = {
  next_state: GameState;
  newly_eliminated: string[];
  events_this_round: HistoryEvent[];
  prev_energies: Record<string, number>;
  transfers: Array<{ from: string; to: string; amount: number; reason?: string }>;
  pressure_cost: number;
  pledges_made_this_round: Pledge[];
  pledges_settled_this_round: PledgeSettlement[];
};

export function settleResponses(
  state: GameState,
  decisions: readonly DecisionInput[],
  responses: readonly ResponseInput[],
  request_events: readonly HistoryEvent[],
): SettleResult {
  const policy = state.config.allocation_policy;
  const pledgesEnabled = state.config.pledges.enabled;
  const livingBefore = new Set(
    Object.keys(state.energies).filter((a) => !state.eliminated.has(a)),
  );

  const prev_energies: Record<string, number> = { ...state.energies };
  const energies: Record<string, number> = { ...state.energies };
  const transfers: Array<{ from: string; to: string; amount: number; reason?: string }> = [];

  const eventsThisRound: HistoryEvent[] = [...request_events];

  // ───── Step A: apply allocations (deterministic order by agent_id) ─────
  const responderOrder = [...responses].sort((a, b) => a.agent_id.localeCompare(b.agent_id));
  // Track actual transfers per (from, to) for pledge settlement
  const actualByPair = new Map<string, number>(); // key = `${from}>>${to}`

  for (const { agent_id, action } of responderOrder) {
    if (state.eliminated.has(agent_id)) continue;
    if (action === null) continue;
    const allocations = applyPolicy(action.allocations, policy, energies[agent_id] ?? 0);
    for (const a of allocations) {
      if (a.amount <= 0 || !Number.isInteger(a.amount)) continue;
      if (a.to === agent_id) continue;
      if (state.eliminated.has(a.to)) continue;
      if (!(a.to in energies)) continue;
      const senderE = energies[agent_id] ?? 0;
      const give = Math.min(a.amount, senderE);
      if (give <= 0) continue;
      energies[agent_id] = senderE - give;
      energies[a.to] = (energies[a.to] ?? 0) + give;
      const reasonText =
        typeof a.reason === "string" && a.reason.trim().length > 0 ? a.reason : undefined;
      const transferEntry: { from: string; to: string; amount: number; reason?: string } = {
        from: agent_id,
        to: a.to,
        amount: give,
        ...(reasonText !== undefined ? { reason: reasonText } : {}),
      };
      transfers.push(transferEntry);
      eventsThisRound.push({
        kind: "transfer",
        from: agent_id,
        to: a.to,
        amount: give,
        ...(reasonText !== undefined ? { reason: reasonText } : {}),
      });
      const key = `${agent_id}>>${a.to}`;
      actualByPair.set(key, (actualByPair.get(key) ?? 0) + give);
    }
  }

  // ───── Step B: collect newly-emitted pledges (decision + response) ─────
  const pledges_made_this_round: Pledge[] = [];
  if (pledgesEnabled) {
    const livingForPledge = livingBefore;
    const addPledges = (
      agent_id: string,
      raw: readonly { to: string; amount: number }[],
    ): void => {
      if (state.eliminated.has(agent_id)) return;
      for (const p of raw) {
        if (p.to === agent_id) continue;
        if (!livingForPledge.has(p.to)) continue;
        if (!Number.isInteger(p.amount) || p.amount <= 0) continue;
        pledges_made_this_round.push({
          from: agent_id,
          to: p.to,
          amount: p.amount,
          round_made: state.round,
          due_round: state.round + 1,
        });
      }
    };
    for (const d of decisions) addPledges(d.agent_id, d.action.pledges);
    for (const r of responses) {
      if (r.action !== null) addPledges(r.agent_id, r.action.pledges);
    }
  }

  // ───── Step C: settle pending pledges (those whose due_round === state.round) ─────
  const pledges_settled_this_round: PledgeSettlement[] = [];
  const newDefections: DefectionRecord[] = [];
  const defectorBonusByAgent = new Map<string, number>(); // for filling bonus_paid

  if (pledgesEnabled) {
    const pendingPledges = state.public_pledges.filter((p) => p.due_round === state.round);
    const defectorSet = new Set<string>();
    const settlementDraft: Array<{ p: Pledge; actual: number; status: "kept" | "defected" }> = [];

    for (const p of pendingPledges) {
      const actual = actualByPair.get(`${p.from}>>${p.to}`) ?? 0;
      if (actual >= p.amount) {
        settlementDraft.push({ p, actual, status: "kept" });
      } else {
        settlementDraft.push({ p, actual, status: "defected" });
        defectorSet.add(p.from);
        newDefections.push({
          round_due: state.round,
          from: p.from,
          to: p.to,
          pledged: p.amount,
          actual,
        });
      }
    }

    // Compute betrayal bonus (one per defector, regardless of how many pledges defaulted)
    const defectorCount = defectorSet.size;
    const perDefectorBonus = lookupBetrayalBonus(
      defectorCount,
      state.config.pledges.betrayal_bonus_table,
    );
    for (const defector of defectorSet) {
      defectorBonusByAgent.set(defector, perDefectorBonus);
      if (defector in energies) {
        energies[defector] = (energies[defector] ?? 0) + perDefectorBonus;
      }
    }

    // Apply keep-promise bonus to receivers (if enabled and receiver alive)
    const keepBonus = state.config.pledges.keep_promise_bonus;
    for (const draft of settlementDraft) {
      if (draft.status === "kept" && keepBonus > 0) {
        if (livingBefore.has(draft.p.to)) {
          energies[draft.p.to] = (energies[draft.p.to] ?? 0) + keepBonus;
        }
      }
      pledges_settled_this_round.push({
        from: draft.p.from,
        to: draft.p.to,
        pledged: draft.p.amount,
        actual: draft.actual,
        status: draft.status,
        bonus_paid:
          draft.status === "kept"
            ? keepBonus
            : (defectorBonusByAgent.get(draft.p.from) ?? 0),
      });
    }
  }

  // ───── Step D: pressure deduction ─────
  const pressure_cost = pressureCost(state.config.pressure, state.round);
  for (const id of livingBefore) {
    energies[id] = (energies[id] ?? 0) - pressure_cost;
  }

  // ───── Step E: elimination (energy <= 0 after settlement) ─────
  const newly_eliminated: string[] = [];
  const eliminatedSet = new Set(state.eliminated);
  for (const id of livingBefore) {
    if ((energies[id] ?? 0) <= 0) {
      energies[id] = 0;
      eliminatedSet.add(id);
      newly_eliminated.push(id);
    }
  }

  // ───── Step F: build next public_pledges (drop settled, add newly created) ─────
  const survivingPledges = state.public_pledges.filter((p) => p.due_round !== state.round);
  const nextPublicPledges = pledgesEnabled
    ? [...survivingPledges, ...pledges_made_this_round]
    : survivingPledges;

  // ───── Step G: append to history (only if there were events) ─────
  const nextHistory =
    eventsThisRound.length > 0
      ? [...state.history, { round: state.round, events: eventsThisRound }]
      : state.history;

  const next_state: GameState = {
    config: state.config,
    round: state.round + 1,
    energies,
    eliminated: eliminatedSet,
    history: nextHistory,
    public_pledges: nextPublicPledges,
    recent_defections: pledgesEnabled
      ? [...state.recent_defections, ...newDefections]
      : state.recent_defections,
    rng: state.rng,
  };

  return {
    next_state,
    newly_eliminated,
    events_this_round: eventsThisRound,
    prev_energies,
    transfers,
    pressure_cost,
    pledges_made_this_round,
    pledges_settled_this_round,
  };
}

// ───── Allocation policy (unchanged from prior design) ─────

function applyPolicy(
  raw: readonly Allocation[],
  policy: AllocationPolicy,
  responderEnergy: number,
): Allocation[] {
  const clean: Allocation[] = raw
    .filter((a) => Number.isInteger(a.amount) && a.amount > 0)
    .map((a) => ({
      to: a.to,
      amount: a.amount,
      ...(typeof a.reason === "string" && a.reason.length > 0 ? { reason: a.reason } : {}),
    }));

  if (clean.length === 0) return [];

  switch (policy.type) {
    case "fully_free": {
      const sum = clean.reduce((s, a) => s + a.amount, 0);
      if (sum <= responderEnergy) return clean;
      return scaleDown(clean, responderEnergy);
    }
    case "capped": {
      const sum = clean.reduce((s, a) => s + a.amount, 0);
      const limit = Math.min(policy.cap, responderEnergy);
      if (sum <= limit) return clean;
      return scaleDown(clean, limit);
    }
    case "proportional": {
      const totalWeight = clean.reduce((s, a) => s + a.amount, 0);
      const budget = Math.min(responderEnergy, totalWeight);
      return scaleDown(clean, budget);
    }
  }
}

function scaleDown(items: readonly Allocation[], budget: number): Allocation[] {
  const totalWeight = items.reduce((s, a) => s + a.amount, 0);
  if (totalWeight === 0 || budget === 0) return [];
  const exact = items.map((a) => (a.amount * budget) / totalWeight);
  const floors = exact.map((x) => Math.floor(x));
  let remaining = budget - floors.reduce((s, x) => s + x, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const result: Allocation[] = items.map((a, i) => ({
    to: a.to,
    amount: floors[i]!,
    ...(a.reason !== undefined ? { reason: a.reason } : {}),
  }));
  for (const { i } of order) {
    if (remaining <= 0) break;
    result[i]!.amount += 1;
    remaining -= 1;
  }
  return result.filter((a) => a.amount > 0);
}
