import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { getInitialNationalBudgetsForPreset } from "@/lib/seeds/reference/budgets";
import { seedModernTransitionBudgets2027 } from "./seedModernTransitionBudgets2027";

const noop = () => {};

describe("2027 transition fiscal seeding", () => {
  it("persists an authored 2027 budget for every transition country", async () => {
    const db = createInMemoryDb() as unknown as Db;
    const sources = new Map(
      getInitialNationalBudgetsForPreset("2027-default").map((budget) => [budget.countryId, budget])
    );
    expect(sources.get("HU")).toBeDefined();
    expect(sources.get("BG")).toBeDefined();

    await seedModernTransitionBudgets2027(db, true, "2027-default", noop);
    const rows = await db
      .collection<{ countryId: string; gdp: number; currencyCode: string }>("federalBudget")
      .find({ countryId: { $in: ["HU", "PL", "RO", "BG", "RU"] } })
      .toArray();
    expect(rows.map((row) => row.countryId).sort()).toEqual(["BG", "HU", "PL", "RO", "RU"]);
    for (const row of rows) {
      expect(row.gdp).toBe(sources.get(row.countryId)?.gdp);
    }
    expect(rows.find((row) => row.countryId === "BG")?.currencyCode).toBe("EUR");

    await seedModernTransitionBudgets2027(db, false, "2027-default", noop);
    expect(await db.collection("federalBudget").countDocuments({ countryId: "HU" })).toBe(1);
    expect(await db.collection("federalBudget").countDocuments({ countryId: "BG" })).toBe(1);
  });

  it("does not seed a modern budget in 1991", async () => {
    const db = createInMemoryDb() as unknown as Db;
    await seedModernTransitionBudgets2027(db, true, "1991-default", noop);
    expect(await db.collection("federalBudget").countDocuments({})).toBe(0);
  });
});
