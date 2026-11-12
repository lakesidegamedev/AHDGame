import { describe, expect, it } from "vitest";
import { canvassUnitFundsCost } from "./cost";

describe("canvassUnitFundsCost", () => {
  it("keeps the anchor cost at the modern price level", () => {
    expect(canvassUnitFundsCost(1)).toBe(100);
  });

  it("deflates with an early-era price level", () => {
    expect(canvassUnitFundsCost(0.03673)).toBe(4);
    expect(canvassUnitFundsCost(0.49707)).toBe(50);
  });

  it("scales up for a price level above modern", () => {
    expect(canvassUnitFundsCost(1.28579)).toBe(129);
  });

  it("is never free and ignores a non-finite level", () => {
    expect(canvassUnitFundsCost(0.0001)).toBe(1);
    expect(canvassUnitFundsCost(Number.NaN)).toBe(100);
  });
});
