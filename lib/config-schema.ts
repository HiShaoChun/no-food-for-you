import { z } from "zod";
import { MODEL_KEYS, type ModelKey } from "@/lib/llm/providers";

const AgentInstanceSchema = z.object({
  id: z.string().regex(/^A\d+$/),
  display_name: z.string().min(1),
  model_key: z.string().refine((v): v is ModelKey => MODEL_KEYS.includes(v as ModelKey), {
    message: "Unknown model_key",
  }),
});

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

export const DEFAULT_BETRAYAL_BONUS_TABLE: readonly number[] = [3, 1, 0, -2];

const PledgesConfigSchema = z
  .object({
    enabled: z.boolean(),
    betrayal_bonus_table: z.array(z.number().int()).min(1),
    keep_promise_bonus: z.number().int().nonnegative(),
  })
  .default({
    enabled: true,
    betrayal_bonus_table: [...DEFAULT_BETRAYAL_BONUS_TABLE],
    keep_promise_bonus: 0,
  });

export const GameConfigSchema = z.object({
  agents: z.array(AgentInstanceSchema).min(2).max(10),
  shared_system_prompt: z.string().min(1),
  initial_energy: z.number().int().positive().max(1000),
  max_rounds: z.number().int().positive().max(500),
  pressure: PressureCurveSchema,
  allocation_policy: AllocationPolicySchema,
  master_seed: z.number().int(),
  pledges: PledgesConfigSchema,
});

export type ValidatedGameConfig = z.infer<typeof GameConfigSchema>;
