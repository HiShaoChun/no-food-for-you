import { describe, expect, it } from "vitest";
import { parseAgentResponse } from "@/lib/agents/parse";

describe("parseAgentResponse — valid actions", () => {
  it("noop", () => {
    const r = parseAgentResponse('{"action":"noop"}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action).toEqual({ action: "noop" });
  });

  it("request", () => {
    const r = parseAgentResponse(
      '{"action":"request","target":"A2","message":"help me"}',
    );
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.action).toEqual({
        action: "request",
        target: "A2",
        message: "help me",
      });
  });

  it("respond", () => {
    const r = parseAgentResponse(
      '{"action":"respond","allocations":[{"to":"A2","amount":3}]}',
    );
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.action).toEqual({
        action: "respond",
        allocations: [{ to: "A2", amount: 3 }],
      });
  });
});

describe("parseAgentResponse — markdown code fences", () => {
  it("strips ```json fence", () => {
    const r = parseAgentResponse('```json\n{"action":"noop"}\n```');
    expect(r.ok).toBe(true);
  });

  it("strips plain ``` fence", () => {
    const r = parseAgentResponse('```\n{"action":"noop"}\n```');
    expect(r.ok).toBe(true);
  });

  it("handles prose before JSON", () => {
    const r = parseAgentResponse(
      '我决定不行动。\n{"action":"noop"}',
    );
    expect(r.ok).toBe(true);
  });
});

describe("parseAgentResponse — invalid", () => {
  it("empty string", () => {
    const r = parseAgentResponse("");
    expect(r.ok).toBe(false);
  });

  it("pure prose", () => {
    const r = parseAgentResponse("我不知道该做什么");
    expect(r.ok).toBe(false);
  });

  it("malformed JSON", () => {
    const r = parseAgentResponse('{"action": noop');
    expect(r.ok).toBe(false);
  });

  it("unknown action", () => {
    const r = parseAgentResponse('{"action":"explode"}');
    expect(r.ok).toBe(false);
  });

  it("request without target", () => {
    const r = parseAgentResponse('{"action":"request","message":"x"}');
    expect(r.ok).toBe(false);
  });

  it("respond with non-integer amount drops that entry", () => {
    const r = parseAgentResponse(
      '{"action":"respond","allocations":[{"to":"A2","amount":1.5},{"to":"A3","amount":2}]}',
    );
    expect(r.ok).toBe(true);
    if (r.ok && r.action.action === "respond") {
      expect(r.action.allocations).toEqual([{ to: "A3", amount: 2 }]);
    }
  });

  it("respond with negative amount drops that entry", () => {
    const r = parseAgentResponse(
      '{"action":"respond","allocations":[{"to":"A2","amount":-3}]}',
    );
    expect(r.ok).toBe(true);
    if (r.ok && r.action.action === "respond") {
      expect(r.action.allocations).toEqual([]);
    }
  });
});
