import { describe, expect, it } from "vitest";
import { lossShareByCountry } from "./lossShare";

const s = (
  countryId: string,
  capitalStock: number,
  profit: number | null,
  settledTurn: number | null = 10
) => ({ countryId, capitalStock, profit, settledTurn });

describe("lossShareByCountry", () => {
  it("weights by installed capacity, not by plant count", () => {
    const out = lossShareByCountry([s("US", 90, -1), s("US", 5, 1), s("US", 5, 1)], 10);
    expect(out.get("US")).toBeCloseTo(0.9, 10);
  });

  it("keeps countries apart", () => {
    const out = lossShareByCountry([s("US", 50, -1), s("UK", 50, 1)], 10);
    expect(out.get("US")).toBe(1);
    expect(out.get("UK")).toBe(0);
  });

  it("ignores plants not settled this turn, with no capacity, or with no readable profit", () => {
    const out = lossShareByCountry(
      [s("US", 100, -1, 9), s("US", 0, -1), s("US", 100, null), s("US", 40, -1), s("US", 60, 1)],
      10
    );
    expect(out.get("US")).toBeCloseTo(0.4, 10);
  });

  it("leaves out countries with nothing settled", () => {
    expect(lossShareByCountry([s("US", 10, -1, 3)], 10).has("US")).toBe(false);
  });

  it("treats a plant at exactly zero profit as not losing", () => {
    expect(lossShareByCountry([s("US", 10, 0)], 10).get("US")).toBe(0);
  });
});
