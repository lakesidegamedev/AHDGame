import { describe, expect, it } from "vitest";
import {
  COMMODITY_BASE_PRICES,
  COMMODITY_LABELS,
  COMMODITY_TYPES,
  COMMODITY_UNITS,
} from "./commodities";
import { FREIGHT_CLASS_BY_COMMODITY } from "@/lib/logistics/freightClass";
import { getManufacturingProductKind } from "@/lib/products/manufacturingCatalog";
import { chooseFoundingRecipe } from "@/lib/turn/npp/rules/foundingRecipe";
import { getStrategy } from "./sectorStrategies";
import { SECTOR_STRATEGIES } from "./sectorStrategyDefinitions";

const LIVE = "1991-default";
const sum = (demand: object) => Object.values(demand).reduce((a, b) => a + (b as number), 0);
const live = (sector: string, id: string) =>
  getStrategy(sector, id, LIVE, { advertisingInput: true });

describe("consumer goods product", () => {
  it("is a priced, labelled, shippable commodity of its own", () => {
    expect(COMMODITY_TYPES).toContain("consumer_goods");
    expect(COMMODITY_LABELS.consumer_goods).toBe("Consumer Goods");
    expect(COMMODITY_LABELS.retail).not.toBe(COMMODITY_LABELS.consumer_goods);
    expect(COMMODITY_UNITS.consumer_goods).toBe("units");
    expect(FREIGHT_CLASS_BY_COMMODITY.consumer_goods).toBe("special");
    const ratio = COMMODITY_BASE_PRICES.consumer_goods / COMMODITY_BASE_PRICES.electronics;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(1.5);
  });

  it("has a manufacturing recipe that makes only consumer goods", () => {
    const base = SECTOR_STRATEGIES.manufacturing.find((s) => s.id === "consumer_goods")!;
    expect(base.minDecade).toBeUndefined();
    expect(Object.keys(base.supply)).toEqual(["consumer_goods"]);
    const d = base.demand;
    const total = sum(d);
    const share = (k: keyof typeof d) => (d[k] ?? 0) / total;
    expect(share("plastics")).toBeCloseTo(0.25, 2);
    expect(share("timber")).toBeCloseTo(0.25, 2);
    expect(share("chemicals")).toBeCloseTo(0.15, 2);
    expect(share("electronics")).toBeCloseTo(0.15, 2);
    expect(share("steel")).toBeCloseTo(0.1, 2);
    expect(share("energy")).toBeCloseTo(0.1, 2);
  });

  it("keeps the same input split once the advertising input is added", () => {
    const d = live("manufacturing", "consumer_goods").demand;
    expect(d.advertising).toBe(0.07);
    const rest = sum(d) - (d.advertising ?? 0);
    expect((d.plastics ?? 0) / rest).toBeCloseTo(0.25, 2);
    expect((d.timber ?? 0) / rest).toBeCloseTo(0.25, 2);
    expect((d.energy ?? 0) / rest).toBeCloseTo(0.1, 1);
    expect(sum(d)).toBeCloseTo(0.615, 3);
  });

  it("can be sold as a named manufacturing line", () => {
    expect(getManufacturingProductKind("furniture")?.outputCommodity).toBe("consumer_goods");
    expect(getManufacturingProductKind("household_goods")?.strategyIds).toContain("consumer_goods");
  });

  it("is picked for a new plant when consumer goods run short", () => {
    const recipes = SECTOR_STRATEGIES.manufacturing;
    const pick = (short: boolean) =>
      chooseFoundingRecipe({
        recipes,
        countryId: "US",
        priceRatioOf: (c) => (c === "consumer_goods" && short ? 2 : 1),
        isAvailable: () => true,
      });
    expect(pick(true)).toBe("consumer_goods");
    expect(pick(false)).toBeUndefined();
  });
});

describe("deeper raw-input recipes", () => {
  // Total input value of each reworked recipe before the move, live basket
  // (1991 tables with the advertising input). Totals must not change.
  const TOTAL_BEFORE: Record<string, number> = {
    "manufacturing.standard": 0.615,
    "manufacturing.heavy_metals": 0.615,
    "manufacturing.electronics_manufacturing": 0.615,
    "manufacturing.building_materials": 0.4,
    "manufacturing.vehicle_assembly": 0.615,
    "manufacturing.vehicle_heavy_machinery": 0.615,
    "chemical_industries.standard": 0.53,
    "chemical_industries.plastics": 0.502,
    "chemical_industries.fertilizers": 0.51,
    "chemical_industries.specialty_chemicals": 0.42,
    "agriculture.standard": 0.55,
    "agriculture.industrial": 0.613,
    "logistics.standard": 0.468,
    "logistics.freight_only": 0.468,
    "logistics.full_service": 0.468,
    "construction.standard": 0.5,
  };
  const ENERGY_BEFORE: Record<string, number> = {
    "manufacturing.standard": 0.142,
    "manufacturing.heavy_metals": 0.168,
    "manufacturing.electronics_manufacturing": 0.163,
    "manufacturing.building_materials": 0.107,
    "manufacturing.vehicle_assembly": 0.074,
    "manufacturing.vehicle_heavy_machinery": 0.096,
    "chemical_industries.standard": 0.18,
    "chemical_industries.plastics": 0.123,
    "chemical_industries.fertilizers": 0.15,
    "chemical_industries.specialty_chemicals": 0.12,
    "agriculture.standard": 0.1,
    "agriculture.industrial": 0.116,
    "logistics.standard": 0.159,
    "logistics.freight_only": 0.159,
    "logistics.full_service": 0.134,
    "construction.standard": 0.085,
  };

  it.each(Object.keys(TOTAL_BEFORE))("%s keeps its total input value", (key) => {
    const [sector, id] = key.split(".");
    expect(sum(live(sector!, id!).demand)).toBeCloseTo(TOTAL_BEFORE[key]!, 2);
  });

  it.each(Object.keys(ENERGY_BEFORE))("%s buys about 30% less energy", (key) => {
    const [sector, id] = key.split(".");
    const energy = live(sector!, id!).demand.energy ?? 0;
    expect(energy / ENERGY_BEFORE[key]!).toBeGreaterThan(0.68);
    expect(energy / ENERGY_BEFORE[key]!).toBeLessThan(0.72);
  });

  it("gives each raw good a plant buyer", () => {
    const buyers = (commodity: string) => {
      const out: string[] = [];
      for (const [sector, list] of Object.entries(SECTOR_STRATEGIES))
        for (const s of list)
          if (((live(sector, s.id).demand as Record<string, number>)[commodity] ?? 0) > 0)
            out.push(`${sector}.${s.id}`);
      return out;
    };
    expect(buyers("timber")).toEqual(
      expect.arrayContaining([
        "manufacturing.standard",
        "manufacturing.building_materials",
        "manufacturing.consumer_goods",
        "construction.standard",
      ])
    );
    expect(buyers("iron")).toContain("manufacturing.heavy_metals");
    expect(buyers("coal")).toContain("manufacturing.heavy_metals");
    expect(buyers("natural_gas")).toContain("chemical_industries.standard");
    expect(buyers("oil")).toContain("logistics.standard");
    expect(buyers("fertilizers")).toContain("agriculture.standard");
    expect(buyers("plastics")).toContain("manufacturing.consumer_goods");
  });
});
