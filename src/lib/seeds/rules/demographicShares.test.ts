import { describe, expect, it } from "vitest";
import { roundedDemographicShares } from "./demographicShares";

describe("demographic share conservation", () => {
  it("conserves 10,000 basis points with deterministic ties", () => {
    expect(roundedDemographicShares({ c: 1, b: 1, a: 1 })).toEqual({
      a: 33.34,
      b: 33.33,
      c: 33.33,
    });
    const shares = roundedDemographicShares({ zero: 0, x: 21.1234, y: 78.8766 });
    expect(Object.values(shares).reduce((n, v) => n + Math.round(v * 100), 0)).toBe(10000);
    expect(shares.zero).toBe(0);
  });
  it("rejects invalid weights", () => {
    for (const weights of [{}, { a: 0 }, { a: -1 }, { a: NaN }] as Record<string, number>[])
      expect(() => roundedDemographicShares(weights)).toThrow();
  });
});
