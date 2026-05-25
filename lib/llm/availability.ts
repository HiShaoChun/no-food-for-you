import { PROVIDERS, type ProviderKey } from "./providers";

export type Availability = Record<ProviderKey, boolean>;

export type EnvLike = Record<string, string | undefined>;

/**
 * Probe `.env` for each provider; returns whether both API key and base URL are non-empty.
 *
 * Safe to expose to the frontend — does NOT include key material.
 */
export function getAvailability(env: EnvLike = process.env): Availability {
  const out = {} as Availability;
  for (const provider of Object.keys(PROVIDERS) as ProviderKey[]) {
    const cfg = PROVIDERS[provider];
    const key = env[cfg.envKey];
    const url = env[cfg.envUrl];
    out[provider] = Boolean(key && key.trim().length > 0 && url && url.trim().length > 0);
  }
  return out;
}

export function isProviderAvailable(provider: ProviderKey, env: EnvLike = process.env): boolean {
  return getAvailability(env)[provider];
}
