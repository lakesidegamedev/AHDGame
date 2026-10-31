import { describe, expect, it } from "vitest";
import {
  MINOR_INPUT_SHORTFALL_PREMIUM,
  makeDoOutput,
  minorInputShortfallCost,
  minorInputs,
} from "./makeDoRules";

describe("plants make do with short inputs", () => {
  it("full fills make the plan", () => {
    expect(makeDoOutput(100, [{ unitsPerOutput: 2, unitValue: 1, fill: 1 }])).toBe(100);
  });
  it("a 70% fill of an input that is a fifth of input cost cuts output 6%", () => {
    expect(
      makeDoOutput(100, [
        { unitsPerOutput: 1, unitValue: 1, fill: 0.7 },
        { unitsPerOutput: 1, unitValue: 4, fill: 1 },
      ])
    ).toBeCloseTo(94, 9);
  });
  it("nothing of every input stops production", () => {
    expect(makeDoOutput(100, [{ unitsPerOutput: 1, unitValue: 1, fill: 0 }])).toBe(0);
  });
  it("is scale-free: the same fill gives the same share of plan", () => {
    const a = makeDoOutput(10, [{ unitsPerOutput: 1, unitValue: 1, fill: 0.8 }]);
    const b = makeDoOutput(1000, [{ unitsPerOutput: 1, unitValue: 1, fill: 0.8 }]);
    expect(a / 10).toBeCloseTo(b / 1000, 12);
  });
  it("re-applying the same fills to the original plan does not compound", () => {
    const inputs = [
      { unitsPerOutput: 1, unitValue: 1, fill: 0.5 },
      { unitsPerOutput: 1, unitValue: 9, fill: 1 },
    ];
    let x = 100;
    for (let i = 0; i < 50; i++) x = makeDoOutput(100, inputs);
    expect(x).toBeCloseTo(95, 9);
  });
});

describe("minor inputs", () => {
  it("an input at or under 5% of recipe input cost is minor", () => {
    expect(
      minorInputs([
        { unitsPerOutput: 1, unitValue: 95 },
        { unitsPerOutput: 1, unitValue: 5 },
        { unitsPerOutput: 0, unitValue: 0 },
      ])
    ).toEqual([false, true, false]);
    expect(minorInputs([{ unitsPerOutput: 1, unitValue: 0 }])).toEqual([false]);
  });
  it("a missing minor input does not cut output; a missing major input still does", () => {
    expect(
      makeDoOutput(100, [
        { unitsPerOutput: 1, unitValue: 99, fill: 1 },
        { unitsPerOutput: 1, unitValue: 1, fill: 0 },
      ])
    ).toBe(100);
    expect(
      makeDoOutput(100, [
        { unitsPerOutput: 1, unitValue: 99, fill: 0.5 },
        { unitsPerOutput: 1, unitValue: 1, fill: 0 },
      ])
    ).toBeCloseTo(50.5, 9);
  });
  it("charges the missing units at the premium over the bid limit", () => {
    expect(
      minorInputShortfallCost({
        produced: 100,
        unitsPerOutput: 0.01,
        available: 0.25,
        maximumUnitPrice: 4,
      })
    ).toBeCloseTo(0.75 * 4 * MINOR_INPUT_SHORTFALL_PREMIUM, 12);
    expect(
      minorInputShortfallCost({
        produced: 100,
        unitsPerOutput: 0.01,
        available: 5,
        maximumUnitPrice: 4,
      })
    ).toBe(0);
  });
});
