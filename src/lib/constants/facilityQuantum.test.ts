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
    // single unit already exceeds the target (automobiles). When this fails, a
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
    expect(facilitiesFromUnits("manufacturing_vehicles", 3.7)).toBe(3);
  });

  it("retains the automobile quantum for a manufacturing vehicle model", () => {
    expect(plantSizeUnits("manufacturing", "vehicles")).toBe(
      plantSizeUnits("manufacturing_vehicles")
    );
    expect(facilitiesFromUnits("manufacturing", 3.7, "vehicles")).toBe(3);
    expect(revenuePerCapacityUnit("manufacturing", 1, "vehicles")).toBe(
      revenuePerCapacityUnit("manufacturing_vehicles", 1)
    );
  });
});

describe("plantSizeForSector", () => {
  it("sizes a vehicle recipe on a plain manufacturing sector as a vehicle plant", () => {
    for (const strategyId of ["vehicle_assembly", "vehicle_heavy_machinery"]) {
      const sector = { sectorType: "manufacturing", strategyId };
      expect(plantSizeForSector(sector)).toBe(plantSizeUnits("manufacturing_vehicles"));
      expect(plantSizeForSector(sector)).toBe(
        plantSizeForSector({ sectorType: "manufacturing", industryModel: "vehicles" })
      );
      // 41.7 vehicle units are 41 vehicle plants, not 1 steel plant.
      expect(plantsFromUnitsForSector(sector, 41.7)).toBe(41);
    }
    expect(plantSizeForSector({ sectorType: "manufacturing", strategyId: "standard" })).toBe(25);
    expect(plantSizeForSector({ sectorType: "manufacturing" })).toBe(25);
  });

  it("maps every manufacturing recipe that makes vehicles to the vehicle plant size", () => {
    for (const strategy of SECTOR_STRATEGIES.manufacturing) {
      if (!((strategy.supply.vehicles ?? 0) > 0)) continue;
      expect(plantSizeForSector({ sectorType: "manufacturing", strategyId: strategy.id })).toBe(
        plantSizeUnits("manufacturing_vehicles")
      );
    }
  });

  it("prices a vehicle-recipe plant like a vehicle-model plant", () => {
    const rpu = revenuePerCapacityUnitForStrategy("manufacturing", "vehicle_assembly", 1);
    const nameplate =
      rpu * plantSizeForSector({ sectorType: "manufacturing", strategyId: "vehicle_assembly" });
    expect(nameplate).toBe(
      revenuePerCapacityUnitForStrategy("manufacturing", "standard", 1, "vehicles") *
        plantSizeUnits("manufacturing_vehicles")
    );
  });

  it("gives bulk updates a per-document size that matches the per-sector helper", () => {
    expect(plantSizeMongoExpr({ sectorType: "energy" })).toBe(250);
    expect(plantSizeMongoExpr({ sectorType: "manufacturing", industryModel: "vehicles" })).toBe(1);
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
