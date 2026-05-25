import { describe, expect, it } from "vitest";
import { makeRng, shuffle } from "@/lib/engine/rng";

describe("rng", () => {
  it("same seed produces identical sequence", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it("different seeds diverge within 5 calls", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    let differed = false;
    for (let i = 0; i < 5; i++) {
      if (a() !== b()) differed = true;
    }
    expect(differed).toBe(true);
  });

  it("output in [0, 1)", () => {
    const r = makeRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("shuffle", () => {
  it("preserves length and contents", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, makeRng(7));
    expect(out.length).toBe(input.length);
    expect([...out].sort()).toEqual([...input].sort());
  });

  it("does not mutate input", () => {
    const input = [1, 2, 3];
    const copy = [...input];
    shuffle(input, makeRng(1));
    expect(input).toEqual(copy);
  });

  it("same seed → same output", () => {
    const a = shuffle([1, 2, 3, 4, 5], makeRng(11));
    const b = shuffle([1, 2, 3, 4, 5], makeRng(11));
    expect(a).toEqual(b);
  });
});
