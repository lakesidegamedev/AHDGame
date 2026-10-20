import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { householdFixture } from "./testing/householdFixture";
import { openingHouseholdCalibration1991 } from "./openingSeed1991";
import { collectResetMetricOwnerReadings } from "./collectOwnerReadings";

describe("automatic calibrated household activation", () => {
  function setup(country: "US" | "UK" | "JP") {
    const fixture = householdFixture(country, 2, 0);
    const f = { ...fixture, national: { ...fixture.national, householdSource: undefined } };
    const calibration = openingHouseholdCalibration1991(country);
    const regions = calibration.map((r) => ({
      ...f.regions[0]!,
      _id: `${country}:${r.regionId}`,
      regionId: r.regionId,
    }));
    const db = createMockDb();
    const rows = (name: string, data: unknown[]) =>
      db.collection(name).find.mockReturnValue({ toArray: vi.fn().mockResolvedValue(data) });
    db.collection("gameState").findOne.mockResolvedValue({
      _id: "current",
      preset: "1991-default",
    });
    rows(
      "states",
      calibration.map((r) => ({
        _id: r.regionId,
        countryId: country,
        population: r.population,
        gdp: r.output,
      }))
    );
    rows(
      "macroMetrics",
      calibration.map((r) => ({
        _id: r.regionId,
        countryId: country,
        economic: {
          costOfLiving: { value: r.costOfLiving },
          medianIncome: { value: r.medianIncome },
        },
      }))
    );
    rows("federalBudget", [{ countryId: country, taxRates: { incomeTax: 20, payrollTax: 10 } }]);
    rows(
      "stateBudgets",
      country === "US"
        ? calibration.map((r) => ({
            _id: r.regionId,
            countryId: country,
            taxRates: { incomeTax: 5, propertyTax: 1 },
          }))
        : []
    );
    rows(
      "regionalBudgets",
      country === "US"
        ? []
        : calibration.map((r) => ({
            _id: r.regionId,
            countryId: country,
            turn: 2,
            councilTaxRevenue: 0,
            residentTaxRevenue: 0,
            fixedAssetTaxRevenue: 0,
          }))
    );
    rows("resetLawPrograms", [
      {
        _id: "cash",
        country,
        scope: "national",
        familyId: "L01",
        choice: "far_left",
        effectiveTurn: 1,
        fundingAccountId: "account",
        primaryMetricEffects: [],
      },
    ]);
    rows("resetDepartmentAccounts", [
      {
        _id: "account",
        countryId: country,
        accruedThroughTurn: 2,
        lastProgramDelivery: { L01: { outlaid: 1000000, implementationFactor: 1 } },
      },
    ]);
    return { f, db, regions, calibration, rows };
  }
  it.each(["US", "UK", "JP"] as const)(
    "activates %s without installing an external income frame",
    async (country) => {
      const { f, db, regions } = setup(country);
      const result = await collectResetMetricOwnerReadings(
        db as unknown as Db,
        [f.national, ...regions],
        2,
        1991
      );
      expect(result[f.national._id]!.householdProductionStatus).toMatchObject({
        path: "produced",
        gaps: [],
        evaluatedAtTurn: 2,
      });
      for (const r of regions) {
        expect(result[r._id]!.updates["02"]!.definitionVersion).toBe(2);
        expect(result[r._id]!.updates["02"]!.status).toBe("proxy");
        expect(result[r._id]!.updates["03"]!.observedAtTurn).toBe(2);
      }
      expect(db.collection("resetLawPrograms").find).toHaveBeenCalledTimes(1);
      expect(db.collection("stateBudgets").find).toHaveBeenCalledTimes(country === "US" ? 2 : 1);
    }
  );
  it("keeps a partial regional roster on legacy with an explicit reason", async () => {
    const { f, db, regions } = setup("US");
    const result = await collectResetMetricOwnerReadings(
      db as unknown as Db,
      [f.national, ...regions.slice(1)],
      2,
      1991
    );
    expect(result[f.national._id]!.householdProductionStatus).toMatchObject({
      path: "legacy",
      gaps: ["incomplete-cohort-calibration-roster"],
    });
  });
  it("does not use regional tax assessments beyond their scheduled validity window", async () => {
    const { f, db, regions, rows, calibration } = setup("JP");
    rows(
      "regionalBudgets",
      calibration.map((r) => ({
        _id: r.regionId,
        countryId: "JP",
        turn: 0,
        residentTaxRevenue: 0,
        fixedAssetTaxRevenue: 0,
      }))
    );
    const result = await collectResetMetricOwnerReadings(
      db as unknown as Db,
      [f.national, ...regions],
      2,
      1991
    );
    expect(result[f.national._id]!.householdProductionStatus).toMatchObject({
      path: "legacy",
      gaps: ["invalid-current-regional-household-levy"],
    });
  });
});
