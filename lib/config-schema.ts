import { z } from "zod";
import { MODEL_KEYS, type ModelKey } from "@/lib/llm/providers";

const AgentInstanceSchema = z.object({
  id: z.string().regex(/^A\d+$/),
  display_name: z.string().min(1),
  model_key: z.string().refine((v): v is ModelKey => MODEL_KEYS.includes(v as ModelKey), {
    message: "Unknown model_key",
  }),
});

const InformationModeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open") }),
  z.object({ type: z.literal("blind") }),
  z.object({ type: z.literal("partial"), k: z.number().int().positive() }),
]);

const PressureCurveSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("constant"), amount: z.number().int().nonnegative() }),
  z.object({
    type: z.literal("linear"),
    start: z.number().int().nonnegative(),
    step: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("step"),
    thresholds: z.array(z.number().int().positive()).min(1),
  }),
]);

const AllocationPolicySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fully_free") }),
  z.object({ type: z.literal("capped"), cap: z.number().int().positive() }),
  z.object({ type: z.literal("proportional") }),
]);

export const GameConfigSchema = z.object({
  agents: z.array(AgentInstanceSchema).min(2).max(10),
  shared_system_prompt: z.string().min(1),
  initial_energy: z.number().int().positive().max(1000),
  max_rounds: z.number().int().positive().max(500),
  max_requests_per_round: z.number().int().positive().max(10),
  info_mode: InformationModeSchema,
  pressure: PressureCurveSchema,
  allocation_policy: AllocationPolicySchema,
  master_seed: z.number().int(),
});

export type ValidatedGameConfig = z.infer<typeof GameConfigSchema>;
