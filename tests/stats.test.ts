import { describe, expect, it } from "vitest";
import { computeStats, rankedStandings } from "@/lib/stats/aggregate";
import type { AgentInstance, SimEvent } from "@/lib/engine/types";

const agents: AgentInstance[] = [
  { id: "A1", display_name: "A1", model_key: "doubao-seed-code" },
  { id: "A2", display_name: "A2", model_key: "doubao-seed-code" },
  { id: "A3", display_name: "A3", model_key: "doubao-seed-code" },
];

function evt(e: Partial<SimEvent> & { type: SimEvent["type"]; sim_id?: string; t?: string }): SimEvent {
  return { sim_id: "x", t: "2026-05-26T00:00:00Z", ...e } as SimEvent;
}

describe("computeStats", () => {
  it("counts requests and responses from agent_decision events", () => {
    const events: SimEvent[] = [
      evt({
        type: "agent_decision",
        round: 1,
        agent: "A1",
        raw: "",
        parsed: { action: "request", target: "A2", message: "help" },
      }),
      evt({
        type: "agent_decision",
        round: 1,
        agent: "A2",
        raw: "",
        parsed: { action: "respond", allocations: [{ to: "A1", amount: 1 }] },
      }),
      evt({
        type: "agent_decision",
        round: 1,
        agent: "A3",
        raw: "",
        parsed: { action: "noop" },
      }),
      evt({
        type: "round_settled",
        round: 1,
        prev_energies: { A1: 10, A2: 10, A3: 10 },
        energies: { A1: 10, A2: 8, A3: 9 },
        transfers: [{ from: "A2", to: "A1", amount: 1 }],
        pressure_cost: 1,
        eliminated: [],
      }),
      evt({ type: "sim_ended", reason: "max_rounds", survivors: ["A1", "A2", "A3"] }),
    ];
    const s = computeStats(agents, events);
    const byId = Object.fromEntries(s.per_agent.map((a) => [a.id, a]));
    expect(byId.A1!.requests).toBe(1);
    expect(byId.A2!.responses).toBe(1);
    expect(byId.A3!.requests).toBe(0);
  });

  it("uses transfers (ground truth) for given/received, not agent-declared amounts", () => {
    const events: SimEvent[] = [
      evt({
        type: "agent_decision",
        round: 1,
        agent: "A1",
        raw: "",
        parsed: {
          action: "respond",
          allocations: [{ to: "A2", amount: 10 }], // declared 10
        },
      }),
      evt({
        type: "round_settled",
        round: 1,
        prev_energies: { A1: 10, A2: 10, A3: 10 },
        energies: { A1: 8, A2: 11, A3: 9 },
        transfers: [{ from: "A1", to: "A2", amount: 1 }], // policy truncated to 1
        pressure_cost: 1,
        eliminated: [],
      }),
      evt({ type: "sim_ended", reason: "max_rounds", survivors: ["A1", "A2", "A3"] }),
    ];
    const s = computeStats(agents, events);
    const a1 = s.per_agent.find((a) => a.id === "A1")!;
    const a2 = s.per_agent.find((a) => a.id === "A2")!;
    expect(a1.given).toBe(1); // not 10
    expect(a2.received).toBe(1);
  });

  it("tracks alive_rounds and eliminated_at correctly", () => {
    const events: SimEvent[] = [
      evt({
        type: "round_settled",
        round: 1,
        prev_energies: { A1: 10, A2: 10, A3: 10 },
        energies: { A1: 9, A2: 9, A3: 9 },
        transfers: [],
        pressure_cost: 1,
        eliminated: [],
      }),
      evt({
        type: "round_settled",
        round: 2,
        prev_energies: { A1: 9, A2: 9, A3: 9 },
        energies: { A1: 0, A2: 8, A3: 8 },
        transfers: [],
        pressure_cost: 1,
        eliminated: ["A1"],
      }),
      evt({
        type: "round_settled",
        round: 3,
        prev_energies: { A1: 0, A2: 8, A3: 8 },
        energies: { A1: 0, A2: 7, A3: 7 },
        transfers: [],
        pressure_cost: 1,
        eliminated: [],
      }),
      evt({ type: "sim_ended", reason: "max_rounds", survivors: ["A2", "A3"] }),
    ];
    const s = computeStats(agents, events);
    const a1 = s.per_agent.find((a) => a.id === "A1")!;
    const a2 = s.per_agent.find((a) => a.id === "A2")!;
    expect(a1.eliminated_at).toBe(2);
    expect(a1.alive_rounds).toBe(2); // alive during rounds 1 and 2 (died at end of 2)
    expect(a1.is_survivor).toBe(false);
    expect(a2.alive_rounds).toBe(3);
    expect(a2.is_survivor).toBe(true);
  });

  it("computes awards correctly", () => {
    const events: SimEvent[] = [
      evt({
        type: "agent_decision",
        round: 1,
        agent: "A1",
        raw: "",
        parsed: { action: "request", target: "A2", message: "x" },
      }),
      evt({
        type: "agent_decision",
        round: 2,
        agent: "A1",
        raw: "",
        parsed: { action: "request", target: "A2", message: "y" },
      }),
      evt({
        type: "round_settled",
        round: 1,
        prev_energies: { A1: 10, A2: 10, A3: 10 },
        energies: { A1: 11, A2: 7, A3: 9 },
        transfers: [{ from: "A2", to: "A1", amount: 2 }],
        pressure_cost: 1,
        eliminated: [],
      }),
      evt({ type: "sim_ended", reason: "max_rounds", survivors: ["A1", "A2", "A3"] }),
    ];
    const s = computeStats(agents, events);
    expect(s.most_generous?.id).toBe("A2"); // gave 2
    expect(s.most_dependent?.id).toBe("A1"); // 2 requests
  });

  it("rankedStandings puts survivors first then eliminated by round desc", () => {
    const stats = [
      {
        id: "A1",
        display_name: "A1",
        given: 0,
        received: 0,
        requests: 0,
        responses: 0,
        alive_rounds: 5,
        eliminated_at: null,
        final_energy: 3,
        is_survivor: true,
      },
      {
        id: "A2",
        display_name: "A2",
        given: 0,
        received: 0,
        requests: 0,
        responses: 0,
        alive_rounds: 2,
        eliminated_at: 2,
        final_energy: 0,
        is_survivor: false,
      },
      {
        id: "A3",
        display_name: "A3",
        given: 0,
        received: 0,
        requests: 0,
        responses: 0,
        alive_rounds: 4,
        eliminated_at: 4,
        final_energy: 0,
        is_survivor: false,
      },
      {
        id: "A4",
        display_name: "A4",
        given: 0,
        received: 0,
        requests: 0,
        responses: 0,
        alive_rounds: 5,
        eliminated_at: null,
        final_energy: 5,
        is_survivor: true,
      },
    ];
    const ranked = rankedStandings(stats);
    expect(ranked.map((r) => r.id)).toEqual(["A4", "A1", "A3", "A2"]);
  });

  it("falls back gracefully when transfers missing (legacy log)", () => {
    const events: SimEvent[] = [
      {
        type: "round_settled",
        sim_id: "x",
        round: 1,
        // No prev_energies, transfers, pressure_cost in old log
        energies: { A1: 9, A2: 9, A3: 9 },
        eliminated: [],
        t: "2026-05-26T00:00:00Z",
      } as unknown as SimEvent,
      evt({ type: "sim_ended", reason: "max_rounds", survivors: ["A1", "A2", "A3"] }),
    ];
    const s = computeStats(agents, events);
    // Should not crash; given/received both 0 since no transfers available
    expect(s.per_agent.every((a) => a.given === 0 && a.received === 0)).toBe(true);
  });
});
