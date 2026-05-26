import type { AgentInstance, SimEvent } from "@/lib/engine/types";

export type AgentStats = {
  id: string;
  display_name: string;
  given: number;
  received: number;
  requests: number;
  responses: number;
  pledges_made: number;
  pledges_kept: number;
  pledges_defected: number;
  betrayal_bonus_total: number; // sum of bonus_paid where this agent was defector (default-table can be negative)
  alive_rounds: number;
  eliminated_at: number | null;
  final_energy: number;
  is_survivor: boolean;
};

export type SimStats = {
  per_agent: AgentStats[];
  total_rounds: number;
  reason: "max_rounds" | "all_eliminated" | "one_survivor" | null;
  survivors: string[];
  total_tokens: { input: number; output: number };
  total_tokens_decision: { input: number; output: number };
  total_tokens_response: { input: number; output: number };
  most_generous: AgentStats | null;
  most_dependent: AgentStats | null;
  longest_survivor: AgentStats | null;
  most_treacherous: AgentStats | null; // largest pledges_defected (>0)
};

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
      pledges_made: 0,
      pledges_kept: 0,
      pledges_defected: 0,
      betrayal_bonus_total: 0,
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
  const total_tokens_decision = { input: 0, output: 0 };
  const total_tokens_response = { input: 0, output: 0 };
  const eliminatedSet = new Set<string>();

  for (const e of events) {
    if (e.type === "agent_decision_phase") {
      const s = byId.get(e.agent);
      if (!s) continue;
      const p = e.parsed;
      if (p) {
        if (p.requests.length > 0) s.requests += 1;
      }
      if (e.tokens) {
        total_tokens.input += e.tokens.input;
        total_tokens.output += e.tokens.output;
        total_tokens_decision.input += e.tokens.input;
        total_tokens_decision.output += e.tokens.output;
      }
    } else if (e.type === "agent_response_phase") {
      const s = byId.get(e.agent);
      if (!s) continue;
      const p = e.parsed;
      if (p) {
        if (p.allocations.length > 0) s.responses += 1;
      }
      if (e.tokens) {
        total_tokens.input += e.tokens.input;
        total_tokens.output += e.tokens.output;
        total_tokens_response.input += e.tokens.input;
        total_tokens_response.output += e.tokens.output;
      }
    } else if (e.type === "agent_decision") {
      // Legacy event support
      const s = byId.get(e.agent);
      if (!s) continue;
      if (e.parsed?.action === "request") s.requests += 1;
      else if (e.parsed?.action === "respond") s.responses += 1;
      if (e.tokens) {
        total_tokens.input += e.tokens.input;
        total_tokens.output += e.tokens.output;
      }
    } else if (e.type === "round_settled") {
      total_rounds = Math.max(total_rounds, e.round);
      for (const id of Object.keys(e.energies)) {
        if (!eliminatedSet.has(id)) {
          const s = byId.get(id);
          if (s) s.alive_rounds = e.round;
        }
      }
      if (Array.isArray(e.transfers)) {
        for (const t of e.transfers) {
          const from = byId.get(t.from);
          const to = byId.get(t.to);
          if (from) from.given += t.amount;
          if (to) to.received += t.amount;
        }
      }
      if (Array.isArray(e.pledges_made_this_round)) {
        for (const p of e.pledges_made_this_round) {
          const s = byId.get(p.from);
          if (s) s.pledges_made += 1;
        }
      }
      if (Array.isArray(e.pledges_settled_this_round)) {
        // For betrayal_bonus accounting, only count each defector ONCE per round
        // (engine pays bonus per-defector-per-round, not per-defected-pledge)
        const accountedDefectorsThisRound = new Set<string>();
        for (const p of e.pledges_settled_this_round) {
          const s = byId.get(p.from);
          if (!s) continue;
          if (p.status === "kept") s.pledges_kept += 1;
          else {
            s.pledges_defected += 1;
            if (!accountedDefectorsThisRound.has(p.from)) {
              s.betrayal_bonus_total += p.bonus_paid;
              accountedDefectorsThisRound.add(p.from);
            }
          }
        }
      }
      for (const id of e.eliminated) {
        eliminatedSet.add(id);
        const s = byId.get(id);
        if (s) s.eliminated_at = e.round;
      }
      for (const [id, en] of Object.entries(e.energies)) {
        const s = byId.get(id);
        if (s) s.final_energy = en;
      }
    } else if (e.type === "sim_ended") {
      reason = e.reason;
      survivors = e.survivors;
    }
  }

  for (const id of survivors) {
    const s = byId.get(id);
    if (s) s.is_survivor = true;
  }

  const per_agent = [...byId.values()];

  const generousContenders = per_agent.filter((a) => a.given > 0);
  generousContenders.sort((a, b) => b.given - a.given || a.id.localeCompare(b.id));
  const most_generous = generousContenders[0] ?? null;

  const dependentContenders = per_agent.filter((a) => a.requests > 0);
  dependentContenders.sort((a, b) => b.requests - a.requests || a.id.localeCompare(b.id));
  const most_dependent = dependentContenders[0] ?? null;

  const longestContenders = [...per_agent];
  longestContenders.sort((a, b) => b.alive_rounds - a.alive_rounds || a.id.localeCompare(b.id));
  const longest_survivor = longestContenders[0] ?? null;

  const treacherousContenders = per_agent.filter((a) => a.pledges_defected > 0);
  treacherousContenders.sort(
    (a, b) => b.pledges_defected - a.pledges_defected || a.id.localeCompare(b.id),
  );
  const most_treacherous = treacherousContenders[0] ?? null;

  return {
    per_agent,
    total_rounds,
    reason,
    survivors,
    total_tokens,
    total_tokens_decision,
    total_tokens_response,
    most_generous,
    most_dependent,
    longest_survivor,
    most_treacherous,
  };
}

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
