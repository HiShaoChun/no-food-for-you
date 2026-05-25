/**
 * Provider & Model Registry
 *
 * MVP: All 5 models route through the Ark gateway (one key).
 * Phase 2: Flip individual `provider` fields to per-vendor keys without touching call sites.
 */

export const PROVIDERS = {
  ark: { envKey: "ARK_API_KEY", envUrl: "ARK_BASE_URL" },
  minimax: { envKey: "MINIMAX_API_KEY", envUrl: "MINIMAX_BASE_URL" },
  zhipu: { envKey: "ZHIPU_API_KEY", envUrl: "ZHIPU_BASE_URL" },
  deepseek: { envKey: "DEEPSEEK_API_KEY", envUrl: "DEEPSEEK_BASE_URL" },
  moonshot: { envKey: "MOONSHOT_API_KEY", envUrl: "MOONSHOT_BASE_URL" },
} as const;

export type ProviderKey = keyof typeof PROVIDERS;

/**
 * Model display key → (provider, vendor model ID).
 * MVP: provider = "ark" for all 5 (single Ark gateway routes all).
 */
export const MODELS = {
  "doubao-seed-code": { provider: "ark", modelId: "doubao-seed-code" },
  "minimax-m2.7": { provider: "ark", modelId: "minimax-m2.7" },
  "glm-5.1": { provider: "ark", modelId: "glm-5.1" },
  "deepseek-v4-pro": { provider: "ark", modelId: "deepseek-v4-pro" },
  "kimi-k2.6": { provider: "ark", modelId: "kimi-k2.6" },
} as const satisfies Record<string, { provider: ProviderKey; modelId: string }>;

export type ModelKey = keyof typeof MODELS;

export const MODEL_KEYS: readonly ModelKey[] = Object.keys(MODELS) as ModelKey[];

export function getModel(key: ModelKey): { provider: ProviderKey; modelId: string } {
  return MODELS[key];
}
