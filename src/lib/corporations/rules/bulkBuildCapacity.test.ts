import { describe, expect, it } from "vitest";
import { plantSizeUnits } from "@/lib/constants/facilityQuantum";
import { bulkBuildUnits, planBulkBuild, selectBulkBuildSectors } from "./bulkBuildCapacity";

const MAX_UNITS = 10_000_000;

describe("selectBulkBuildSectors", () => {
  const sectors = [
    { sectorId: "c", countryId: "US", sectorType: "retail", stateId: "US-TX" },
    { sectorId: "a", countryId: "US", sectorType: "energy", stateId: "US-CA" },
    { sectorId: "b", countryId: "GB", sectorType: "energy", stateId: "GB-ENG" },
    { sectorId: "d", countryId: "US", sectorType: "energy", stateId: "US-AL" },
  ];

  it("matches everything by default, in country, type, state order", () => {
    expect(selectBulkBuildSectors(sectors, {}).map((s) => s.sectorId)).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
  });

  it("narrows by country and sector type", () => {
    expect(
      selectBulkBuildSectors(sectors, { countryId: "US", sectorType: "energy" }).map(
        (s) => s.sectorId
      )
    ).toEqual(["d", "a"]);
  });

  it("narrows to an explicit id list, still inside the filters", () => {
    expect(
      selectBulkBuildSectors(sectors, { countryId: "US", sectorIds: ["a", "b"] }).map(
        (s) => s.sectorId
      )
    ).toEqual(["a"]);
  });
});

describe("bulkBuildUnits", () => {
  const per = plantSizeUnits("energy");

  it("buys whole facilities for the facilities rule", () => {
    expect(
      bulkBuildUnits(
        { kind: "facilities", count: 3 },
        { sectorType: "energy", capacityUnits: 0 },
        MAX_UNITS
      )
    ).toBe(3 * per);
  });

  it("rounds a percentage up to whole facilities, never below one", () => {
    expect(
      bulkBuildUnits(
        { kind: "percent", percent: 10 },
        { sectorType: "energy", capacityUnits: 0 },
        MAX_UNITS
      )
    ).toBe(per);
    expect(
      bulkBuildUnits(
        { kind: "percent", percent: 10 },
        { sectorType: "energy", capacityUnits: per * 25 },
        MAX_UNITS
      )
    ).toBe(3 * per);
  });

  it("caps at the single-order maximum on a facility boundary", () => {
    const units = bulkBuildUnits(
      { kind: "facilities", count: 100 },
      { sectorType: "energy", capacityUnits: 0 },
      per * 7 + 1
    );
    expect(units).toBe(per * 7);
  });
});

describe("planBulkBuild", () => {
  it("spends in order, passes over blocked rows and stops at the first unaffordable one", () => {
    const plan = planBulkBuild(
      [
        { sectorId: "1", costLocal: 40, blockedReason: null },
        { sectorId: "2", costLocal: 0, blockedReason: "Mothballed" },
        { sectorId: "3", costLocal: 50, blockedReason: null },
        { sectorId: "4", costLocal: 20, blockedReason: null },
        { sectorId: "5", costLocal: 5, blockedReason: null },
      ],
      100
    );
    expect(plan.rows.map((r) => r.status)).toEqual([
      "ready",
      "blocked",
      "ready",
      "over_budget",
      "over_budget",
    ]);
    expect(plan.readyCount).toBe(2);
    expect(plan.readyCostLocal).toBe(90);
    expect(plan.cashAfterLocal).toBe(10);
  });

  it("treats a non-finite balance as no cash", () => {
    const plan = planBulkBuild([{ sectorId: "1", costLocal: 1, blockedReason: null }], NaN);
    expect(plan.rows[0].status).toBe("over_budget");
  });
});
