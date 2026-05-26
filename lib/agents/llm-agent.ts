import type OpenAI from "openai";
import type {
  AgentRuntime,
  DecisionResult,
  DecisionView,
  ResponseResult,
  ResponseView,
} from "@/lib/engine/types";
import { getClient } from "@/lib/llm/client";
import { getModel, type ModelKey } from "@/lib/llm/providers";
import { buildDecisionPrompt, buildResponsePrompt } from "./prompt-template";
import {
  parseDecisionAction,
  parseResponseAction,
  type ParseContext,
} from "./parse";

export type LlmAgentOptions = {
  id: string;
  model_key: ModelKey;
  shared_system_prompt: string;
  temperature?: number;
  max_tokens?: number;
  client?: OpenAI;
};

type ChatMessageWithReasoning = {
  content?: string | null;
  reasoning_content?: string | null;
};

function extractRawText(message: unknown): {
  text: string;
  source: "content" | "reasoning_content" | "both" | "none";
  reasoning_content?: string;
} {
  if (typeof message !== "object" || message === null) {
    return { text: "", source: "none" };
  }
  const m = message as ChatMessageWithReasoning;
  const content = typeof m.content === "string" ? m.content : "";
  const reasoning = typeof m.reasoning_content === "string" ? m.reasoning_content : "";

  if (content.trim().length > 0 && reasoning.trim().length > 0) {
    return { text: content, source: "both", reasoning_content: reasoning };
  }
  if (content.trim().length > 0) return { text: content, source: "content" };
  if (reasoning.trim().length > 0) {
    return { text: reasoning, source: "reasoning_content", reasoning_content: reasoning };
  }
  return { text: "", source: "none" };
}

type CallResult = {
  raw: string;
  parse_source: string;
  tokens?: { input: number; output: number };
  finish_reason?: string;
};

async function callOnce(
  client: OpenAI,
  modelId: string,
  prompt: string,
  temperature: number,
  max_tokens: number,
  useResponseFormat: boolean,
): Promise<CallResult> {
  const completion = await client.chat.completions.create({
    model: modelId,
    messages: [{ role: "user", content: prompt }],
    temperature,
    max_tokens,
    stream: false,
    ...(useResponseFormat ? { response_format: { type: "json_object" as const } } : {}),
  });
  const choice = completion.choices[0];
  const extracted = extractRawText(choice?.message);
  const tokens = completion.usage
    ? { input: completion.usage.prompt_tokens, output: completion.usage.completion_tokens }
    : undefined;
  return {
    raw: extracted.text,
    parse_source: extracted.source,
    ...(tokens !== undefined ? { tokens } : {}),
    ...(choice?.finish_reason ? { finish_reason: choice.finish_reason } : {}),
  };
}

function annotateRaw(r: CallResult, useResponseFormat: boolean): string {
  if (r.raw.length > 0) return r.raw;
  return `[diag] content empty, source=${r.parse_source}, finish=${r.finish_reason ?? "?"}, response_format=${useResponseFormat}\n---\n${r.raw}`;
}

function buildParseContext(view: DecisionView | ResponseView): ParseContext {
  const alive = new Set<string>();
  for (const [id, e] of Object.entries(view.all_energies)) {
    if (e > 0) alive.add(id);
  }
  return { self_id: view.agent_id, alive_ids: alive };
}

export function makeLlmAgent(opts: LlmAgentOptions): AgentRuntime {
  const { id, model_key, shared_system_prompt } = opts;
  const model = getModel(model_key);
  const client = opts.client ?? getClient(model.provider);
  const temperature = opts.temperature ?? 0.7;
  const max_tokens = opts.max_tokens ?? 2048;

  async function callPhase(prompt: string): Promise<CallResult> {
    try {
      return await callOnce(client, model.modelId, prompt, temperature, max_tokens, true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("response_format") || msg.includes("400")) {
        return await callOnce(client, model.modelId, prompt, temperature, max_tokens, false);
      }
      throw e;
    }
  }

  return {
    id,
    decide_phase: async (view: DecisionView): Promise<DecisionResult> => {
      const prompt = buildDecisionPrompt(view, shared_system_prompt);
      try {
        const r = await callPhase(prompt);
        const ctx = buildParseContext(view);
        const parsed = parseDecisionAction(r.raw, ctx);
        const raw = annotateRaw(r, true);
        if (parsed.ok) {
          return {
            raw,
            parsed: parsed.action,
            ...(r.tokens !== undefined ? { tokens: r.tokens } : {}),
            ...(parsed.policy_truncated ? { policy_truncated: true } : {}),
          };
        }
        return {
          raw,
          parsed: null,
          parse_error: parsed.error,
          ...(r.tokens !== undefined ? { tokens: r.tokens } : {}),
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { raw: "", parsed: null, parse_error: `llm_error: ${msg}` };
      }
    },

    respond_phase: async (view: ResponseView): Promise<ResponseResult> => {
      const prompt = buildResponsePrompt(view, shared_system_prompt);
      try {
        const r = await callPhase(prompt);
        const ctx = buildParseContext(view);
        const parsed = parseResponseAction(r.raw, ctx);
        const raw = annotateRaw(r, true);
        if (parsed.ok) {
          return {
            raw,
            parsed: parsed.action,
            ...(r.tokens !== undefined ? { tokens: r.tokens } : {}),
            ...(parsed.policy_truncated ? { policy_truncated: true } : {}),
          };
        }
        return {
          raw,
          parsed: null,
          parse_error: parsed.error,
          ...(r.tokens !== undefined ? { tokens: r.tokens } : {}),
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { raw: "", parsed: null, parse_error: `llm_error: ${msg}` };
      }
    },
  };
}
