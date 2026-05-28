import { describe, expect, it } from "vitest";
import { runSimulation } from "@/lib/engine/round";
import type {
  AgentRuntime,
  DecisionResult,
  DecisionView,
  GameConfig,
  ResponseResult,
  ResponseView,
  SimEvent,
} from "@/lib/engine/types";
import { makeStubAgent } from "@/lib/agents/stub-agent";

function cfg(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    agents: [
      { id: "A1", display_name: "A1", model_key: "doubao-seed-code" },
      { id: "A2", display_name: "A2", model_key: "doubao-seed-code" },
      { id: "A3", display_name: "A3", model_key: "doubao-seed-code" },
    ],
    shared_system_prompt: "test",
    initial_energy: 10,
    max_rounds: 1,
    pressure: { type: "constant", amount: 1 },
    allocation_policy: { type: "fully_free" },
    master_seed: 42,
    pledges: { enabled: true, betrayal_bonus_table: [3, 1, 0, -2], keep_promise_bonus: 0 },
    ...overrides,
  };
}

/** Stub that waits `ms` before resolving each phase, so we can control completion order. */
function makeDelayedStubAgent(id: string, ms: number): AgentRuntime {
  const inner = makeStubAgent(id, { type: "always_noop" });
  return {
    id,
    decide_phase: async (view: DecisionView): Promise<DecisionResult> => {
      await new Promise((r) => setTimeout(r, ms));
      return inner.decide_phase(view);
    },
    respond_phase: async (view: ResponseView): Promise<ResponseResult> => {
      await new Promise((r) => setTimeout(r, ms));
      return inner.respond_phase(view);
    },
  };
}

/** Stub that throws inside the phase to verify the engine still emits a parsed:null phase event. */
function makeThrowingStubAgent(id: string): AgentRuntime {
  return {
    id,
    decide_phase: async (): Promise<DecisionResult> => {
      throw new Error("simulated_llm_failure");
    },
    respond_phase: async (): Promise<ResponseResult> => {
      throw new Error("simulated_llm_failure");
    },
  };
}

async function collect(c: GameConfig, agents: AgentRuntime[]): Promise<SimEvent[]> {
  const events: SimEvent[] = [];
  await runSimulation(c, {
    sim_id: "test",
    agents,
    emit: (e) => events.push(e),
  });
  return events;
}

describe("streaming — phase start events", () => {
  it("emits agent_decision_started before agent_decision_phase for each agent", async () => {
    const events = await collect(cfg(), [
      makeStubAgent("A1", { type: "always_noop" }),
      makeStubAgent("A2", { type: "always_noop" }),
      makeStubAgent("A3", { type: "always_noop" }),
    ]);
    for (const id of ["A1", "A2", "A3"]) {
      const startedIdx = events.findIndex(
        (e) => e.type === "agent_decision_started" && e.agent === id,
      );
      const phaseIdx = events.findIndex(
        (e) => e.type === "agent_decision_phase" && e.agent === id,
      );
      expect(startedIdx).toBeGreaterThanOrEqual(0);
      expect(phaseIdx).toBeGreaterThanOrEqual(0);
      expect(startedIdx).toBeLessThan(phaseIdx);
    }
  });

  it("emits agent_response_started before agent_response_phase for each agent", async () => {
    const events = await collect(cfg(), [
      makeStubAgent("A1", { type: "always_noop" }),
      makeStubAgent("A2", { type: "always_noop" }),
      makeStubAgent("A3", { type: "always_noop" }),
    ]);
    for (const id of ["A1", "A2", "A3"]) {
      const startedIdx = events.findIndex(
        (e) => e.type === "agent_response_started" && e.agent === id,
      );
      const phaseIdx = events.findIndex(
        (e) => e.type === "agent_response_phase" && e.agent === id,
      );
      expect(startedIdx).toBeGreaterThanOrEqual(0);
      expect(phaseIdx).toBeGreaterThanOrEqual(0);
      expect(startedIdx).toBeLessThan(phaseIdx);
    }
  });

  it("started events carry only minimal fields (no raw / parsed / tokens)", async () => {
    const events = await collect(cfg(), [
      makeStubAgent("A1", { type: "always_noop" }),
      makeStubAgent("A2", { type: "always_noop" }),
      makeStubAgent("A3", { type: "always_noop" }),
    ]);
    const decStarted = events.filter((e) => e.type === "agent_decision_started");
    expect(decStarted.length).toBe(3);
    for (const e of decStarted) {
      if (e.type !== "agent_decision_started") continue;
      expect(e.phase).toBe("decision");
      expect((e as unknown as Record<string, unknown>).raw).toBeUndefined();
      expect((e as unknown as Record<string, unknown>).parsed).toBeUndefined();
      expect((e as unknown as Record<string, unknown>).tokens).toBeUndefined();
    }
  });

  it("every decision_started is emitted before any decision_phase (broadcast first)", async () => {
    const events = await collect(cfg(), [
      makeStubAgent("A1", { type: "always_noop" }),
      makeStubAgent("A2", { type: "always_noop" }),
      makeStubAgent("A3", { type: "always_noop" }),
    ]);
    const lastStartedIdx = events.reduce(
      (acc, e, i) => (e.type === "agent_decision_started" ? i : acc),
      -1,
    );
    const firstPhaseIdx = events.findIndex((e) => e.type === "agent_decision_phase");
    expect(lastStartedIdx).toBeGreaterThanOrEqual(0);
    expect(firstPhaseIdx).toBeGreaterThanOrEqual(0);
    expect(lastStartedIdx).toBeLessThan(firstPhaseIdx);
  });
});

describe("streaming — per-agent completion order", () => {
  it("faster agent's decision_phase event emits before slower agent's", async () => {
    // A1 is fast (5ms), A2 is slow (60ms). Expectation: A1's phase event appears first in events array.
    const events = await collect(cfg(), [
      makeDelayedStubAgent("A1", 5),
      makeDelayedStubAgent("A2", 60),
      makeStubAgent("A3", { type: "always_noop" }),
    ]);
    const a1Idx = events.findIndex(
      (e) => e.type === "agent_decision_phase" && e.agent === "A1",
    );
    const a2Idx = events.findIndex(
      (e) => e.type === "agent_decision_phase" && e.agent === "A2",
    );
    expect(a1Idx).toBeGreaterThan(-1);
    expect(a2Idx).toBeGreaterThan(-1);
    expect(a1Idx).toBeLessThan(a2Idx);
  });
});

describe("streaming — phase boundaries are strict", () => {
  it("all decision_phase events precede any response_started event", async () => {
    const events = await collect(cfg(), [
      makeStubAgent("A1", { type: "always_noop" }),
      makeStubAgent("A2", { type: "always_noop" }),
      makeStubAgent("A3", { type: "always_noop" }),
    ]);
    const lastDecPhaseIdx = events.reduce(
      (acc, e, i) => (e.type === "agent_decision_phase" ? i : acc),
      -1,
    );
    const firstResStartedIdx = events.findIndex((e) => e.type === "agent_response_started");
    expect(lastDecPhaseIdx).toBeGreaterThanOrEqual(0);
    expect(firstResStartedIdx).toBeGreaterThanOrEqual(0);
    expect(lastDecPhaseIdx).toBeLessThan(firstResStartedIdx);
  });

  it("all response_phase events precede round_settled", async () => {
    const events = await collect(cfg(), [
      makeStubAgent("A1", { type: "always_noop" }),
      makeStubAgent("A2", { type: "always_noop" }),
      makeStubAgent("A3", { type: "always_noop" }),
    ]);
    const lastResPhaseIdx = events.reduce(
      (acc, e, i) => (e.type === "agent_response_phase" ? i : acc),
      -1,
    );
    const settledIdx = events.findIndex((e) => e.type === "round_settled");
    expect(lastResPhaseIdx).toBeGreaterThanOrEqual(0);
    expect(settledIdx).toBeGreaterThanOrEqual(0);
    expect(lastResPhaseIdx).toBeLessThan(settledIdx);
  });
});

describe("streaming — failure modes", () => {
  it("throwing agent runtime still emits a parsed:null phase event (no orphan placeholder)", async () => {
    // A1's decide_phase / respond_phase reject. Engine SHALL still emit an
    // agent_decision_phase / agent_response_phase event for A1 with parsed:null
    // and a parse_error — otherwise the UI's thinking placeholder would never
    // be replaced and the sim couldn't progress.
    const events = await collect(cfg(), [
      makeThrowingStubAgent("A1"),
      makeStubAgent("A2", { type: "always_noop" }),
      makeStubAgent("A3", { type: "always_noop" }),
    ]);

    const decStarted = events.filter((e) => e.type === "agent_decision_started");
    const decPhase = events.filter((e) => e.type === "agent_decision_phase");
    expect(decStarted.length).toBe(3);
    expect(decPhase.length).toBe(3);

    const a1Phase = decPhase.find(
      (e) => e.type === "agent_decision_phase" && e.agent === "A1",
    );
    expect(a1Phase).toBeDefined();
    if (a1Phase && a1Phase.type === "agent_decision_phase") {
      expect(a1Phase.parsed).toBeNull();
      expect(a1Phase.parse_error).toMatch(/agent_error/);
    }
  });
});
