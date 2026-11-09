import { describe, expect, it } from "vitest";
import type { CommodityType } from "@/lib/constants/commodities";
import { SECTOR_SUPPLY } from "@/lib/constants/commodities";
import {
  peakOutputShortage,
  plantOutputFlows,
  weightedOutputShortage,
} from "./plantOutputShortage";

// Live price ratios read on a 1991 world: coal and gas short, crude and timber
// at the price floor.
const ratios: Partial<Record<CommodityType, number>> = {
  coal: 2.48,
  iron: 0.93,
  oil: 0.28,
  natural_gas: 0.6,
  rare_earth: 1.31,
  timber: 0.28,
};
const priceRatioOf = (commodity: CommodityType) => ratios[commodity] ?? null;

describe("plantOutputFlows", () => {
  it("scores a focused mine on its own recipe outputs", () => {
    const flows = plantOutputFlows("extraction", "oil_gas");
    expect(flows.map((f) => f.commodity).sort()).toEqual(["natural_gas", "oil"]);
  });

  it("keeps the sector table for a standard mine, a missing recipe and other sectors", () => {
    expect(plantOutputFlows("extraction", "standard")).toBe(SECTOR_SUPPLY.extraction);
    expect(plantOutputFlows("extraction", undefined)).toBe(SECTOR_SUPPLY.extraction);
    expect(plantOutputFlows("extraction", "no_such_recipe")).toBe(SECTOR_SUPPLY.extraction);
    expect(plantOutputFlows("chemical_industries", "oil_gas")).toBe(
      SECTOR_SUPPLY.chemical_industries
    );
  });
});

describe("recipe shortage score", () => {
  it("does not let a coal shortage read as a reason to drill more oil", () => {
    const broad = weightedOutputShortage(SECTOR_SUPPLY.extraction ?? [], "JP", priceRatioOf);
    const oilGas = weightedOutputShortage(
      plantOutputFlows("extraction", "oil_gas"),
      "JP",
      priceRatioOf
    );
    const coal = weightedOutputShortage(
      plantOutputFlows("extraction", "coal_mining"),
      "JP",
      priceRatioOf
    );
    // The broad mix clears the growth gate (0.85) and reads coal as critical.
    expect(broad).toBeGreaterThan(0.85);
    expect(oilGas).toBeLessThan(0.85);
    expect(coal).toBeGreaterThan(1.15);
    expect(peakOutputShortage(SECTOR_SUPPLY.extraction ?? [], "JP", priceRatioOf)).toBeCloseTo(
      2.48
    );
    expect(
      peakOutputShortage(plantOutputFlows("extraction", "oil_gas"), "JP", priceRatioOf)
    ).toBeCloseTo(0.6);
  });

  it("reads unpriced flows as neutral", () => {
    expect(
      weightedOutputShortage(plantOutputFlows("extraction", "oil_gas"), "JP", () => null)
    ).toBe(1);
    expect(peakOutputShortage(plantOutputFlows("extraction", "oil_gas"), "JP", () => null)).toBe(0);
  });
});
