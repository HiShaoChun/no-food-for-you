import type {
  AgentAction,
  Allocation,
  AllocationPolicy,
  GameState,
  HistoryEvent,
  InboxMessage,
  RequestAction,
  RespondAction,
} from "./types";
import { pressureCost } from "./view";
import { shuffle } from "./rng";

export type DecidedAction = {
  agent_id: string;
  action: AgentAction; // No-op if parse failed (caller normalizes)
  policy_truncated?: boolean;
};

export type SettleResult = {
  next_state: GameState;
  newly_eliminated: string[];
  // Public history events recorded this round (already appended to next_state.history)
  events_this_round: HistoryEvent[];
  prev_energies: Record<string, number>;
  transfers: Array<{ from: string; to: string; amount: number }>;
  pressure_cost: number;
};

/**
 * Phase ③④⑤: aggregate requests into next-round inboxes, apply respond allocations,
 * deduct pressure, mark eliminations.
 *
 * Pure: takes current state + decisions, returns next state + diff.
 */
export function settleRound(state: GameState, decisions: DecidedAction[]): SettleResult {
  const policy = state.config.allocation_policy;
  const livingBefore = new Set(
    Object.keys(state.energies).filter((a) => !state.eliminated.has(a)),
  );

  // Snapshot of energies at round-start (for prev_energies in settled event)
  const prev_energies: Record<string, number> = { ...state.energies };
  // Working copy of energies (we mutate as transfers apply)
  const energies: Record<string, number> = { ...state.energies };
  // Collect actual transfers (policy-truncated amounts)
  const transfers: Array<{ from: string; to: string; amount: number }> = [];

  // Inboxes for NEXT round (current round's requests delivered next round)
  const nextInboxes: Record<string, InboxMessage[]> = {};
  for (const id of Object.keys(state.energies)) nextInboxes[id] = [];

  const eventsThisRound: HistoryEvent[] = [];

  // ───── Step A: gather respond actions and apply transfers ─────
  // A responder must be alive; recipients must be alive.
  const responders: { agent_id: string; resp: RespondAction; policy_truncated?: boolean }[] = [];
  const requesters: { agent_id: string; req: RequestAction }[] = [];

  for (const d of decisions) {
    if (state.eliminated.has(d.agent_id)) continue;
    if (d.action.action === "respond") {
      responders.push({
        agent_id: d.agent_id,
        resp: d.action,
        ...(d.policy_truncated !== undefined ? { policy_truncated: d.policy_truncated } : {}),
      });
    } else if (d.action.action === "request") {
      requesters.push({ agent_id: d.agent_id, req: d.action });
    }
  }

  // Apply respond actions in deterministic order (by agent_id ascending)
  const responderOrder = [...responders].sort((a, b) => a.agent_id.localeCompare(b.agent_id));
  for (const { agent_id, resp } of responderOrder) {
    const allocations = applyPolicy(resp.allocations, policy, energies[agent_id] ?? 0);
    for (const a of allocations) {
      // Cannot send to dead agent or self; amount must be positive integer
      if (a.amount <= 0 || !Number.isInteger(a.amount)) continue;
      if (a.to === agent_id) continue;
      if (state.eliminated.has(a.to)) continue;
      if (!(a.to in energies)) continue;
      const senderE = energies[agent_id] ?? 0;
      const give = Math.min(a.amount, senderE);
      if (give <= 0) continue;
      energies[agent_id] = senderE - give;
      energies[a.to] = (energies[a.to] ?? 0) + give;
      eventsThisRound.push({ kind: "transfer", from: agent_id, to: a.to, amount: give });
      transfers.push({ from: agent_id, to: a.to, amount: give });
    }
  }

  // ───── Step B: route requests to next-round inboxes (in shuffled order) ─────
  const shuffledReqs = shuffle(requesters, state.rng);
  for (const { agent_id, req } of shuffledReqs) {
    if (req.target === agent_id) continue;
    if (state.eliminated.has(req.target)) continue;
    if (!(req.target in nextInboxes)) continue;
    nextInboxes[req.target]!.push({
      from: agent_id,
      round: state.round,
      message: req.message,
    });
    eventsThisRound.push({
      kind: "request",
      from: agent_id,
      to: req.target,
      message: req.message,
    });
  }

  // ───── Step C: pressure deduction ─────
  const pressure_cost = pressureCost(state.config.pressure, state.round);
  for (const id of livingBefore) {
    energies[id] = (energies[id] ?? 0) - pressure_cost;
  }

  // ───── Step D: elimination (energy <= 0 after settlement) ─────
  const newly_eliminated: string[] = [];
  const eliminatedSet = new Set(state.eliminated);
  for (const id of livingBefore) {
    if ((energies[id] ?? 0) <= 0) {
      energies[id] = 0; // clamp; spec says energy is integer ≥ 0 after settlement
      eliminatedSet.add(id);
      newly_eliminated.push(id);
      // Clear pending inbox for dead agents (they can't respond next round)
      nextInboxes[id] = [];
    }
  }

  // ───── Step E: append to history ─────
  const nextHistory =
    eventsThisRound.length > 0
      ? [...state.history, { round: state.round, events: eventsThisRound }]
      : state.history;

  const next_state: GameState = {
    config: state.config,
    round: state.round + 1,
    energies,
    eliminated: eliminatedSet,
    inboxes: nextInboxes,
    history: nextHistory,
    rng: state.rng,
  };

  return {
    next_state,
    newly_eliminated,
    events_this_round: eventsThisRound,
    prev_energies,
    transfers,
    pressure_cost,
  };
}

/**
 * Apply allocation policy. May truncate or recompute amounts.
 * For `proportional`, the agent-supplied amounts are interpreted as weights
 * unless the responder has no prior inbox (in which case we honor amounts directly,
 * since the agent likely intended a free gift).
 */
function applyPolicy(
  raw: readonly Allocation[],
  policy: AllocationPolicy,
  responderEnergy: number,
): Allocation[] {
  // Filter to positive integer amounts up front
  const clean = raw
    .filter((a) => Number.isInteger(a.amount) && a.amount > 0)
    .map((a) => ({ to: a.to, amount: a.amount }));

  if (clean.length === 0) return [];

  switch (policy.type) {
    case "fully_free": {
      // Constraint: sum ≤ responderEnergy. If exceeds, proportionally truncate.
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
      // Treat amounts as weights; distribute min(self_energy, sum_of_weights) by ratio.
      // (This matches spec scenario: "engine ignores agent amounts when proportional.")
      const totalWeight = clean.reduce((s, a) => s + a.amount, 0);
      const budget = Math.min(responderEnergy, totalWeight);
      return scaleDown(clean, budget);
    }
  }
}

function scaleDown(items: readonly Allocation[], budget: number): Allocation[] {
  const totalWeight = items.reduce((s, a) => s + a.amount, 0);
  if (totalWeight === 0 || budget === 0) return [];
  // Largest-remainder method to distribute integer budget across weights
  const exact = items.map((a) => (a.amount * budget) / totalWeight);
  const floors = exact.map((x) => Math.floor(x));
  let remaining = budget - floors.reduce((s, x) => s + x, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const result = items.map((a, i) => ({ to: a.to, amount: floors[i]! }));
  for (const { i } of order) {
    if (remaining <= 0) break;
    result[i]!.amount += 1;
    remaining -= 1;
  }
  return result.filter((a) => a.amount > 0);
}
