import { describe, expect, it } from "vitest";
import {
  advanceProductivity,
  annualHours,
  productivityBasis,
  productivityGrowth,
  type ProductivityState,
} from "./productivity";

describe("game output per modeled hour", () => {
  function run(countryId: string, outputGrowth = 0.03, jobsGrowth = 0.01) {
    let state: ProductivityState | undefined;
    for (let turn = 1; turn <= 49; turn++)
      state = advanceProductivity({
        previous: state,
        turn,
        countryId,
        employmentTurn: turn,
        output: 1000 * (1 + outputGrowth) ** ((turn - 1) / 48),
        employed: 100 * (1 + jobsGrowth) ** ((turn - 1) / 48),
      });
    return state!;
  }
  it.each(["US", "UK", "JP", "DE"])(
    "uses matching real output and whole-economy hours in %s",
    (country) => {
      const state = run(country);
      expect(productivityGrowth([productivityBasis(state)!])).toBeCloseTo(100 * (1.03 / 1.01 - 1));
      expect(state.points[0]!.hours).toBeCloseTo((100 * annualHours(country)) / 48);
    }
  );
  it("does not call a partial year annual measured growth", () => {
    expect(productivityBasis({ points: run("US").points.slice(1) })).toBeNull();
  });
  it("resets warmup after gaps and preserves exact retries", () => {
    const state = run("US");
    expect(
      advanceProductivity({
        previous: state,
        turn: 49,
        countryId: "US",
        output: 999,
        employed: 20,
        employmentTurn: 49,
      })
    ).toEqual(state);
    const next = advanceProductivity({
      previous: state,
      turn: 51,
      countryId: "US",
      output: 1030,
      employed: 101,
      employmentTurn: 51,
    });
    expect(next.points).toHaveLength(1);
    expect(productivityBasis(next)).toBeNull();
    expect(
      advanceProductivity({
        previous: state,
        turn: 50,
        countryId: "US",
        output: 1030,
        employed: 101,
        employmentTurn: 49,
      })
    ).toEqual(state);
  });
  it("pools endpoint levels, not regional growth averages", () => {
    const a = productivityBasis(run("US", 0.1, 0))!;
    const b = productivityBasis(run("US", 0, 0.5))!;
    expect(productivityGrowth([a, b])).toBeCloseTo(-16);
    expect(productivityGrowth([a, { ...b, endTurn: 50 }])).toBeNull();
  });
  it("bounds storage and rejects non-finite or zero input", () => {
    const state = run("US");
    const next = advanceProductivity({
      previous: state,
      turn: 50,
      countryId: "US",
      output: 1100,
      employed: 102,
      employmentTurn: 50,
    });
    expect(next.points).toHaveLength(49);
    expect(next.points[0]!.turn).toBe(2);
    expect(productivityGrowth([{ ...productivityBasis(state)!, closingHours: 0 }])).toBeNull();
    expect(
      productivityGrowth(
        Array.from({ length: 10 }, () => ({
          ...productivityBasis(state)!,
          openingOutput: 1e308,
          closingOutput: 1e308,
        }))
      )
    ).toBeNull();
  });
});
