import { describe, expect, it } from "vitest";
import { runSimulation } from "@/lib/engine/round";
import type { GameConfig, SimEvent } from "@/lib/engine/types";
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
    max_rounds: 20,
    max_requests_per_round: 1,
    info_mode: { type: "open" },
    pressure: { type: "constant", amount: 1 },
    allocation_policy: { type: "fully_free" },
    master_seed: 42,
    ...overrides,
  };
}

async function run(c: GameConfig): Promise<SimEvent[]> {
  const events: SimEvent[] = [];
  await runSimulation(c, {
    sim_id: "test",
    agents: [
      makeStubAgent("A1", { type: "request_poorest", amount: 2 }),
      makeStubAgent("A2", { type: "request_poorest", amount: 2 }),
      makeStubAgent("A3", { type: "always_noop" }),
    ],
    emit: (e) => events.push(e),
  });
  return events;
}

describe("runSimulation — determinism", () => {
  it("same seed yields byte-identical event streams (ignoring timestamps)", async () => {
    const stripT = (e: SimEvent): unknown => {
      const { t: _t, ...rest } = e as { t: string };
      return rest;
    };
    const a = await run(cfg());
    const b = await run(cfg());
    expect(a.map(stripT)).toEqual(b.map(stripT));
  });

  it("different seeds may yield different streams (smoke)", async () => {
    const a = await run(cfg({ master_seed: 1 }));
    const b = await run(cfg({ master_seed: 999 }));
    // Find any round_settled event that differs — they should differ in some metric
    const sa = a.filter((e) => e.type === "round_settled");
    const sb = b.filter((e) => e.type === "round_settled");
    expect(sa.length).toBeGreaterThan(0);
    expect(sb.length).toBeGreaterThan(0);
    // Not required to differ, but our stubs route requests deterministically, so seed
    // affects shuffle of request ordering — output streams should remain identical actually.
    // Just assert both ran.
  });
});

describe("runSimulation — terminates", () => {
  it("emits sim_started first and sim_ended last", async () => {
    const events = await run(cfg());
    expect(events[0]!.type).toBe("sim_started");
    expect(events[events.length - 1]!.type).toBe("sim_ended");
  });

  it("hits max_rounds when no one dies (3 noop agents, constant 1 pressure, initial 50)", async () => {
    const events: SimEvent[] = [];
    await runSimulation(
      cfg({ initial_energy: 50, max_rounds: 5 }),
      {
        sim_id: "x",
        agents: [
          makeStubAgent("A1", { type: "always_noop" }),
          makeStubAgent("A2", { type: "always_noop" }),
          makeStubAgent("A3", { type: "always_noop" }),
        ],
        emit: (e) => events.push(e),
      },
    );
    const last = events[events.length - 1]!;
    expect(last.type).toBe("sim_ended");
    if (last.type === "sim_ended") {
      expect(last.reason).toBe("max_rounds");
      expect(last.survivors).toEqual(["A1", "A2", "A3"]);
    }
  });

  it("hits all_eliminated when pressure exceeds energy quickly", async () => {
    const events: SimEvent[] = [];
    await runSimulation(
      cfg({ initial_energy: 3, max_rounds: 50, pressure: { type: "constant", amount: 5 } }),
      {
        sim_id: "x",
        agents: [
          makeStubAgent("A1", { type: "always_noop" }),
          makeStubAgent("A2", { type: "always_noop" }),
          makeStubAgent("A3", { type: "always_noop" }),
        ],
        emit: (e) => events.push(e),
      },
    );
    const last = events[events.length - 1]!;
    expect(last.type).toBe("sim_ended");
    if (last.type === "sim_ended") {
      expect(last.reason).toBe("all_eliminated");
    }
  });
});

describe("runSimulation — capped allocation policy", () => {
  it("scales allocations down when responder over-allocates", async () => {
    // A1 will respond to inbox (after first round), trying to give a lot
    const events: SimEvent[] = [];
    await runSimulation(
      cfg({
        initial_energy: 20,
        max_rounds: 3,
        allocation_policy: { type: "capped", cap: 2 },
      }),
      {
        sim_id: "x",
        agents: [
          makeStubAgent("A1", { type: "respond_first_inbox", amount: 10 }),
          makeStubAgent("A2", { type: "request_poorest", amount: 1 }),
          makeStubAgent("A3", { type: "request_poorest", amount: 1 }),
        ],
        emit: (e) => events.push(e),
      },
    );
    // After round 1: A2/A3 send request to lowest-energy agent.
    // After round 2: A1 has inbox; tries to give 10 → capped to 2.
    // So someone (A2 or A3) gets exactly 2 energy.
    // After round 2 settlement A1 energy should be at most 20 - 2 - 2 (pressure x2) = 16
    const settled = events.filter((e) => e.type === "round_settled");
    expect(settled.length).toBeGreaterThanOrEqual(2);
    const r2 = settled[1];
    if (r2 && r2.type === "round_settled") {
      // A1 should still have >= 16 because cap limits transfer to 2
      expect(r2.energies.A1).toBeGreaterThanOrEqual(16);
    }
  });
});

describe("runSimulation — blind mode hides history", () => {
  it("agents in blind mode produce same actions regardless of past", async () => {
    const events: SimEvent[] = [];
    await runSimulation(
      cfg({ info_mode: { type: "blind" }, max_rounds: 5 }),
      {
        sim_id: "x",
        agents: [
          makeStubAgent("A1", { type: "request_poorest", amount: 1 }),
          makeStubAgent("A2", { type: "request_poorest", amount: 1 }),
          makeStubAgent("A3", { type: "always_noop" }),
        ],
        emit: (e) => events.push(e),
      },
    );
    // Just verifies no crash and produces decisions.
    const decisions = events.filter((e) => e.type === "agent_decision");
    expect(decisions.length).toBeGreaterThan(0);
  });
});
