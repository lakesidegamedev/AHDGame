import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { seedUS2027Grants } from "./seedUS2027Grants";

vi.mock("@/lib/budget/grants", () => ({
  processFormulaGrants: async () => ({ CA: 100, TX: 200 }),
}));

describe("US opening annual grants", () => {
  it("books the opening pool before ordinary spending refreshes freeze it, idempotently", async () => {
    const memory = createInMemoryDb();
    memory.seed("federalBudget", [
      {
        _id: "federal",
        countryId: "US",
        revenue: { total: 1_000 },
        spending: { total: 400, stateGrants: 0 },
      },
    ]);
    memory.seed(
      "stateBudgets",
      ["CA", "TX"].map((stateId) => ({
        _id: stateId,
        stateId,
        countryId: "US",
        revenue: { total: 50, federalGrants: 10 },
        spending: { total: 50, byCategory: { education: 50 } },
      }))
    );
    await seedUS2027Grants(memory as unknown as Db);
    await seedUS2027Grants(memory as unknown as Db);
    expect(memory.collection("federalBudget").docs[0]).toMatchObject({
      spending: { total: 700, stateGrants: 300 },
      surplus: 300,
    });
    expect(memory.collection("stateBudgets").docs.map((row) => row.revenue)).toEqual([
      { total: 140, federalGrants: 100 },
      { total: 240, federalGrants: 200 },
    ]);
  });
});
