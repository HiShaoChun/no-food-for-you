import type { AgentAction } from "@/lib/engine/types";

export type ParseResult =
  | { ok: true; action: AgentAction }
  | { ok: false; error: string };

/**
 * Strip markdown code fences ( ```json ... ``` or ``` ... ``` ) and try to JSON.parse.
 * Then validate the shape matches one of the three action variants.
 */
export function parseAgentResponse(raw: string): ParseResult {
  const cleaned = stripCodeFence(raw).trim();
  if (cleaned.length === 0) return { ok: false, error: "empty_response" };

  // Some models wrap a JSON object inside prose. Try to find the first {...} block.
  const jsonText = extractFirstJsonObject(cleaned);
  if (jsonText === null) return { ok: false, error: "no_json_found" };

  let obj: unknown;
  try {
    obj = JSON.parse(jsonText);
  } catch (e) {
    return { ok: false, error: `json_parse_failed: ${(e as Error).message}` };
  }

  return validateAction(obj);
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  // ```json\n...\n``` or ```\n...\n```
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/m;
  const m = fence.exec(trimmed);
  if (m && m[1] !== undefined) return m[1];
  return trimmed;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (esc) {
      esc = false;
      continue;
    }
    if (inStr) {
      if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function validateAction(obj: unknown): ParseResult {
  if (typeof obj !== "object" || obj === null) {
    return { ok: false, error: "not_an_object" };
  }
  const o = obj as Record<string, unknown>;
  const action = o.action;
  if (action === "noop") {
    return { ok: true, action: { action: "noop" } };
  }
  if (action === "request") {
    if (typeof o.target !== "string" || o.target.length === 0) {
      return { ok: false, error: "request_missing_target" };
    }
    if (typeof o.message !== "string") {
      return { ok: false, error: "request_missing_message" };
    }
    return {
      ok: true,
      action: { action: "request", target: o.target, message: o.message },
    };
  }
  if (action === "respond") {
    if (!Array.isArray(o.allocations)) {
      return { ok: false, error: "respond_allocations_not_array" };
    }
    const allocs: { to: string; amount: number }[] = [];
    for (const a of o.allocations) {
      if (typeof a !== "object" || a === null) continue;
      const ar = a as Record<string, unknown>;
      if (typeof ar.to !== "string" || typeof ar.amount !== "number") continue;
      // Drop non-integer / non-positive at validate time (settle.ts will also guard)
      if (!Number.isInteger(ar.amount) || ar.amount <= 0) continue;
      allocs.push({ to: ar.to, amount: ar.amount });
    }
    return {
      ok: true,
      action: { action: "respond", allocations: allocs },
    };
  }
  return { ok: false, error: `unknown_action: ${String(action)}` };
}
