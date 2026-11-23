import { describe, expect, it } from "vitest";
import { settleSinglePrecision } from "./singlePrecision";

describe("settleSinglePrecision", () => {
  it("cleans single precision dust", () => {
    expect(settleSinglePrecision(1.0800000429153442)).toBe(1.08);
    expect(settleSinglePrecision(12.3100004196167)).toBe(12.31);
    expect(settleSinglePrecision(Math.fround(13.2))).toBe(13.2);
  });

  it("leaves ordinary doubles and edge values alone", () => {
    expect(settleSinglePrecision(1.08)).toBe(1.08);
    expect(settleSinglePrecision(0.1 + 0.2)).toBe(0.1 + 0.2);
    expect(settleSinglePrecision(1)).toBe(1);
    expect(settleSinglePrecision(Number.NaN)).toBeNaN();
  });
});
