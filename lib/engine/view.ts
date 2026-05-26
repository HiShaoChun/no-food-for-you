import type { AgentView, GameState, PressureCurve } from "./types";

export function buildView(state: GameState, agentId: string): AgentView {
  return {
    agent_id: agentId,
    round: state.round,
    max_rounds: state.config.max_rounds,
    self_energy: state.energies[agentId] ?? 0,
    all_energies: { ...state.energies },
    inbox: [...(state.inboxes[agentId] ?? [])],
    history: state.history,
    pressure_description: describePressure(state.config.pressure, state.round),
  };
}

export function describePressure(curve: PressureCurve, round: number): string {
  switch (curve.type) {
    case "constant":
      return `每回合扣 ${curve.amount} 点`;
    case "linear": {
      const cost = curve.start + curve.step * (round - 1);
      return `本回合扣 ${cost} 点（随回合递增）`;
    }
    case "step": {
      const cost = stepCost(curve.thresholds, round);
      return `本回合扣 ${cost} 点（阶梯式）`;
    }
  }
}

export function pressureCost(curve: PressureCurve, round: number): number {
  switch (curve.type) {
    case "constant":
      return curve.amount;
    case "linear":
      return curve.start + curve.step * (round - 1);
    case "step":
      return stepCost(curve.thresholds, round);
  }
}

function stepCost(thresholds: readonly number[], round: number): number {
  // thresholds = [10, 20]: rounds 1..10 → 1, 11..20 → 2, 21+ → 3
  for (let i = 0; i < thresholds.length; i++) {
    const t = thresholds[i]!;
    if (round <= t) return i + 1;
  }
  return thresholds.length + 1;
}
