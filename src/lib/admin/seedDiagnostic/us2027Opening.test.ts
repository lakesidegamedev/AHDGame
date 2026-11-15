import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { checkUS2027Opening } from "./us2027Opening";

describe("US 2027 opening diagnostic regressions", () => {
  it("detects the audited coupon mismatch and accepts a reconciled opening stock", async () => {
    const db = createInMemoryDb() as unknown as Db;
    await db.collection("federalBudget").insertOne({
      countryId: "US",
      gdp: 32.8e12,
      debt: { principal: 39e12 },
      spending: { byCategory: {}, debtInterest: 1.326e12 },
    });
    await db.collection("bonds").insertOne({
      countryId: "US",
      issuerType: "sovereign",
      matured: false,
      defaulted: false,
      totalIssued: 39e12,
      couponRate: 3.8875,
    });
    const debtCheck = async () =>
      (await checkUS2027Opening(db, "2027-default")).find(
        (c) => c.metric === "sovereign-debt-interest"
      );
    expect((await debtCheck())?.severity).toBe("critical");
    await db.collection("bonds").updateMany({ countryId: "US" }, { $set: { couponRate: 3.4 } });
    expect((await debtCheck())?.severity).toBe("ok");
  });
  it("detects the audited world failures instead of accepting arithmetic reconciliation", async () => {
    const db = createInMemoryDb() as unknown as Db;
    await db.collection("states").insertOne({
      _id: "CA" as never,
      countryId: "US",
      population: 10,
      gdp: 1,
      stateSenateSeats: 40,
    });
    await db.collection("regionDemographics").insertOne({
      _id: "CA" as never,
      countryId: "US",
      ages: { male: [11, ...Array(100).fill(0)], female: Array(101).fill(0) },
    });
    await db.collection("electedOfficials").insertMany([
      { countryId: "US", officeType: "house", seatsHeld: 1 },
      { countryId: "US", officeType: "stateSenate", seatsHeld: 39 },
    ]);
    await db.collection("congressionalDistricts").insertOne({
      countryId: "US",
      holderParty: null,
      holderNppId: null,
      holderCharacterId: null,
    });
    await db
      .collection("federalBudget")
      .insertOne({ countryId: "US", gdp: 2e6, spending: { byCategory: { defense: 1e6 } } });
    await db
      .collection("gameState")
      .insertOne({ _id: "current" as never, cabinetSystemVersion: "v2", resetWorldId: "current" });
    await db
      .collection("resetDepartmentAccounts")
      .insertOne({ countryId: "US", worldId: "current", annualAuthority: 0 });
    await db.collection("elections").insertOne({
      countryId: "US",
      electionType: "governor",
      state: "KY",
      cycle: 1,
      electionYear: 2030,
    });
    const failures = (await checkUS2027Opening(db, "2027-default"))
      .filter((c) => c.severity === "critical")
      .map((c) => c.metric);
    expect(failures).toEqual(
      expect.arrayContaining([
        "gdp-reconciliation",
        "cohort-conservation",
        "district-holders",
        "upper-chamber-capacity",
        "composition-defense",
        "composition-healthcare",
        "department-authority",
        "regional-calendars",
      ])
    );
  });
  it("does not impose the 2027 US model on other presets", async () => {
    const untouched = new Proxy(
      {},
      {
        get() {
          throw new Error("Database must not be accessed");
        },
      }
    ) as Db;
    expect(await checkUS2027Opening(untouched, "1991-default")).toEqual([]);
  });
});
