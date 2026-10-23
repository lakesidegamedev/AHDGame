import { describe, expect, it } from "vitest";
import { makeDoOutput } from "./makeDoRules";

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
