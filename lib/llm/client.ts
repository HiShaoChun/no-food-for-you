import OpenAI from "openai";
import { PROVIDERS, type ProviderKey } from "./providers";

/**
 * Returns an OpenAI SDK client pointed at the given provider's base URL.
 * Throws if the provider's API key or base URL is not set in process.env.
 *
 * The error message intentionally does NOT include any key fragment.
 */
export function getClient(provider: ProviderKey): OpenAI {
  const cfg = PROVIDERS[provider];
  const apiKey = process.env[cfg.envKey];
  const baseURL = process.env[cfg.envUrl];

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      `Provider "${provider}" is not configured: env var ${cfg.envKey} is missing or empty. Edit your .env file.`,
    );
  }
  if (!baseURL || baseURL.trim().length === 0) {
    throw new Error(
      `Provider "${provider}" is not configured: env var ${cfg.envUrl} is missing or empty. Edit your .env file.`,
    );
  }

  return new OpenAI({
    apiKey,
    baseURL,
  });
}
