import { describe, expect, it } from "vitest";
import { wholePopulation } from "./wholePopulation";

describe("whole population stocks", () => {
  it.each([0, 1, 737270, 39355309])(
    "conserves exactly %i people with deterministic ties",
    (population) => {
      const weights = {
        male: Array.from({ length: 101 }, (_, age) => 102 - age),
        female: Array.from({ length: 101 }, (_, age) => 103 - age),
      };
      const result = wholePopulation(weights, population);
      expect([...result.male, ...result.female].reduce((sum, n) => sum + n, 0)).toBe(population);
      expect(
        [...result.male, ...result.female].every((n) => Number.isSafeInteger(n) && n >= 0)
      ).toBe(true);
      expect(wholePopulation(weights, population)).toEqual(result);
    }
  );
  it("rejects corrupt stocks", () => {
    expect(() => wholePopulation({ male: [NaN], female: [1] }, 1)).toThrow();
    expect(() => wholePopulation({ male: [1], female: [1] }, -1)).toThrow();
  });
});
