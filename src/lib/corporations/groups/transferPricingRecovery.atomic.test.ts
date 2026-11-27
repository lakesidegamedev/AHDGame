import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { applyTransferPricingAudit } from "./applyTransferPricingAudit";
vi.mock("./groupMembership", () => ({
  resolveFormalizedGroups: async () => ({
    membersByRootId: new Map([["root", []]]),
    rootByCorpId: { get: () => "root" },
  }),
}));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/currency/corporationCapital", async (original) => ({
  ...(await original<typeof import("@/lib/currency/corporationCapital")>()),
  getCorpFxRate: async () => 2,
}));
vi.mock("@/lib/nationalization/treasury", () => ({
  collectFundedCorporationPayment: async () => null,
  creditTreasuryProceedsFromAnchor: async (
    db: import("mongodb").Db,
    countryId: string,
    anchor: number
  ) => {
    await db
      .collection("federalBudget")
      .updateOne({ _id: countryId as never }, { $inc: { treasuryBalance: anchor * 3 } });
  },
}));
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTx: async (db: import("mongodb").Db, row: object) => {
    await db.collection("financialTxLog").insertOne(row);
  },
}));
function world(cash = 0) {
  const f = createTransactionalMemoryDb(),
    supplier = new ObjectId(),
    buyer = new ObjectId(),
    agreement = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", worldEpochId: "pricing", currentTurn: 10 }]);
  f.memory.seed("corporations", [
    {
      _id: supplier,
      name: "Supplier",
      countryId: "US",
      liquidCurrencyCode: "USD",
      liquidCapital: cash,
    },
    { _id: buyer, name: "Buyer", countryId: "CA" },
  ]);
  f.memory.seed("federalBudget", [{ _id: "CA", treasuryBalance: 0 }]);
  f.memory.seed("supplyAgreements", [
    {
      _id: agreement,
      supplierCorpId: supplier,
      buyerCorpId: buyer,
      transferPricingExposureAnchor: 0,
    },
  ]);
  const premium = {
    agreementId: String(agreement),
    supplierCorpId: String(supplier),
    buyerCorpId: String(buyer),
    pricePremium: 0.1,
    premiumAnchor: 5_000_000,
  };
  const run = (db = f.db, turn = 10, premiums = [premium]) =>
    applyTransferPricingAudit(db, premiums, new Map([["CA", 20]]), turn, new Date());
  return { ...f, supplier, agreement, run };
}
describe("transfer pricing durable collection", () => {
  it("keeps an unpaid assessment and collects without new trades in a later turn", async () => {
    const f = world();
    await f.run();
    await f.run();
    expect(await f.db.collection("supplyAgreements").findOne({ _id: f.agreement })).toMatchObject({
      transferPricingExposureAnchor: 0,
      transferPricingPendingAssessment: { assessmentAnchor: 1_400_000 },
    });
    await f.db
      .collection("corporations")
      .updateOne({ _id: f.supplier }, { $set: { liquidCapital: 3_000_000 } });
    const results = await Promise.all([f.run(f.db, 11, []), f.run(f.db, 11, [])]);
    expect(results.every((r) => r.errors.length === 0)).toBe(true);
    expect(await f.db.collection("corporations").findOne({ _id: f.supplier })).toMatchObject({
      liquidCapital: 200_000,
    });
    expect(await f.db.collection("federalBudget").findOne({ _id: "CA" as never })).toMatchObject({
      treasuryBalance: 4_200_000,
    });
    expect(
      await f.db.collection("supplyAgreements").findOne({ _id: f.agreement })
    ).not.toHaveProperty("transferPricingPendingAssessment");
    expect(await f.db.collection("financialTxLog").countDocuments({})).toBe(1);
  });
  it("rolls back a landed treasury credit and recovers once on retry", async () => {
    const f = world(3_000_000),
      fault = withInjectedCrash(f.memory, {
        collection: "federalBudget",
        op: "updateOne",
        onCall: 1,
        afterWrite: true,
      });
    expect((await f.run(fault.db)).errors).toHaveLength(1);
    expect(await f.db.collection("corporations").findOne({ _id: f.supplier })).toMatchObject({
      liquidCapital: 3_000_000,
    });
    expect(await f.db.collection("federalBudget").findOne({ _id: "CA" as never })).toMatchObject({
      treasuryBalance: 0,
    });
    await f.run();
    await f.run();
    expect(await f.db.collection("corporations").findOne({ _id: f.supplier })).toMatchObject({
      liquidCapital: 200_000,
    });
    expect(await f.db.collection("financialTxLog").countDocuments({})).toBe(1);
  });
});
