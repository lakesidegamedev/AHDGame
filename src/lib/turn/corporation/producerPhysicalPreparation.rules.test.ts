import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import {
  COMMODITY_BASE_PRICES,
  COMMODITY_TYPES,
  eraScaledBasePrices,
  type CommodityType,
} from "@/lib/constants/commodities";
import {
  producerCommodity,
  producerRecipeCommodities,
  scaledCommodityRates,
} from "./producerPhysicalPreparation";

/** The entry-array form `scaledCommodityRates` replaces. */
function legacyScaledRates(
  rates: Partial<Record<CommodityType, number>>,
  factors: Record<string, number>,
  multiplier = 1
) {
  return Object.fromEntries(
    Object.entries(rates).map(([commodity, rate]) => [
      commodity,
      rate! * (factors[commodity] ?? 1) * multiplier,
    ])
  );
}

/** The linear catalogue scan `producerCommodity` replaces. */
function legacyProducerCommodity(key: string): CommodityType | undefined {
  return COMMODITY_TYPES.find((item) => item === key);
}

/** The object-spread key union `producerRecipeCommodities` replaces. */
function legacyRecipeCommodities(
  recipe: {
    supply: Partial<Record<CommodityType, number>>;
    demand: Partial<Record<CommodityType, number>>;
  },
  sector: Pick<CorporateSector, "producerInventory">
): Set<string> {
  const commodities = new Set(Object.keys({ ...recipe.supply, ...recipe.demand }));
  for (const stock of sector.producerInventory?.outputStock ?? []) {
    if (stock.units > 0) commodities.add(stock.commodity);
  }
  return commodities;
}

const manufacturerRecipe = {
  supply: { vehicles: 0.6, electronics: 0.4 },
  demand: { steel: 0.5, energy: 0.3, freight: 0.2 } as Partial<Record<CommodityType, number>>,
};
const extractionRecipe = {
  supply: {
    steel: 0.4,
    energy: 0.2,
    chemicals: 0.2,
    building_materials: 0.2,
  } as Partial<Record<CommodityType, number>>,
  demand: { energy: 0.6, freight: 0.4 } as Partial<Record<CommodityType, number>>,
};

describe("scaledCommodityRates", () => {
  it("scales the same rates, in the same order, as the entry-array form", () => {
    const factors = { vehicles: 1.08, electronics: 0.94, steel: 1.15, energy: 0.9 };
    for (const recipe of [manufacturerRecipe, extractionRecipe]) {
      expect(Object.entries(scaledCommodityRates(recipe.supply, factors))).toEqual(
        Object.entries(legacyScaledRates(recipe.supply, factors))
      );
      expect(Object.entries(scaledCommodityRates(recipe.demand, factors, 0.75))).toEqual(
        Object.entries(legacyScaledRates(recipe.demand, factors, 0.75))
      );
    }
  });

  it("leaves an absent factor at the plain multiplier, as the entry form did", () => {
    const scaled = scaledCommodityRates({ freight: 0.25 }, {}, 1.5);
    expect(scaled.freight).toBe(legacyScaledRates({ freight: 0.25 }, {}, 1.5).freight);
    expect(scaled.freight).toBe(0.375);
  });
});

describe("producerCommodity", () => {
  it("resolves every catalogue entry the linear scan resolved", () => {
    for (const commodity of COMMODITY_TYPES) {
      expect(producerCommodity(commodity)).toBe(legacyProducerCommodity(commodity));
    }
  });

  it("still rejects a key outside the catalogue", () => {
    expect(legacyProducerCommodity("unobtainium")).toBeUndefined();
    expect(() => producerCommodity("unobtainium")).toThrow("Unrecognized producer commodity");
  });
});

describe("producerRecipeCommodities", () => {
  const sector = {
    producerInventory: {
      worldEpoch: "world",
      turn: 3,
      inputStock: [],
      outputStock: [
        { commodity: "food", units: 12, book: "world" },
        { commodity: "steel", units: 0, book: "world" },
        { commodity: "vehicles", units: 4, book: "world" },
      ],
    },
  } as unknown as Pick<CorporateSector, "producerInventory">;

  it("unions both recipe legs and positive stock, in the same order", () => {
    for (const recipe of [manufacturerRecipe, extractionRecipe]) {
      expect([...producerRecipeCommodities(recipe, sector)]).toEqual([
        ...legacyRecipeCommodities(recipe, sector),
      ]);
    }
  });

  it("keeps a stored good whose rate is zero out of the set, as the spread key union did", () => {
    const commodities = producerRecipeCommodities(manufacturerRecipe, sector);
    expect(commodities.has("steel")).toBe(true);
    expect(commodities.has("food")).toBe(true);
    expect(commodities.has("unobtainium")).toBe(false);
    // A sector with no stock and no recipe keys adds nothing new.
    expect([...producerRecipeCommodities({ supply: {}, demand: {} }, {})]).toEqual([]);
  });

  it("does not depend on the price table, so era scaling cannot change the keys", () => {
    expect([...producerRecipeCommodities(manufacturerRecipe, sector)]).toEqual([
      ...legacyRecipeCommodities(manufacturerRecipe, sector),
    ]);
    expect(Object.keys(eraScaledBasePrices(0.4))).toEqual(Object.keys(COMMODITY_BASE_PRICES));
    expect(new ObjectId().toHexString()).toHaveLength(24);
  });
});
