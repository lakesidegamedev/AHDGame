import { describe, expect, it } from "vitest";
import {
  COMMODITY_BASE_PRICES,
  COMMODITY_LABELS,
  COMMODITY_TYPES,
  SECTOR_SUPPLY,
} from "@/lib/constants/commodities";
import { HOUSEHOLD_CONSUMER_BASKET } from "@/lib/market/producerMarket/householdRules";
import { getStrategy } from "@/lib/constants/sectorStrategies";
import {
  STORE_MARKUP_DEFAULT,
  STORE_ROUTED_SHARE,
  allocateByWeight,
  clampStoreMarkup,
  isStoreGood,
  storeCoverage,
  storeLedger,
  storeMarkupOn,
  storeUnmetRunUnits,
  wholesaleBudget,
} from "./storeRules";

describe("store rules", () => {
  it("routes groceries, consumer goods and electronics only", () => {
    expect(STORE_ROUTED_SHARE).toEqual({ food: 0.6, consumer_goods: 1, electronics: 0.7 });
    for (const banned of [
      "ordnance",
      "vehicles",
      "pharmaceuticals",
      "chemicals",
      "freight",
      "steel",
    ])
      expect(isStoreGood(banned)).toBe(false);
    for (const commodity of Object.keys(STORE_ROUTED_SHARE))
      expect(COMMODITY_TYPES).toContain(commodity);
  });

  it("keeps the markup between 10% and 15%", () => {
    expect(clampStoreMarkup(undefined)).toBe(STORE_MARKUP_DEFAULT);
    expect(clampStoreMarkup(Number.NaN)).toBe(STORE_MARKUP_DEFAULT);
    expect(clampStoreMarkup(0.01)).toBe(0.1);
    expect(clampStoreMarkup(0.12)).toBe(0.12);
    expect(clampStoreMarkup(0.9)).toBe(0.15);
  });

  it("covers the routed demand the stores can carry and no more", () => {
    expect(storeCoverage(0, 100)).toBe(0);
    expect(storeCoverage(50, 100)).toBe(0.5);
    expect(storeCoverage(500, 100)).toBe(1);
    expect(storeCoverage(0, 0)).toBe(0);
  });

  it("buys at wholesale so wholesale plus markup stays inside the budget", () => {
    const budget = 115;
    const wholesale = wholesaleBudget(budget, 0.15);
    expect(wholesale + storeMarkupOn(wholesale, 0.15)).toBeCloseTo(budget, 9);
  });

  it("splits money by weight and ignores stores with none", () => {
    const shares = allocateByWeight(
      [
        { id: "a", weight: 3 },
        { id: "b", weight: 1 },
        { id: "c", weight: 0 },
      ],
      100
    );
    expect(shares.get("a")).toBe(75);
    expect(shares.get("b")).toBe(25);
    expect(shares.has("c")).toBe(false);
  });

  it("lays out a store's rows so they add up", () => {
    const ledger = storeLedger({
      goodsBoughtWholesale: 1000,
      markupEarned: 150,
      runningCosts: 100,
    });
    expect(ledger.soldToHouseholds).toBe(1150);
    expect(ledger.soldToHouseholds - ledger.goodsBoughtWholesale).toBe(ledger.markupEarned);
    expect(ledger.margin).toBe(50);
  });

  it("sizes the shortfall in capacity units, using the average when a state has no stores", () => {
    const coverage = {
      A: { capacityValue: 100, runUnits: 10, routedDemandValue: 300 },
      B: { capacityValue: 0, runUnits: 0, routedDemandValue: 50 },
    };
    expect(storeUnmetRunUnits(coverage, "A")).toBe(20);
    expect(storeUnmetRunUnits(coverage, "B")).toBe(5);
    expect(storeUnmetRunUnits(coverage, "Z")).toBeNull();
  });

  it("retires the retail basket commodity everywhere it was listed", () => {
    expect((COMMODITY_TYPES as readonly string[]).includes("retail")).toBe(false);
    expect("retail" in COMMODITY_BASE_PRICES).toBe(false);
    expect("retail" in COMMODITY_LABELS).toBe(false);
    expect("retail" in HOUSEHOLD_CONSUMER_BASKET).toBe(false);
    expect(HOUSEHOLD_CONSUMER_BASKET.consumer_goods).toBeGreaterThan(0);
    for (const rows of Object.values(SECTOR_SUPPLY))
      for (const row of rows ?? []) expect(row.commodity).not.toBe("retail");
    // Stores make nothing, and none of their running inputs is a basket or a resale good.
    for (const id of ["standard", "ecommerce", "brick_mortar", "ecommerce_fulfillment"]) {
      const strategy = getStrategy("retail", id);
      expect(strategy.supply).toEqual({});
      for (const good of ["food", "electronics", "vehicles", "ordnance"])
        expect(Object.keys(strategy.demand)).not.toContain(good);
    }
  });
});
