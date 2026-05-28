import { describe, expect, it } from "vitest";
import {
  parseDecisionAction,
  parseResponseAction,
  type ParseContext,
} from "@/lib/agents/parse";

const ctx: ParseContext = {
  self_id: "A1",
  alive_ids: new Set(["A1", "A2", "A3"]),
};

// ───── Decision phase parser ─────

describe("parseDecisionAction — valid", () => {
  it("empty arrays + empty inner_thought", () => {
    const r = parseDecisionAction(
      '{"requests":[],"pledges":[],"inner_thought":""}',
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action.phase).toBe("decision");
      expect(r.action.requests).toEqual([]);
      expect(r.action.pledges).toEqual([]);
      expect(r.action.inner_thought).toBe("");
    }
  });

  it("missing inner_thought defaults to empty string", () => {
    const r = parseDecisionAction('{"requests":[],"pledges":[]}', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.inner_thought).toBe("");
  });

  it("request with target and message", () => {
    const r = parseDecisionAction(
      '{"requests":[{"target":"A2","message":"给我 2"}],"pledges":[],"inner_thought":"x"}',
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action.requests).toEqual([{ target: "A2", message: "给我 2" }]);
      expect(r.action.inner_thought).toBe("x");
    }
  });

  it("pledge with to and amount", () => {
    const r = parseDecisionAction(
      '{"requests":[],"pledges":[{"to":"A2","amount":2}],"inner_thought":""}',
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.pledges).toEqual([{ to: "A2", amount: 2 }]);
  });

  it("strips markdown code fence", () => {
    const r = parseDecisionAction(
      '```json\n{"requests":[],"pledges":[],"inner_thought":""}\n```',
      ctx,
    );
    expect(r.ok).toBe(true);
  });
});

describe("parseDecisionAction — pledge filtering", () => {
  it("drops self-pledge", () => {
    const r = parseDecisionAction(
      '{"requests":[],"pledges":[{"to":"A1","amount":2}],"inner_thought":""}',
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.pledges).toEqual([]);
  });

  it("drops dead-target pledge", () => {
    const r = parseDecisionAction(
      '{"requests":[],"pledges":[{"to":"A9","amount":2}],"inner_thought":""}',
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.pledges).toEqual([]);
  });

  it("drops zero / negative / non-integer amounts", () => {
    const r = parseDecisionAction(
      '{"requests":[],"pledges":[{"to":"A2","amount":0},{"to":"A3","amount":-1},{"to":"A2","amount":1.5}],"inner_thought":""}',
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.pledges).toEqual([]);
  });

  it("truncates >3 pledges and sets policy_truncated", () => {
    const r = parseDecisionAction(
      JSON.stringify({
        requests: [],
        pledges: [
          { to: "A2", amount: 1 },
          { to: "A3", amount: 2 },
          { to: "A2", amount: 3 },
          { to: "A3", amount: 4 },
          { to: "A2", amount: 5 },
        ],
        inner_thought: "",
      }),
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action.pledges.length).toBe(3);
      expect(r.policy_truncated).toBe(true);
    }
  });

  it("ignores agent-supplied from / round_made fields", () => {
    const r = parseDecisionAction(
      '{"requests":[],"pledges":[{"to":"A2","amount":1,"from":"A99","due_round":42}],"inner_thought":""}',
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      // parsed pledge only has to and amount; engine injects from/due_round later
      expect(r.action.pledges).toEqual([{ to: "A2", amount: 1 }]);
    }
  });
});

describe("parseDecisionAction — request filtering", () => {
  it("drops self-target request", () => {
    const r = parseDecisionAction(
      '{"requests":[{"target":"A1","message":"give"}],"pledges":[],"inner_thought":""}',
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.requests).toEqual([]);
  });

  it("drops dead-target request", () => {
    const r = parseDecisionAction(
      '{"requests":[{"target":"A9","message":"give"}],"pledges":[],"inner_thought":""}',
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.requests).toEqual([]);
  });

  it("truncates >3 requests", () => {
    const r = parseDecisionAction(
      JSON.stringify({
        requests: [
          { target: "A2", message: "a" },
          { target: "A3", message: "b" },
          { target: "A2", message: "c" },
          { target: "A3", message: "d" },
        ],
        pledges: [],
        inner_thought: "",
      }),
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action.requests.length).toBe(3);
      expect(r.policy_truncated).toBe(true);
    }
  });
});

describe("parseDecisionAction — invalid", () => {
  it("empty string", () => {
    expect(parseDecisionAction("", ctx).ok).toBe(false);
  });
  it("malformed JSON", () => {
    expect(parseDecisionAction("{not json", ctx).ok).toBe(false);
  });
});

describe("parseDecisionAction — truncated output repair", () => {
  it("salvages requests/pledges when inner_thought string is cut off mid-value", () => {
    // Real-world case: max_tokens hit while writing a verbose inner_thought.
    // The string and outer object are both unclosed.
    const truncated =
      '```json\n{\n  "requests": [{"target":"A2","message":"hi"}],\n' +
      '  "pledges": [{"to":"A2","amount":1}],\n' +
      '  "inner_thought": "Round 1 strategy: small pledges to build trust, plan to fulfill. The +3 solo betrayal is tempting but being marked untrustworthy';
    const r = parseDecisionAction(truncated, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action.requests).toEqual([{ target: "A2", message: "hi" }]);
      expect(r.action.pledges).toEqual([{ to: "A2", amount: 1 }]);
    }
  });

  it("salvages when truncation lands right after a key-colon (no value yet)", () => {
    // e.g. `..., "inner_thought":` — the dangling `"key":` must be stripped
    // before we close the object or JSON.parse will reject `:}`.
    const truncated =
      '{"requests":[],"pledges":[{"to":"A2","amount":1}],"inner_thought":';
    const r = parseDecisionAction(truncated, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.pledges).toEqual([{ to: "A2", amount: 1 }]);
  });

  it("salvages when truncation lands inside an array element string", () => {
    const truncated =
      '{"requests":[{"target":"A2","message":"please give me 2 points back this round because';
    const r = parseDecisionAction(truncated, ctx);
    // requests array can't be salvaged cleanly here (the open string belongs to
    // an incomplete element); but the parser should not crash, and either
    // succeeds with empty arrays or fails gracefully.
    if (r.ok) {
      expect(Array.isArray(r.action.requests)).toBe(true);
    } else {
      expect(typeof r.error).toBe("string");
    }
  });
});

// ───── Response phase parser ─────

describe("parseResponseAction — valid", () => {
  it("empty arrays", () => {
    const r = parseResponseAction(
      '{"allocations":[],"pledges":[],"inner_thought":""}',
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action.phase).toBe("response");
      expect(r.action.allocations).toEqual([]);
    }
  });

  it("allocation with reason", () => {
    const r = parseResponseAction(
      '{"allocations":[{"to":"A2","amount":3,"reason":"看你撑"}],"pledges":[],"inner_thought":""}',
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action.allocations).toEqual([
        { to: "A2", amount: 3, reason: "看你撑" },
      ]);
    }
  });

  it("drops non-integer / negative allocation amounts", () => {
    const r = parseResponseAction(
      '{"allocations":[{"to":"A2","amount":1.5},{"to":"A3","amount":-2},{"to":"A2","amount":3}],"pledges":[],"inner_thought":""}',
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.allocations).toEqual([{ to: "A2", amount: 3 }]);
  });

  it("drops self-allocation", () => {
    const r = parseResponseAction(
      '{"allocations":[{"to":"A1","amount":2}],"pledges":[],"inner_thought":""}',
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.allocations).toEqual([]);
  });

  it("drops empty/whitespace reason", () => {
    const r = parseResponseAction(
      '{"allocations":[{"to":"A2","amount":3,"reason":"   "}],"pledges":[],"inner_thought":""}',
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action.allocations[0]!.reason).toBeUndefined();
  });
});

