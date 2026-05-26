import type {
  AgentViewBase,
  DecisionView,
  GameState,
  InboxMessage,
  PressureCurve,
  ResponseView,
} from "./types";

function buildBase(state: GameState, agentId: string): AgentViewBase {
  const pendingForAgent = state.public_pledges.filter(
    (p) => p.from === agentId && p.due_round === state.round,
  );
  return {
    agent_id: agentId,
    round: state.round,
    max_rounds: state.config.max_rounds,
    self_energy: state.energies[agentId] ?? 0,
    all_energies: { ...state.energies },
    history: state.history,
    pressure_description: describePressure(state.config.pressure, state.round),
    public_pledges: [...state.public_pledges],
    pending_pledges: pendingForAgent,
    recent_defections: [...state.recent_defections],
  };
}

/**
 * Build the view used for the decision phase. Decision phase has no inbox —
 * requests are emitted here and routed into the response phase of the SAME round.
 */
export function buildDecisionView(state: GameState, agentId: string): DecisionView {
  return { ...buildBase(state, agentId), phase: "decision" };
}

/**
 * Build the view used for the response phase. `inboxForThisRound` carries the
 * requests that this agent received from THIS round's decision phase.
 */
export function buildResponseView(
  state: GameState,
  agentId: string,
  inboxForThisRound: readonly InboxMessage[],
): ResponseView {
  return {
    ...buildBase(state, agentId),
    phase: "response",
    inbox: [...inboxForThisRound],
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
  for (let i = 0; i < thresholds.length; i++) {
    const t = thresholds[i]!;
    if (round <= t) return i + 1;
  }
  return thresholds.length + 1;
}
