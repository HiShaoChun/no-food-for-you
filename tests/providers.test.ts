import { describe, expect, it } from "vitest";
import { MODELS, MODEL_KEYS, PROVIDERS, getModel } from "@/lib/llm/providers";
import { getAvailability, isProviderAvailable } from "@/lib/llm/availability";
import { getClient } from "@/lib/llm/client";

describe("provider registry", () => {
  it("exposes 5 providers", () => {
    expect(Object.keys(PROVIDERS)).toEqual([
      "ark",
      "minimax",
      "zhipu",
      "deepseek",
      "moonshot",
    ]);
  });

  it("each provider has envKey and envUrl", () => {
    for (const cfg of Object.values(PROVIDERS)) {
      expect(cfg.envKey).toMatch(/^[A-Z_]+$/);
      expect(cfg.envUrl).toMatch(/^[A-Z_]+$/);
    }
  });
});

describe("model registry", () => {
  it("exposes exactly the 5 MVP models", () => {
    expect(MODEL_KEYS).toEqual([
      "doubao-seed-code",
      "minimax-m2.7",
      "glm-5.1",
      "deepseek-v4-pro",
      "kimi-k2.6",
    ]);
  });

  it("MVP: all 5 models route through ark", () => {
    for (const key of MODEL_KEYS) {
      expect(MODELS[key].provider).toBe("ark");
    }
  });

  it("modelId equals display key for MVP", () => {
    for (const key of MODEL_KEYS) {
      expect(getModel(key).modelId).toBe(key);
    }
  });
});

describe("availability probe", () => {
  it("returns false when env is empty", () => {
    const av = getAvailability({});
    expect(av).toEqual({
      ark: false,
      minimax: false,
      zhipu: false,
      deepseek: false,
      moonshot: false,
    });
  });

  it("returns true when both key and url set", () => {
    const av = getAvailability({
      ARK_API_KEY: "sk-test",
      ARK_BASE_URL: "https://example.com",
    });
    expect(av.ark).toBe(true);
    expect(av.minimax).toBe(false);
  });

  it("returns false when only key is set", () => {
    const av = getAvailability({ ARK_API_KEY: "sk-test" });
    expect(av.ark).toBe(false);
  });

  it("treats whitespace-only as empty", () => {
    const av = getAvailability({ ARK_API_KEY: "   ", ARK_BASE_URL: "   " });
    expect(av.ark).toBe(false);
  });

  it("isProviderAvailable convenience", () => {
    expect(
      isProviderAvailable("ark", { ARK_API_KEY: "k", ARK_BASE_URL: "u" }),
    ).toBe(true);
    expect(isProviderAvailable("ark", {})).toBe(false);
  });
});

describe("getClient", () => {
  it("throws with the missing env var name when key absent", () => {
    const original = { ...process.env };
    delete process.env.ARK_API_KEY;
    delete process.env.ARK_BASE_URL;
    try {
      expect(() => getClient("ark")).toThrow(/ARK_API_KEY/);
    } finally {
      Object.assign(process.env, original);
    }
  });

  it("throws when key set but URL missing", () => {
    const original = { ...process.env };
    process.env.ARK_API_KEY = "sk-test";
    delete process.env.ARK_BASE_URL;
    try {
      expect(() => getClient("ark")).toThrow(/ARK_BASE_URL/);
    } finally {
      Object.assign(process.env, original);
    }
  });

  it("error message does NOT leak key fragment", () => {
    const original = { ...process.env };
    delete process.env.ARK_API_KEY;
    delete process.env.ARK_BASE_URL;
    try {
      try {
        getClient("ark");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        expect(msg).not.toContain("sk-");
      }
    } finally {
      Object.assign(process.env, original);
    }
  });

  it("returns an OpenAI instance when both env vars set", () => {
    const original = { ...process.env };
    process.env.ARK_API_KEY = "sk-test-fake";
    process.env.ARK_BASE_URL = "https://example.com";
    try {
      const client = getClient("ark");
      expect(client).toBeDefined();
      expect(client.constructor.name).toBe("OpenAI");
    } finally {
      Object.assign(process.env, original);
    }
  });
});
