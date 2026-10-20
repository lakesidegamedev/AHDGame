import { describe, expect, it } from "vitest";
import { deliveredShortfall, marketServicePressure } from "./marketServices";
describe("delivered service constraints", () => {
  const care = {
    commodity: "healthcare_services",
    turn: 10,
    stateDemand: { A: 100, B: 100 },
    stateDeliveredSupply: { A: 50, B: 200 },
  };
  it("does not cancel one region's shortage with another region's spare supply", () => {
    expect(deliveredShortfall(care, ["A", "B"], 10)).toBe(0.25);
    expect(marketServicePressure([care], ["A"], 10, false)["16"]).toBe(-0.2);
  });
  it("distinguishes measured zero from missing, stale and unmeasured delivery", () => {
    expect(
      deliveredShortfall(
        { ...care, stateDemand: { A: 0 }, stateDeliveredSupply: { A: 0 } },
        ["A"],
        10
      )
    ).toBe(0);
    expect(deliveredShortfall(care, ["C"], 10)).toBeNull();
    expect(deliveredShortfall(care, ["A"], 11)).toBeNull();
    expect(deliveredShortfall({ ...care, stateDeliveredSupply: undefined }, ["A"], 10)).toBeNull();
    expect(marketServicePressure([care, care], ["A"], 10, false)).toEqual({});
  });
  it("uses the weakest required fuel without adding different physical units", () => {
    const rows = ["coal", "oil", "natural_gas"].map((commodity, i) => ({
      commodity,
      turn: 10,
      stateDemand: { A: 100 * (i + 1) },
      stateDeliveredSupply: { A: 50 * (i + 1) },
    }));
    expect(marketServicePressure(rows, ["A"], 10, true)["58"]).toBe(-0.25);
    expect(marketServicePressure(rows.slice(1), ["A"], 10, true)).toEqual({});
  });
});
