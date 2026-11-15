import { describe, it, expect } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { seedCaOpeningFinance } from "./seedCaOpeningFinance";

describe("Canadian opening finance", () => {
  it("books transfers and outstanding coupons exactly once, before the first turn", async () => {
    const memory = createInMemoryDb();
    const db = memory as unknown as Db;
    memory.seed("federalBudget", [
      {
        _id: "CA",
        countryId: "CA",
        debt: { principal: 1000 },
        revenue: { total: 300 },
        spending: { stateGrants: 0, debtInterest: 34, total: 200 },
      },
    ]);
    memory.seed("stateBudgets", [
      { _id: "CA_ON", countryId: "CA", revenue: { federalGrants: 12 } },
      { _id: "CA_QC", countryId: "CA", revenue: { federalGrants: 8 } },
      { _id: "CA", countryId: "US", revenue: { federalGrants: 999 } },
    ]);
    memory.seed("bonds", [
      {
        issuerType: "sovereign",
        countryId: "CA",
        totalIssued: 1000,
        couponRate: 2.5,
        matured: false,
        defaulted: false,
      },
    ]);
    await seedCaOpeningFinance(db, "2027-default");
    await seedCaOpeningFinance(db, "2027-default");
    expect(memory.collection("federalBudget").docs.find((row) => row._id === "CA")).toMatchObject({
      spending: { stateGrants: 20, debtInterest: 25, total: 211 },
      surplus: 89,
    });
  });
  it("does not change historical presets", async () => {
    const memory = createInMemoryDb();
    memory.seed("federalBudget", [{ _id: "CA", countryId: "CA", spending: { total: 200 } }]);
    await seedCaOpeningFinance(memory as unknown as Db, "1991-default");
    expect(await memory.collection("federalBudget").findOne({ _id: "CA" })).toEqual({
      _id: "CA",
      countryId: "CA",
      spending: { total: 200 },
    });
  });
});
