import { describe, it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { mergeNationalCorporations } from "./mergeNationalCorporations";
vi.mock("@/lib/nationalization/nationalCorporation", () => ({
  ensurePrimaryNationalCorporation: (db: Db, country: string) =>
    db
      .collection("corporations")
      .findOne({ countryOwnerId: country, isPrimaryNationalCorporation: true }),
}));
function world() {
  const f = createTransactionalMemoryDb(),
    old = new ObjectId(),
    survivor = new ObjectId(),
    site = new ObjectId();
  f.memory.seed("corporations", [
    {
      _id: survivor,
      countryId: "US",
      countryOwnerId: "US",
      isPrimaryNationalCorporation: true,
      liquidCapital: 200,
      liquidCurrencyCode: "USD",
    },
    {
      _id: old,
      countryId: "CA",
      countryOwnerId: "CA",
      isPrimaryNationalCorporation: true,
      liquidCapital: 280,
      liquidCurrencyCode: "CAD",
      shareEscrowBalance: 14,
      operatingCashArrearsByCurrency: { CAD: 10 },
      federalTaxArrearsAnchorByCountry: { CA: 5 },
      pendingOperatingCash: 3,
    },
  ]);
  f.memory.seed("corporateSectors", [
    {
      _id: site,
      corporationId: old,
      capacity: 20,
      inventory: { oil: 5 },
      constructionFinancing: { loanId: new ObjectId() },
    },
  ]);
  f.memory.seed("bankLoans", [
    {
      _id: new ObjectId(),
      borrowerType: "corporation",
      borrowerId: old,
      status: "current",
      currency: "CAD",
      outstanding: 80,
    },
  ]);
  f.memory.seed("bonds", [
    { _id: new ObjectId(), matured: false, holders: [{ corporationId: old, units: 7 }] },
  ]);
  const run = (db = f.db) =>
    mergeNationalCorporations(db, { fromCountryId: "CA", toCountryId: "US" });
  return { ...f, old, survivor, site, run };
}
describe("country absorption retains unsettled financial estates", () => {
  it("rolls back an interrupted reassignment and parallel retries keep one primary and every asset/claim", async () => {
    const f = world(),
      fault = withInjectedCrash(f.memory, {
        collection: "corporations",
        op: "updateMany",
        onCall: 1,
        afterWrite: true,
      });
    await expect(f.run(fault.db)).rejects.toThrow();
    expect(await f.db.collection("corporations").findOne({ _id: f.old })).toMatchObject({
      countryOwnerId: "CA",
      liquidCapital: 280,
    });
    await Promise.all([f.run(), f.run()]);
    expect(await f.db.collection("corporations").findOne({ _id: f.old })).toMatchObject({
      countryOwnerId: "US",
      isPrimaryNationalCorporation: false,
      liquidCapital: 280,
      liquidCurrencyCode: "CAD",
      shareEscrowBalance: 14,
      operatingCashArrearsByCurrency: { CAD: 10 },
      federalTaxArrearsAnchorByCountry: { CA: 5 },
      pendingOperatingCash: 3,
    });
    expect(await f.db.collection("corporations").findOne({ _id: f.survivor })).toMatchObject({
      liquidCapital: 200,
    });
    expect(await f.db.collection("corporateSectors").findOne({ _id: f.site })).toMatchObject({
      corporationId: f.old,
      capacity: 20,
      inventory: { oil: 5 },
    });
    expect(await f.db.collection("bankLoans").findOne({ borrowerId: f.old })).toMatchObject({
      outstanding: 80,
      currency: "CAD",
    });
    expect(await f.db.collection("bonds").findOne({})).toMatchObject({
      holders: [{ corporationId: f.old, units: 7 }],
    });
    expect(
      await f.db
        .collection("corporations")
        .countDocuments({ countryOwnerId: "US", isPrimaryNationalCorporation: true })
    ).toBe(1);
  });
});
