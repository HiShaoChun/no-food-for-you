import type {
  DecisionAction,
  PledgeRequest,
  ResponseAction,
} from "@/lib/engine/types";

export const MAX_PLEDGES_PER_PHASE = 3;
export const MAX_REQUESTS_PER_PHASE = 3;

export type ParseContext = {
  self_id: string;
  alive_ids: ReadonlySet<string>;
};

export type DecisionParseResult =
  | { ok: true; action: DecisionAction; policy_truncated?: boolean }
  | { ok: false; error: string };

export type ResponseParseResult =
  | { ok: true; action: ResponseAction; policy_truncated?: boolean }
  | { ok: false; error: string };

/**
 * Strip markdown code fences ( ```json ... ``` or ``` ... ``` ) and try to JSON.parse
 * the FIRST balanced {...} block found in the text.
 */
function extractJsonObject(raw: string): { ok: true; obj: unknown } | { ok: false; error: string } {
  const cleaned = stripCodeFence(raw).trim();
  if (cleaned.length === 0) return { ok: false, error: "empty_response" };
  const jsonText = extractFirstJsonObject(cleaned);
  if (jsonText === null) return { ok: false, error: "no_json_found" };
  try {
    return { ok: true, obj: JSON.parse(jsonText) };
  } catch (e) {
    return { ok: false, error: `json_parse_failed: ${(e as Error).message}` };
  }
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/m;
  const m = fence.exec(trimmed);
  if (m && m[1] !== undefined) return m[1];
  return trimmed;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  const stack: ("{" | "[")[] = [];
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
    else if (ch === "{") stack.push("{");
    else if (ch === "[") stack.push("[");
    else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0 && ch === "}") return text.slice(start, i + 1);
    }
  }
  // Truncated mid-output (e.g. max_tokens hit while writing a long string field).
  // Try to salvage: close the open string and remaining brackets so valid earlier
  // fields still parse through.
  return repairTruncatedJson(text.slice(start), stack, inStr);
}

function repairTruncatedJson(
  body: string,
  stack: readonly ("{" | "[")[],
  inStr: boolean,
): string | null {
  if (stack.length === 0) return null;
  let repaired = inStr ? body + '"' : body;
  // Drop dangling tokens that would make closing invalid:
  //   trailing `,`              → `,}` is invalid
  //   trailing `"key":` or `:`  → `:}` is invalid (no value yet)
  let end = repaired.length;
  while (end > 0) {
    const ch = repaired[end - 1]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === ",") {
      end--;
      continue;
    }
    if (ch === ":") {
      end--; // drop :
      while (end > 0) {
        const c = repaired[end - 1]!;
        if (c === " " || c === "\t" || c === "\n" || c === "\r") end--;
        else break;
      }
      // drop preceding key string "..."
      if (end > 0 && repaired[end - 1] === '"') {
        end--; // consume closing "
        while (end > 0) {
          if (repaired[end - 1] === '"') {
            // ensure it's not an escaped quote
            let backslashes = 0;
            let k = end - 2;
            while (k >= 0 && repaired[k] === "\\") {
              backslashes++;
              k--;
            }
            if (backslashes % 2 === 0) {
              end--; // consume opening "
              break;
            }
          }
          end--;
        }
      }
      continue;
    }
    break;
  }
  repaired = repaired.slice(0, end);
  for (let i = stack.length - 1; i >= 0; i--) {
    repaired += stack[i] === "{" ? "}" : "]";
  }
  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return null;
  }
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function validatePledgeArray(
  raw: unknown,
  ctx: ParseContext,
): { pledges: PledgeRequest[]; truncated: boolean } {
  if (!Array.isArray(raw)) return { pledges: [], truncated: false };
  const out: PledgeRequest[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const to = asString(o.to);
    const amount = typeof o.amount === "number" ? o.amount : NaN;
    if (to === null || to.length === 0) continue;
    if (!Number.isInteger(amount) || amount <= 0) continue;
    if (to === ctx.self_id) continue;
    if (!ctx.alive_ids.has(to)) continue;
    out.push({ to, amount });
  }
  const truncated = out.length > MAX_PLEDGES_PER_PHASE;
  return { pledges: truncated ? out.slice(0, MAX_PLEDGES_PER_PHASE) : out, truncated };
}

function readInnerThought(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw;
}

export function parseDecisionAction(rawText: string, ctx: ParseContext): DecisionParseResult {
  const j = extractJsonObject(rawText);
  if (!j.ok) return { ok: false, error: j.error };
  if (typeof j.obj !== "object" || j.obj === null) {
    return { ok: false, error: "not_an_object" };
  }
  const o = j.obj as Record<string, unknown>;

  if (!Array.isArray(o.requests) && o.requests !== undefined) {
    return { ok: false, error: "requests_not_array" };
  }

  const requests: { target: string; message: string }[] = [];
  let reqTruncated = false;
  if (Array.isArray(o.requests)) {
    for (const item of o.requests) {
      if (typeof item !== "object" || item === null) continue;
      const r = item as Record<string, unknown>;
      const target = asString(r.target);
      const message = asString(r.message);
      if (target === null || target.length === 0) continue;
      if (message === null) continue;
      if (target === ctx.self_id) continue;
      if (!ctx.alive_ids.has(target)) continue;
      requests.push({ target, message });
    }
    if (requests.length > MAX_REQUESTS_PER_PHASE) {
      reqTruncated = true;
      requests.length = MAX_REQUESTS_PER_PHASE;
    }
  }

  const { pledges, truncated: plTruncated } = validatePledgeArray(o.pledges, ctx);

  const action: DecisionAction = {
    phase: "decision",
    requests,
    pledges,
    inner_thought: readInnerThought(o.inner_thought),
  };
  const truncated = reqTruncated || plTruncated;
  return truncated ? { ok: true, action, policy_truncated: true } : { ok: true, action };
}

export function parseResponseAction(rawText: string, ctx: ParseContext): ResponseParseResult {
  const j = extractJsonObject(rawText);
  if (!j.ok) return { ok: false, error: j.error };
  if (typeof j.obj !== "object" || j.obj === null) {
    return { ok: false, error: "not_an_object" };
  }
  const o = j.obj as Record<string, unknown>;

  if (!Array.isArray(o.allocations) && o.allocations !== undefined) {
    return { ok: false, error: "allocations_not_array" };
  }

  const allocations: ResponseAction["allocations"] = [];
  if (Array.isArray(o.allocations)) {
    for (const item of o.allocations) {
      if (typeof item !== "object" || item === null) continue;
      const a = item as Record<string, unknown>;
      const to = asString(a.to);
      const amount = typeof a.amount === "number" ? a.amount : NaN;
      if (to === null || to.length === 0) continue;
      if (!Number.isInteger(amount) || amount <= 0) continue;
      // We do NOT drop dead-target allocations at parse-time; settle.ts handles it
      // (the same allocation may need to be visible in the JSONL for inspection).
      if (to === ctx.self_id) continue;
      const reason =
        typeof a.reason === "string" && a.reason.trim().length > 0 ? a.reason : undefined;
      allocations.push({
        to,
        amount,
        ...(reason !== undefined ? { reason } : {}),
      });
    }
  }

  const { pledges, truncated: plTruncated } = validatePledgeArray(o.pledges, ctx);

  const action: ResponseAction = {
    phase: "response",
    allocations,
    pledges,
    inner_thought: readInnerThought(o.inner_thought),
  };
  return plTruncated ? { ok: true, action, policy_truncated: true } : { ok: true, action };
}

