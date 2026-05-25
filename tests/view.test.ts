import { describe, expect, it } from "vitest";
import { buildView, pressureCost } from "@/lib/engine/view";
import type { GameConfig, GameState, HistoryEntry } from "@/lib/engine/types";
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
    max_requests_per_round: 1,
    info_mode: { type: "open" },
    pressure: { type: "constant", amount: 1 },
    allocation_policy: { type: "fully_free" },
    master_seed: 1,
  };
}

function stateAt(round: number, history: HistoryEntry[], cfg: GameConfig): GameState {
  return {
    config: cfg,
    round,
    energies: { A1: 8, A2: 6, A3: 5 },
    eliminated: new Set(),
    inboxes: { A1: [], A2: [{ from: "A1", round: round - 1, message: "hi" }], A3: [] },
    history,
    rng: makeRng(1),
  };
}

describe("buildView — information modes", () => {
  const history: HistoryEntry[] = [
    { round: 1, events: [{ kind: "request", from: "A1", to: "A2", message: "r1" }] },
    { round: 2, events: [{ kind: "request", from: "A2", to: "A3", message: "r2" }] },
    { round: 3, events: [{ kind: "request", from: "A3", to: "A1", message: "r3" }] },
    { round: 4, events: [{ kind: "request", from: "A1", to: "A2", message: "r4" }] },
    { round: 5, events: [{ kind: "request", from: "A1", to: "A2", message: "r5" }] },
  ];

  it("open mode → full history", () => {
    const s = stateAt(6, history, { ...baseConfig(), info_mode: { type: "open" } });
    const v = buildView(s, "A1");
    expect(v.history.length).toBe(5);
  });

  it("blind mode → empty history", () => {
    const s = stateAt(6, history, { ...baseConfig(), info_mode: { type: "blind" } });
    const v = buildView(s, "A1");
    expect(v.history).toEqual([]);
  });

  it("partial mode k=3 → last 3 rounds (rounds >= 6-3 = 3)", () => {
    const s = stateAt(6, history, { ...baseConfig(), info_mode: { type: "partial", k: 3 } });
    const v = buildView(s, "A1");
    expect(v.history.map((h) => h.round)).toEqual([3, 4, 5]);
  });
});

describe("buildView — base fields", () => {
  it("includes inbox and energies", () => {
    const s = stateAt(2, [], baseConfig());
    const v = buildView(s, "A2");
    expect(v.agent_id).toBe("A2");
    expect(v.round).toBe(2);
    expect(v.self_energy).toBe(6);
    expect(v.all_energies).toEqual({ A1: 8, A2: 6, A3: 5 });
    expect(v.inbox.length).toBe(1);
    expect(v.inbox[0]!.from).toBe("A1");
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
