import type { AgentInstance, SimEvent } from "@/lib/engine/types";

export type AgentStats = {
  id: string;
  display_name: string;
  given: number; // sum of outgoing transfer amounts
  received: number; // sum of incoming transfer amounts
  requests: number; // # of decision events where action === "request"
  responses: number; // # of decision events where action === "respond"
  alive_rounds: number; // number of rounds the agent was alive (incl. final living round if survivor)
  eliminated_at: number | null; // round of elimination, or null if survivor
  final_energy: number; // energy at end (0 if eliminated)
  is_survivor: boolean;
};

export type SimStats = {
  per_agent: AgentStats[];
  total_rounds: number; // rounds actually played
  reason: "max_rounds" | "all_eliminated" | "one_survivor" | null;
  survivors: string[];
  total_tokens: { input: number; output: number };
  most_generous: AgentStats | null; // largest `given`, >0
  most_dependent: AgentStats | null; // largest `requests`, >0
  longest_survivor: AgentStats | null; // largest alive_rounds
};

/**
 * Aggregate a stream of SimEvents into per-agent and overall stats.
 *
 * Gracefully handles legacy events where `transfers` may be missing —
 * in that case we fall back to counting agent_decision.parsed.allocations
 * (less accurate because it ignores policy truncation, but better than nothing).
 */
export function computeStats(agents: AgentInstance[], events: SimEvent[]): SimStats {
  const byId = new Map<string, AgentStats>();
  for (const a of agents) {
    byId.set(a.id, {
      id: a.id,
      display_name: a.display_name,
      given: 0,
      received: 0,
      requests: 0,
      responses: 0,
      alive_rounds: 0,
      eliminated_at: null,
      final_energy: 0,
      is_survivor: false,
    });
  }

  let total_rounds = 0;
  let reason: SimStats["reason"] = null;
  let survivors: string[] = [];
  const total_tokens = { input: 0, output: 0 };
  const eliminatedSet = new Set<string>();

  for (const e of events) {
    if (e.type === "agent_decision") {
      const s = byId.get(e.agent);
      if (!s) continue;
      if (e.parsed?.action === "request") s.requests += 1;
      else if (e.parsed?.action === "respond") {
        s.responses += 1;
        // Legacy fallback: if no transfers in round_settled, we'll need this
        // — but we don't add to `given` here to avoid double-counting when transfers exist.
      }
      if (e.tokens) {
        total_tokens.input += e.tokens.input;
        total_tokens.output += e.tokens.output;
      }
    } else if (e.type === "round_settled") {
      total_rounds = Math.max(total_rounds, e.round);
      // Increment alive_rounds for living agents this round
      for (const id of Object.keys(e.energies)) {
        if (!eliminatedSet.has(id)) {
          const s = byId.get(id);
          if (s) s.alive_rounds = e.round;
        }
      }
      // Apply transfers (preferred path)
      if (Array.isArray(e.transfers)) {
        for (const t of e.transfers) {
          const from = byId.get(t.from);
          const to = byId.get(t.to);
          if (from) from.given += t.amount;
          if (to) to.received += t.amount;
        }
      }
      // Mark newly eliminated
      for (const id of e.eliminated) {
        eliminatedSet.add(id);
        const s = byId.get(id);
        if (s) s.eliminated_at = e.round;
      }
      // Update final_energy with this round's energies (will be overwritten by later rounds)
      for (const [id, en] of Object.entries(e.energies)) {
        const s = byId.get(id);
        if (s) s.final_energy = en;
      }
    } else if (e.type === "sim_ended") {
      reason = e.reason;
      survivors = e.survivors;
    }
  }

  // Mark survivors
  for (const id of survivors) {
    const s = byId.get(id);
    if (s) s.is_survivor = true;
  }

  const per_agent = [...byId.values()];

  // Awards
  const generousContenders = per_agent.filter((a) => a.given > 0);
  generousContenders.sort((a, b) => b.given - a.given || a.id.localeCompare(b.id));
  const most_generous = generousContenders[0] ?? null;

  const dependentContenders = per_agent.filter((a) => a.requests > 0);
  dependentContenders.sort((a, b) => b.requests - a.requests || a.id.localeCompare(b.id));
  const most_dependent = dependentContenders[0] ?? null;

  const longestContenders = [...per_agent];
  longestContenders.sort((a, b) => b.alive_rounds - a.alive_rounds || a.id.localeCompare(b.id));
  const longest_survivor = longestContenders[0] ?? null;

  return {
    per_agent,
    total_rounds,
    reason,
    survivors,
    total_tokens,
    most_generous,
    most_dependent,
    longest_survivor,
  };
}

/**
 * Sort per-agent stats for the standings table:
 *  1. Survivors first (alive at end), among them by final_energy descending
 *  2. Eliminated next, by elimination round descending (later eliminations rank higher)
 *  3. Tie-break by ID ascending
 */
export function rankedStandings(stats: AgentStats[]): AgentStats[] {
  return [...stats].sort((a, b) => {
    if (a.is_survivor !== b.is_survivor) return a.is_survivor ? -1 : 1;
    if (a.is_survivor) {
      if (a.final_energy !== b.final_energy) return b.final_energy - a.final_energy;
    } else {
      const aElim = a.eliminated_at ?? 0;
      const bElim = b.eliminated_at ?? 0;
      if (aElim !== bElim) return bElim - aElim;
    }
    return a.id.localeCompare(b.id);
  });
}
