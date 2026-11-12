import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { processFormulaGrants } from "./grants";
import {
  allocateFormulaGrants,
  formulaGrantPool,
  grantPovertyRate,
  openingRegionalGrantBudget,
} from "./rules/formulaGrants";
import { formulaGrants } from "@/lib/seeds/reference/formulaGrants";

describe("formula grant allocation", () => {
  it("loads _id-keyed poverty records with country isolation and valid zero rates", async () => {
    const db = createInMemoryDb() as unknown as Db;
    await db.collection("states").insertMany([
      { _id: "A" as never, countryId: "US", population: 100 },
      { _id: "B" as never, countryId: "US", population: 100 },
      { _id: "C" as never, countryId: "UK", population: 100 },
    ]);
    await db.collection("macroMetrics").insertMany([
      { _id: "A" as never, countryId: "US", economic: { povertyRate: { value: 0 } } },
      { _id: "B" as never, countryId: "US", economic: { povertyRate: { value: 20 } } },
      { _id: "C" as never, countryId: "UK", economic: { povertyRate: { value: 90 } } },
    ]);
    const result = await processFormulaGrants(db, 1000, "US");
    expect(result).toEqual({ A: 35, B: 235 });
    expect(Object.values(result).reduce((a, b) => a + b, 0)).toBe(
      formulaGrantPool(1000, formulaGrants)
    );
  });
  it("uses population when there is no poverty population and never creates NaN", () => {
    expect(
      allocateFormulaGrants(1000, formulaGrants, [
        { id: "A", population: 100, povertyRate: 0 },
        { id: "B", population: 300, povertyRate: 0 },
      ])
    ).toEqual({ A: 67.5, B: 202.5 });
    expect(grantPovertyRate(0)).toBe(0);
    expect(grantPovertyRate(undefined)).toBe(12);
  });
  it("reconciles regional services without compounding on reseed", () => {
    const first = openingRegionalGrantBudget({
      revenue: 100,
      oldGrant: 10,
      newGrant: 30,
      spending: { education: 60, other: 40 },
    });
    expect(first).toEqual({
      revenue: 120,
      byCategory: { education: 72, other: 48 },
      spending: 120,
      surplus: 0,
    });
    expect(
      openingRegionalGrantBudget({
        revenue: first.revenue,
        oldGrant: 30,
        newGrant: 30,
        spending: first.byCategory,
      })
    ).toEqual(first);
  });
});
