import type {
  AgentRuntime,
  DecisionAction,
  DecisionResult,
  DecisionView,
  ResponseAction,
  ResponseResult,
  ResponseView,
} from "@/lib/engine/types";

/**
 * Stub agent strategies for testing.
 *
 * LLM-free, deterministic. The same strategy is consulted in both the decision
 * phase (returns requests + optional pledges) and the response phase (returns
 * allocations + optional pledges).
 */

export type StubStrategy =
  | { type: "always_noop" }
  | { type: "request_poorest"; amount: number; message?: string }
  | { type: "respond_first_inbox"; amount: number; reason?: string }
  | { type: "respond_all_inbox_equally"; total: number }
  // Pledge-aware strategies
  | { type: "pledge_then_honor"; to: string; amount: number; message?: string }
  | { type: "pledge_then_defect"; to: string; amount: number; message?: string };

export function makeStubAgent(id: string, strategy: StubStrategy): AgentRuntime {
  return {
    id,
    decide_phase: async (view: DecisionView): Promise<DecisionResult> => {
      const action = decideForStrategy(view, strategy);
      return { raw: JSON.stringify(action), parsed: action };
    },
    respond_phase: async (view: ResponseView): Promise<ResponseResult> => {
      const action = respondForStrategy(view, strategy);
      return { raw: JSON.stringify(action), parsed: action };
    },
  };
}

function emptyDecision(): DecisionAction {
  return { phase: "decision", requests: [], pledges: [], inner_thought: "" };
}

function emptyResponse(): ResponseAction {
  return { phase: "response", allocations: [], pledges: [], inner_thought: "" };
}

function decideForStrategy(view: DecisionView, strategy: StubStrategy): DecisionAction {
  switch (strategy.type) {
    case "always_noop":
      return emptyDecision();

    case "request_poorest": {
      const target = pickPoorestAlive(view);
      if (target === null) return emptyDecision();
      return {
        phase: "decision",
        requests: [{ target, message: strategy.message ?? "需要资源" }],
        pledges: [],
        inner_thought: "",
      };
    }

    case "respond_first_inbox":
    case "respond_all_inbox_equally":
      // Pure response strategies do nothing in the decision phase
      return emptyDecision();

    case "pledge_then_honor":
    case "pledge_then_defect": {
      if (!isAliveAndOther(view, strategy.to)) return emptyDecision();
      return {
        phase: "decision",
        requests: [],
        pledges: [{ to: strategy.to, amount: strategy.amount }],
        inner_thought: strategy.type === "pledge_then_defect" ? "下回合不给" : "下回合守约",
      };
    }
  }
}

function respondForStrategy(view: ResponseView, strategy: StubStrategy): ResponseAction {
  switch (strategy.type) {
    case "always_noop":
    case "request_poorest":
      return emptyResponse();

    case "respond_first_inbox": {
      if (view.inbox.length === 0) return emptyResponse();
      const first = view.inbox[0]!;
      return {
        phase: "response",
        allocations: [
          {
            to: first.from,
            amount: strategy.amount,
            ...(strategy.reason ? { reason: strategy.reason } : {}),
          },
        ],
        pledges: [],
        inner_thought: "",
      };
    }

    case "respond_all_inbox_equally": {
      if (view.inbox.length === 0) return emptyResponse();
      const per = Math.floor(strategy.total / view.inbox.length);
      if (per <= 0) return emptyResponse();
      return {
        phase: "response",
        allocations: view.inbox.map((m) => ({ to: m.from, amount: per })),
        pledges: [],
        inner_thought: "",
      };
    }

    case "pledge_then_honor": {
      // If this agent has a pending pledge → honor it (allocate exactly the pledged amount)
      const pending = view.pending_pledges;
      if (pending.length === 0) return emptyResponse();
      return {
        phase: "response",
        allocations: pending.map((p) => ({ to: p.to, amount: p.amount, reason: "守约" })),
        pledges: [],
        inner_thought: "守约",
      };
    }

    case "pledge_then_defect": {
      // Has pending pledge but allocates 0 → defects
      return emptyResponse();
    }
  }
}

function pickPoorestAlive(view: DecisionView): string | null {
  const candidates = Object.entries(view.all_energies)
    .filter(([id, e]) => id !== view.agent_id && e > 0)
    .sort((a, b) => (a[1] - b[1] !== 0 ? a[1] - b[1] : a[0].localeCompare(b[0])));
  return candidates[0]?.[0] ?? null;
}

function isAliveAndOther(view: DecisionView, target: string): boolean {
  if (target === view.agent_id) return false;
  const e = view.all_energies[target];
  return typeof e === "number" && e > 0;
}
