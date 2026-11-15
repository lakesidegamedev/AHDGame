import { describe, it, expect } from "vitest";
import {
  FACILITY_TARGET_DAILY_REVENUE_ANCHOR,
  facilitiesFromUnits,
  plantSizeForSector,
  plantSizeMongoExpr,
  plantSizeUnits,
  plantsFromUnitsForSector,
} from "./facilityQuantum";
import { SECTOR_STRATEGIES } from "./sectorStrategies";
import { revenuePerCapacityUnitForStrategy } from "./capacityEconomy";
import { CORPORATION_TYPES } from "./corporations";
import { revenuePerCapacityUnit } from "./capacityEconomy";

describe("plantSizeUnits", () => {
  it("is a positive integer for every sector type", () => {
    for (const type of CORPORATION_TYPES) {
      const size = plantSizeUnits(type);
      expect(Number.isInteger(size)).toBe(true);
      expect(size).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps each facility's nameplate near the target daily revenue", () => {
    // Authored values are legible roundings of target / RPU. The band is wide
    // enough for the rounding and deliberately floors at 1 for sectors whose
    // single unit already exceeds the target. When this fails, a
    // strategy or base-price change moved the sector's RPU — re-round the
    // authored entry on purpose rather than loosening the band.
    for (const type of CORPORATION_TYPES) {
      const rpu = revenuePerCapacityUnit(type, 1);
      if (!(rpu > 0)) continue;
      const size = plantSizeUnits(type);
      const nameplate = size * rpu;
      if (rpu >= FACILITY_TARGET_DAILY_REVENUE_ANCHOR) {
        // One unit is already a facility or more; the floor is the answer.
        expect(size).toBe(1);
        continue;
      }
      expect(nameplate).toBeGreaterThan(FACILITY_TARGET_DAILY_REVENUE_ANCHOR * 0.6);
      expect(nameplate).toBeLessThan(FACILITY_TARGET_DAILY_REVENUE_ANCHOR * 1.4);
    }
  });
});

describe("facilitiesFromUnits", () => {
  it("floors to whole facilities but never reports 0 for real capacity", () => {
    expect(facilitiesFromUnits("energy", 0)).toBe(0);
    expect(facilitiesFromUnits("energy", -5)).toBe(0);
    expect(facilitiesFromUnits("energy", NaN)).toBe(0);
    expect(facilitiesFromUnits("energy", 10)).toBe(1);
    expect(facilitiesFromUnits("energy", 250)).toBe(1);
    expect(facilitiesFromUnits("energy", 749)).toBe(2);
    expect(facilitiesFromUnits("energy", 2500)).toBe(10);
    expect(facilitiesFromUnits("manufacturing", 51)).toBe(2);
  });
});

describe("plantSizeForSector", () => {
  it("sizes a vehicle recipe on a manufacturing sector as a one-unit vehicle plant", () => {
    for (const strategyId of ["vehicle_assembly", "vehicle_heavy_machinery"]) {
      const sector = { sectorType: "manufacturing", strategyId };
      expect(plantSizeForSector(sector)).toBe(1);
      // 41.7 vehicle units are 41 vehicle plants, not 1 steel plant.
      expect(plantsFromUnitsForSector(sector, 41.7)).toBe(41);
    }
    expect(plantSizeForSector({ sectorType: "manufacturing", strategyId: "standard" })).toBe(25);
    expect(plantSizeForSector({ sectorType: "manufacturing" })).toBe(25);
  });

  it("gives every manufacturing recipe that makes only vehicles the one-unit vehicle plant", () => {
    for (const strategy of SECTOR_STRATEGIES.manufacturing) {
      const outputs = Object.keys(strategy.supply);
      if (!(outputs.length === 1 && outputs[0] === "vehicles")) continue;
      expect(plantSizeForSector({ sectorType: "manufacturing", strategyId: strategy.id })).toBe(1);
    }
  });

  it("keeps a vehicle-recipe plant's nameplate near the target daily revenue", () => {
    for (const strategyId of ["vehicle_assembly", "vehicle_heavy_machinery"]) {
      const rpu = revenuePerCapacityUnitForStrategy("manufacturing", strategyId, 1);
      expect(rpu).toBeGreaterThan(FACILITY_TARGET_DAILY_REVENUE_ANCHOR);
      expect(plantSizeForSector({ sectorType: "manufacturing", strategyId })).toBe(1);
    }
  });

  it("gives bulk updates a per-document size that matches the per-sector helper", () => {
    expect(plantSizeMongoExpr({ sectorType: "energy" })).toBe(250);
    expect(plantSizeMongoExpr({ sectorType: "technology" })).toBe(25);
    expect(plantSizeMongoExpr({ sectorType: "manufacturing" })).toEqual({
      $switch: {
        branches: [
          { case: { $eq: ["$strategyId", "vehicle_assembly"] }, then: 1 },
          { case: { $eq: ["$strategyId", "vehicle_heavy_machinery"] }, then: 1 },
        ],
        default: 25,
      },
    });
  });
});
