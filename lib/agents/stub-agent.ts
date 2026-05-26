import type { AgentDecisionResult, AgentRuntime, AgentView } from "@/lib/engine/types";

/**
 * Stub agent strategies for testing.
 *
 * LLM-free, deterministic, and seedable via the engine's RNG (which is shared
 * via the view's `all_energies` snapshot — strategies don't need their own RNG).
 */

export type StubStrategy =
  | { type: "always_noop" }
  | { type: "request_poorest"; amount: number; message?: string }
  | { type: "respond_first_inbox"; amount: number; reason?: string }
  | { type: "respond_all_inbox_equally"; total: number };

export function makeStubAgent(id: string, strategy: StubStrategy): AgentRuntime {
  return {
    id,
    decide: async (view: AgentView): Promise<AgentDecisionResult> => {
      const action = decideStub(view, strategy);
      const raw = JSON.stringify(action);
      return { raw, parsed: action };
    },
  };
}

function decideStub(
  view: AgentView,
  strategy: StubStrategy,
): AgentDecisionResult["parsed"] {
  switch (strategy.type) {
    case "always_noop":
      return { action: "noop" };

    case "request_poorest": {
      // Pick the living non-self agent with the lowest energy; deterministic tie-break by id.
      const candidates = Object.entries(view.all_energies)
        .filter(([id, e]) => id !== view.agent_id && e > 0)
        .sort((a, b) => (a[1] - b[1] !== 0 ? a[1] - b[1] : a[0].localeCompare(b[0])));
      const target = candidates[0]?.[0];
      if (!target) return { action: "noop" };
      return {
        action: "request",
        target,
        message: strategy.message ?? "需要资源",
      };
    }

    case "respond_first_inbox": {
      if (view.inbox.length === 0) return { action: "noop" };
      const first = view.inbox[0]!;
      return {
        action: "respond",
        allocations: [
          {
            to: first.from,
            amount: strategy.amount,
            ...(strategy.reason ? { reason: strategy.reason } : {}),
          },
        ],
      };
    }

    case "respond_all_inbox_equally": {
      if (view.inbox.length === 0) return { action: "noop" };
      const per = Math.floor(strategy.total / view.inbox.length);
      if (per <= 0) return { action: "noop" };
      return {
        action: "respond",
        allocations: view.inbox.map((m) => ({ to: m.from, amount: per })),
      };
    }
  }
}
