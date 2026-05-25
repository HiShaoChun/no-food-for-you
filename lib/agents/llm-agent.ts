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

export function makeLlmAgent(opts: LlmAgentOptions): AgentRuntime {
  const { id, model_key, shared_system_prompt } = opts;
  const model = getModel(model_key);
  const client = opts.client ?? getClient(model.provider);

  return {
    id,
    decide: async (view: AgentView): Promise<AgentDecisionResult> => {
      const prompt = buildPrompt(view, shared_system_prompt);
      try {
        const completion = await client.chat.completions.create({
          model: model.modelId,
          messages: [{ role: "user", content: prompt }],
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.max_tokens ?? 512,
          response_format: { type: "json_object" },
        });
        const raw = completion.choices[0]?.message?.content ?? "";
        const tokens = completion.usage
          ? { input: completion.usage.prompt_tokens, output: completion.usage.completion_tokens }
          : undefined;
        const result = parseAgentResponse(raw);
        if (result.ok) {
          return tokens !== undefined
            ? { raw, parsed: result.action, tokens }
            : { raw, parsed: result.action };
        }
        return tokens !== undefined
          ? { raw, parsed: null, parse_error: result.error, tokens }
          : { raw, parsed: null, parse_error: result.error };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Some Ark gateway models may reject response_format; retry without it once.
        if (msg.includes("response_format") || msg.includes("400")) {
          try {
            const completion = await client.chat.completions.create({
              model: model.modelId,
              messages: [{ role: "user", content: prompt }],
              temperature: opts.temperature ?? 0.7,
              max_tokens: opts.max_tokens ?? 512,
            });
            const raw = completion.choices[0]?.message?.content ?? "";
            const tokens = completion.usage
              ? { input: completion.usage.prompt_tokens, output: completion.usage.completion_tokens }
              : undefined;
            const result = parseAgentResponse(raw);
            if (result.ok) {
              return tokens !== undefined
                ? { raw, parsed: result.action, tokens }
                : { raw, parsed: result.action };
            }
            return tokens !== undefined
              ? { raw, parsed: null, parse_error: result.error, tokens }
              : { raw, parsed: null, parse_error: result.error };
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
