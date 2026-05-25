import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { createSim, emitEvent, subscribe, isRegistered, flushWrites } from "@/lib/registry";
import type { SimEvent } from "@/lib/engine/types";
import { runSimulation } from "@/lib/engine/round";
import { makeStubAgent } from "@/lib/agents/stub-agent";
import type { GameConfig } from "@/lib/engine/types";

const RUNS_DIR = path.resolve(process.cwd(), "runs");

const testSimIds: string[] = [];

afterEach(async () => {
  // Clean up any test JSONL files
  for (const id of testSimIds) {
    try {
      await fs.unlink(path.join(RUNS_DIR, `${id}.jsonl`));
    } catch {
      // ignore
    }
  }
  testSimIds.length = 0;
});

describe("registry", () => {
  it("createSim registers and writes empty file", async () => {
    const sim_id = "test-create-" + Date.now();
    testSimIds.push(sim_id);
    await createSim(sim_id);
    expect(isRegistered(sim_id)).toBe(true);
    const content = await fs.readFile(path.join(RUNS_DIR, `${sim_id}.jsonl`), "utf8");
    expect(content).toBe("");
  });

  it("emitEvent appends to JSONL and pushes to subscribers", async () => {
    const sim_id = "test-emit-" + Date.now();
    testSimIds.push(sim_id);
    await createSim(sim_id);

    const received: SimEvent[] = [];
    const sub = subscribe(sim_id, (e) => received.push(e));
    expect(sub).not.toBeNull();

    const ev: SimEvent = {
      type: "round_started",
      sim_id,
      round: 1,
      t: new Date().toISOString(),
    };
    await emitEvent(sim_id, ev);

    expect(received).toEqual([ev]);
    const content = await fs.readFile(path.join(RUNS_DIR, `${sim_id}.jsonl`), "utf8");
    expect(content.trim()).toBe(JSON.stringify(ev));

    sub!.unsubscribe();
  });

  it("late subscriber receives backlog", async () => {
    const sim_id = "test-backlog-" + Date.now();
    testSimIds.push(sim_id);
    await createSim(sim_id);

    const ev1: SimEvent = { type: "round_started", sim_id, round: 1, t: new Date().toISOString() };
    const ev2: SimEvent = { type: "round_started", sim_id, round: 2, t: new Date().toISOString() };
    await emitEvent(sim_id, ev1);
    await emitEvent(sim_id, ev2);

    const sub = subscribe(sim_id, () => {});
    expect(sub!.backlog).toEqual([ev1, ev2]);
    sub!.unsubscribe();
  });

  it("unknown sim_id returns null on subscribe", () => {
    expect(subscribe("nonexistent", () => {})).toBeNull();
  });
});

describe("integration — full sim writes valid JSONL", () => {
  function smallConfig(): GameConfig {
    return {
      agents: [
        { id: "A1", display_name: "A1", model_key: "doubao-seed-code" },
        { id: "A2", display_name: "A2", model_key: "doubao-seed-code" },
        { id: "A3", display_name: "A3", model_key: "doubao-seed-code" },
      ],
      shared_system_prompt: "test",
      initial_energy: 5,
      max_rounds: 3,
      max_requests_per_round: 1,
      info_mode: { type: "open" },
      pressure: { type: "constant", amount: 1 },
      allocation_policy: { type: "fully_free" },
      master_seed: 7,
    };
  }

  it("produces valid JSONL with sim_started first and sim_ended last", async () => {
    const sim_id = "test-int-" + Date.now();
    testSimIds.push(sim_id);
    await createSim(sim_id);

    await runSimulation(smallConfig(), {
      sim_id,
      agents: [
        makeStubAgent("A1", { type: "always_noop" }),
        makeStubAgent("A2", { type: "always_noop" }),
        makeStubAgent("A3", { type: "always_noop" }),
      ],
      emit: (e) => {
        void emitEvent(sim_id, e);
      },
    });

    // Flush serialized write queue
    await flushWrites(sim_id);

    const content = await fs.readFile(path.join(RUNS_DIR, `${sim_id}.jsonl`), "utf8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBeGreaterThan(0);

    // Every line is valid JSON
    const parsed = lines.map((l) => JSON.parse(l) as SimEvent);
    expect(parsed[0]!.type).toBe("sim_started");
    expect(parsed[parsed.length - 1]!.type).toBe("sim_ended");

    // Has the expected number of round_settled events (one per round run)
    const settled = parsed.filter((e) => e.type === "round_settled");
    expect(settled.length).toBe(3); // max_rounds=3
  });
});
