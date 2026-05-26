import { describe, expect, it } from "vitest";
import {
  buildDecisionView,
  buildResponseView,
  pressureCost,
} from "@/lib/engine/view";
import type { GameConfig, GameState, HistoryEntry } from "@/lib/engine/types";
import type { DefectionRecord, Pledge } from "@/lib/engine/pledge";
import { makeRng } from "@/lib/engine/rng";

function baseConfig(): GameConfig {
  return {
    agents: [
      { id: "A1", display_name: "A1", model_key: "doubao-seed-code" },
      { id: "A2", display_name: "A2", model_key: "doubao-seed-code" },
      { id: "A3", display_name: "A3", model_key: "doubao-seed-code" },
    ],
    shared_system_prompt: "test",
    initial_energy: 10,
    max_rounds: 30,
    pressure: { type: "constant", amount: 1 },
    allocation_policy: { type: "fully_free" },
    master_seed: 1,
    pledges: { enabled: true, betrayal_bonus_table: [3, 1, 0, -2], keep_promise_bonus: 0 },
  };
}

function stateAt(
  round: number,
  history: HistoryEntry[],
  cfg: GameConfig,
  pledges: Pledge[] = [],
  defections: DefectionRecord[] = [],
): GameState {
  return {
    config: cfg,
    round,
    energies: { A1: 8, A2: 6, A3: 5 },
    eliminated: new Set(),
    history,
    public_pledges: pledges,
    recent_defections: defections,
    rng: makeRng(1),
  };
}

describe("buildDecisionView", () => {
  it("includes full history regardless of round", () => {
    const hist: HistoryEntry[] = [
      { round: 1, events: [{ kind: "request", from: "A1", to: "A2", message: "r1" }] },
      { round: 2, events: [{ kind: "request", from: "A2", to: "A3", message: "r2" }] },
    ];
    const v = buildDecisionView(stateAt(3, hist, baseConfig()), "A1");
    expect(v.phase).toBe("decision");
    expect(v.history.length).toBe(2);
  });

  it("populates public_pledges and pending_pledges (filtered by self)", () => {
    const p1: Pledge = { from: "A1", to: "A2", amount: 2, round_made: 1, due_round: 2 };
    const p2: Pledge = { from: "A2", to: "A1", amount: 3, round_made: 1, due_round: 2 };
    const s = stateAt(2, [], baseConfig(), [p1, p2]);
    const v = buildDecisionView(s, "A1");
    expect(v.public_pledges).toEqual([p1, p2]);
    expect(v.pending_pledges).toEqual([p1]); // only A1's debts
  });

  it("populates recent_defections", () => {
    const d: DefectionRecord = { round_due: 2, from: "A2", to: "A1", pledged: 3, actual: 0 };
    const v = buildDecisionView(stateAt(3, [], baseConfig(), [], [d]), "A1");
    expect(v.recent_defections).toEqual([d]);
  });
});

describe("buildResponseView", () => {
  it("includes the inbox passed in", () => {
    const s = stateAt(2, [], baseConfig());
    const v = buildResponseView(s, "A2", [
      { from: "A1", round: 2, message: "hi" },
    ]);
    expect(v.phase).toBe("response");
    expect(v.inbox).toEqual([{ from: "A1", round: 2, message: "hi" }]);
  });

  it("shares base fields with decision view", () => {
    const v = buildResponseView(stateAt(5, [], baseConfig()), "A2", []);
    expect(v.agent_id).toBe("A2");
    expect(v.round).toBe(5);
    expect(v.self_energy).toBe(6);
    expect(v.all_energies).toEqual({ A1: 8, A2: 6, A3: 5 });
  });
});

describe("pressure curves", () => {
  it("constant", () => {
    expect(pressureCost({ type: "constant", amount: 1 }, 5)).toBe(1);
    expect(pressureCost({ type: "constant", amount: 3 }, 50)).toBe(3);
  });

  it("linear: start=1 step=1", () => {
    expect(pressureCost({ type: "linear", start: 1, step: 1 }, 1)).toBe(1);
    expect(pressureCost({ type: "linear", start: 1, step: 1 }, 5)).toBe(5);
    expect(pressureCost({ type: "linear", start: 1, step: 1 }, 10)).toBe(10);
  });

  it("step: thresholds=[10, 20]", () => {
    const p = { type: "step" as const, thresholds: [10, 20] };
    expect(pressureCost(p, 1)).toBe(1);
    expect(pressureCost(p, 10)).toBe(1);
    expect(pressureCost(p, 11)).toBe(2);
    expect(pressureCost(p, 20)).toBe(2);
    expect(pressureCost(p, 21)).toBe(3);
    expect(pressureCost(p, 999)).toBe(3);
  });
});
