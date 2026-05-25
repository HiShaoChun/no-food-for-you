import type OpenAI from "openai";
import type { AgentDecisionResult, AgentRuntime, AgentView } from "@/lib/engine/types";
import { getClient } from "@/lib/llm/client";
import { getModel, type ModelKey } from "@/lib/llm/providers";
import { buildPrompt } from "./prompt-template";
import { parseAgentResponse } from "./parse";

export type LlmAgentOptions = {
  id: string;
  model_key: ModelKey;
  shared_system_prompt: string;
  temperature?: number;
  max_tokens?: number;
  // Allow injecting a client for testing
  client?: OpenAI;
};

type ChatMessageWithReasoning = {
  content?: string | null;
  reasoning_content?: string | null;
};

/**
 * Some Chinese reasoning models (doubao-seed, deepseek-r1-style) put the
 * actual answer in `reasoning_content` and leave `content` empty, or vice versa.
 * Try both and prefer whatever parses successfully.
 */
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

export function makeLlmAgent(opts: LlmAgentOptions): AgentRuntime {
  const { id, model_key, shared_system_prompt } = opts;
  const model = getModel(model_key);
  const client = opts.client ?? getClient(model.provider);
  const temperature = opts.temperature ?? 0.7;
  const max_tokens = opts.max_tokens ?? 2048;

  return {
    id,
    decide: async (view: AgentView): Promise<AgentDecisionResult> => {
      const prompt = buildPrompt(view, shared_system_prompt);

      const attempt = async (useResponseFormat: boolean): Promise<AgentDecisionResult> => {
        const r = await callOnce(client, model.modelId, prompt, temperature, max_tokens, useResponseFormat);
        const parsed = parseAgentResponse(r.raw);
        // Annotate raw with diagnostic suffix to surface in JSONL/UI
        const diagnosticPrefix =
          r.raw.length === 0
            ? `[diag] content empty, source=${r.parse_source}, finish=${r.finish_reason ?? "?"}, response_format=${useResponseFormat}`
            : "";
        const annotatedRaw = diagnosticPrefix
          ? `${diagnosticPrefix}\n---\n${r.raw}`
          : r.raw;

        if (parsed.ok) {
          return r.tokens !== undefined
            ? { raw: annotatedRaw, parsed: parsed.action, tokens: r.tokens }
            : { raw: annotatedRaw, parsed: parsed.action };
        }
        return r.tokens !== undefined
          ? { raw: annotatedRaw, parsed: null, parse_error: parsed.error, tokens: r.tokens }
          : { raw: annotatedRaw, parsed: null, parse_error: parsed.error };
      };

      try {
        return await attempt(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Ark/older models may reject response_format=json_object → retry without it
        if (msg.includes("response_format") || msg.includes("400")) {
          try {
            return await attempt(false);
          } catch (e2) {
            const m2 = e2 instanceof Error ? e2.message : String(e2);
            return { raw: "", parsed: null, parse_error: `llm_error: ${m2}` };
          }
        }
        return { raw: "", parsed: null, parse_error: `llm_error: ${msg}` };
      }
    },
  };
}
