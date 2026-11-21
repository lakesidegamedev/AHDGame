import { describe, expect, it } from "vitest";
import type { CorporateSector } from "@/lib/db/types";
import { carveSectorPlantFields } from "@/lib/corporations/sectorTransferCapex";
import { fundedSiteSlice, fundedCarveFitsMarketLimit } from "./fundedSiteSlice";
import { applyTier, sectorCompensationValuationAnchor } from "../compensation";
import { producerStockBookAnchor } from "./fundedOwnership";

const site = {
  sectorType: "energy",
  strategyId: "hydroelectric",
  capitalStock: 100,
  plantCount: 1,
  capacityBookAnchor: 2000,
  constructionInProgressAnchor: 400,
  buildQueue: [],
  producerInventory: {
    worldEpoch: "world",
    turn: 1,
    inputStock: [{ commodity: "fuel", units: 10, value: 300 }],
    outputStock: [{ commodity: "energy", book: "country:CA", units: 20, quoteUnitCost: 5 }],
  },
} as unknown as CorporateSector;

describe("funded site quote follows physical allocation", () => {
  it("enforces the market cap against whole facilities rather than the requested percentage", () => {
    expect(fundedCarveFitsMarketLimit(site, 0.1, 0.3)).toBe(false);
    expect(fundedCarveFitsMarketLimit(site, 0.1, 1)).toBe(true);
  });
  it("prices the sole whole facility and its entire stock even for a small requested carve", () => {
    const slice = fundedSiteSlice(site, 0.1);
    expect(slice.acquired.capitalStock).toBe(100);
    expect(slice.liabilityFraction).toBe(1);
    expect(producerStockBookAnchor(slice.acquired.producerInventory)).toBe(400);
    const base = sectorCompensationValuationAnchor({ ...site, ...slice.acquired }, 0, {
      plantsEnabled: true,
      currentYear: 2027,
      eraUnitScale: 1,
    });
    expect(applyTier(base, "fair", { plantsEnabled: true })).toBeCloseTo(2440);
  });
  it("conserves both legs and separates divisible construction from a rounded facility allocation", () => {
    const original = { ...site, capitalStock: 2500, plantCount: 10, capacityBookAnchor: 20000 };
    const a = fundedSiteSlice(original, 0.25);
    const kept = carveSectorPlantFields(original, 0.75, 8);
    expect(a.acquired.capitalStock).toBe(500);
    expect(a.acquired.constructionInProgressAnchor).toBe(100);
    expect(a.liabilityFraction).toBe(0.2);
    expect(producerStockBookAnchor(a.acquired.producerInventory)).toBe(80);
    expect(a.acquired.capitalStock + kept.capitalStock).toBe(2500);
    expect(a.acquired.capacityBookAnchor + kept.capacityBookAnchor).toBe(20000);
    expect(
      producerStockBookAnchor(a.acquired.producerInventory) +
        producerStockBookAnchor(kept.producerInventory)
    ).toBe(400);
  });
  it("keeps inventory-only assets divisible when no facility remains", () => {
    const slice = fundedSiteSlice({ ...site, capitalStock: 0, plantCount: 0 }, 0.25);
    expect(slice.liabilityFraction).toBe(0.25);
    expect(producerStockBookAnchor(slice.acquired.producerInventory)).toBe(100);
  });
});
