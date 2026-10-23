import { describe, expect, it } from "vitest";
import { demandPlanRunShare, OUTPUT_GROW_STEP, type PriorReceipt } from "./outputResponseRules";
import {
  SHORTAGE_GROWTH_CAP,
  bookPressure,
  plantPressure,
  shortageGrowth,
} from "./shortageGrowthRules";

const soldOut = (run: number): PriorReceipt => ({
  activeUnits: 100,
  producedUnits: 100 * run,
  offeredUnits: 100 * run,
  soldUnits: 100 * run,
  revenue: 1000 * run,
  inputsConsumed: 100 * run,
});

describe("shortage growth", () => {
  it("measures asked over delivered per book, capped, and skips books nobody asked on", () => {
    const p = bookPressure([
      { commodity: "food", book: "world", requestedUnits: 30, deliveredUnits: 10 },
      { commodity: "food", book: "world", requestedUnits: 10, deliveredUnits: 10 },
      { commodity: "steel", book: "world", requestedUnits: 5, deliveredUnits: 5 },
      { commodity: "healthcare_services", book: "world", requestedUnits: 9, deliveredUnits: 0 },
      { commodity: "coal", book: "world", requestedUnits: 0, deliveredUnits: 0 },
    ]);
    expect(p["food|world"]).toBe(SHORTAGE_GROWTH_CAP);
    expect(p["steel|world"]).toBe(1);
    expect(p["healthcare_services|world"]).toBe(SHORTAGE_GROWTH_CAP);
    expect(p["coal|world"]).toBeUndefined();
  });

  it("grows at least the normal step and at most the cap", () => {
    expect(shortageGrowth(undefined)).toBe(1 + OUTPUT_GROW_STEP);
    expect(shortageGrowth(1)).toBe(1 + OUTPUT_GROW_STEP);
    expect(shortageGrowth(1.6)).toBe(1.6);
    expect(shortageGrowth(40)).toBe(SHORTAGE_GROWTH_CAP);
  });

  it("reads the pressure of the product the plant delivered most of", () => {
    const pressure = new Map([
      ["food|world", 1.8],
      ["fertilizers|world", 1.1],
    ]);
    expect(
      plantPressure(
        [
          { commodity: "fertilizers", book: "world", deliveredUnits: 2 },
          { commodity: "food", book: "world", deliveredUnits: 9 },
        ],
        pressure
      )
    ).toBe(1.8);
    expect(plantPressure(undefined, pressure)).toBeUndefined();
  });

  it("leaves the demand plan unchanged without a growth factor and doubles a deep shortage", () => {
    expect(demandPlanRunShare(soldOut(0.2))).toBeCloseTo(0.2 * (1 + OUTPUT_GROW_STEP), 12);
    expect(demandPlanRunShare(soldOut(0.2), undefined, shortageGrowth(40))).toBeCloseTo(0.4, 12);
    expect(demandPlanRunShare(soldOut(0.8), undefined, shortageGrowth(40))).toBe(1);
  });
});
