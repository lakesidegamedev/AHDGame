import { describe, expect, it } from "vitest";
import { CORPORATION_TYPES, type CorporationType } from "./corporations";
import {
  capacityPricePerUnit,
  computeBuildCost,
  revenuePerCapacityUnitForStrategy,
} from "./capacityEconomy";
import { getStrategy, getEffectiveStrategyRates, getSectorStrategies } from "./sectorStrategies";
import { sectorEntryFeeAnchor } from "@/lib/corporations/foundingPlant";
import { getEraNominalAmount } from "./sectorSeedEra";

// Pre-1991-calibration recipe values (retail standard carries the current shared trim). These fixtures
// deliberately do not derive their expectations from the current recipe table.
const LEGACY_INPUTS = {
  manufacturing: {
    energy: 0.18,
    iron: 0.13,
    coal: 0.1,
    electronics: 0.08,
    freight: 0.08,
    real_estate_services: 0.03,
    plastics: 0.07,
  },
  healthcare: {
    pharmaceuticals: 0.11,
    electronics: 0.11,
    software: 0.12,
    energy: 0.05,
    real_estate_services: 0.04,
    food: 0.05,
    vehicles: 0.025,
    plastics: 0.06,
  },
  defense: {
    steel: 0.2,
    iron: 0.1,
    rare_earth: 0.05,
    electronics: 0.2,
    software: 0.1,
    construction_services: 0.05,
    vehicles: 0.03,
  },
  construction: {
    building_materials: 0.13,
    steel: 0.13,
    energy: 0.12,
    vehicles: 0.08,
    financial_services: 0.05,
    rare_earth: 0.04,
    natural_gas: 0.02,
    timber: 0.07,
    plastics: 0.06,
  },
  retail: {
    food: 0.081,
    electronics: 0.049,
    energy: 0.041,
    vehicles: 0.033,
    freight: 0.049,
    advertising: 0.065,
    software: 0.041,
    financial_services: 0.033,
    real_estate_services: 0.029,
    plastics: 0.029,
  },
};

describe("1991 reset calibration does not change other era presets", () => {
  it.each([
    [1953, 3],
    [2019, 15],
  ] as const)("preserves %i construction and founding list prices", (year, revenueDays) => {
    for (const sectorType of CORPORATION_TYPES) {
      const rpu = revenuePerCapacityUnitForStrategy(sectorType, "standard", 1);
      expect(capacityPricePerUnit(sectorType, year, 1, "standard")).toBeCloseTo(
        rpu * revenueDays,
        8
      );
      const base = { sectorType, strategyId: "standard", year, eraUnitScale: 1, units: 10 };
      expect(computeBuildCost({ ...base, founding: true }).totalAnchor).toBeCloseTo(
        10 * rpu * revenueDays * 0.1,
        8
      );
      expect(computeBuildCost(base).totalAnchor).toBeCloseTo(10 * rpu * revenueDays * 0.8, 8);
    }
  });

  it.each(["1953-default", "2019-default"])(
    "preserves %s input recipes, transitions, menus and entry fees",
    (preset) => {
      for (const [type, demand] of Object.entries(LEGACY_INPUTS)) {
        expect(getStrategy(type, "standard", preset).demand).toEqual(demand);
        expect(getEffectiveStrategyRates(type, "standard", null, null, 50, preset).demand).toEqual(
          demand
        );
        expect(
          getSectorStrategies(type, false, preset).find((s) => s.id === "standard")?.demand
        ).toEqual(demand);
      }
      expect(sectorEntryFeeAnchor(preset)).toBe(Math.round(getEraNominalAmount(100_000, preset)));
    }
  );

  it("keeps 1991 recipes and entry fees scoped to the originating preset", () => {
    expect(getStrategy("manufacturing", "standard", "1991-default").demand.energy).toBe(0.16);
    expect(getStrategy("manufacturing", "standard").demand.energy).toBe(0.18);
    expect(sectorEntryFeeAnchor("1991-default")).toBe(2_500);
  });

  it("keeps 1991 construction balanced after the game clock advances and isolates presets", () => {
    const sectorType: CorporationType = "manufacturing";
    const rpu = revenuePerCapacityUnitForStrategy(sectorType, "standard", 1);
    const base = {
      sectorType,
      strategyId: "standard",
      units: 10,
      year: 1992,
      eraUnitScale: 1,
      founding: true,
    };
    expect(computeBuildCost({ ...base, preset: "1991-default" }).totalAnchor).toBeCloseTo(
      10 * rpu,
      8
    );
    expect(
      computeBuildCost({ ...base, year: 1991, preset: "2019-default" }).foundingMultiplier
    ).toBe(0.1);
  });
});
