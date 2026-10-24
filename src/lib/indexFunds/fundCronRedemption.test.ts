/** NPC payout receipts describe the actual stored cash transfer exactly once. */
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { IndexFund, IndexFundRedemptionQueueEntry } from "@/lib/db/types";
import { loadQueuedRedemptionUnitsByFundId } from "./fundValuation";
import {
  deriveLedgerEntries,
  fundMirrorAccount,
  type DerivableTx,
} from "@/lib/ledger/deriveFromTx";
import { processQueuedRedemptions } from "./fundCron";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

function testFund(fundId: ObjectId): IndexFund {
  return {
    _id: fundId,
    slug: "npp-redemption-test",
    name: "NPP Redemption Fund",
    tickerSymbol: "NRF",
    scope: "country",
    kind: "broad",
    countryId: "US",
    anchorCurrencyCode: "USD",
    status: "active",
    quotedNav: 100,
    unitSupply: 1_000_000,
    reserveUnits: 0,
    cashAnchor: 10_000,
    targetConstituents: [],
    holdings: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function nppEntry(fundId: ObjectId, nppId: ObjectId): IndexFundRedemptionQueueEntry {
  return {
    _id: new ObjectId(),
    fundId,
    holderKind: "npp",
    nppId,
    units: 10,
    requestedNavAnchor: 100,
    requestedAmountAnchor: 1_000,
    paidAmountAnchor: 0,
    status: "queued",
    unitsBurnedAtRequest: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function world(country = "US") {
  const memory = createInMemoryDb(),
    fundId = new ObjectId(),
    nppId = new ObjectId();
  const fund = testFund(fundId),
    entry = nppEntry(fundId, nppId);
  memory.seed("indexFunds", [{ ...fund }]);
  memory.seed("indexFundRedemptionQueue", [{ ...entry }]);
  memory.seed("npps", [{ _id: nppId, countryId: country, nppInvestmentCashAnchor: 50 }]);
  memory.seed("gameConfig", [{ _id: "default", ledgerShadow: true }]);
  return { memory, db: memory as unknown as Db, fundId, nppId, fund, entry };
}
describe("queued NPC redemption cash witness", () => {
  it("persists one exact subject witness and same-currency mirror", async () => {
    const f = world();
    expect(await processQueuedRedemptions(f.db, f.fund, false, 7)).toBe(1);
    const rows = f.memory.collection("financialTxLog").docs;
    expect(rows).toHaveLength(1);
    const row = rows[0] as unknown as DerivableTx;
    expect(row).toMatchObject({
      type: "index_fund_redeem",
      turn: 7,
      subjectType: "npp",
      subjectId: f.nppId,
      amount: 1000,
      anchorAmount: 1000,
      currencyCode: "USD",
      meta: { fundId: String(f.fundId), fundCurrency: "USD", units: 10, source: "cron_queue" },
    });
    expect(fundMirrorAccount(row)).toBe(`fund:${f.fundId}:USD`);
    expect(deriveLedgerEntries([row])).toHaveLength(2);
    expect(f.memory.collection("ledgerEntries").docs).toHaveLength(2);
    expect(await f.db.collection("npps").findOne({ _id: f.nppId })).toMatchObject({
      nppInvestmentCashAnchor: 1050,
    });
    expect(await f.db.collection("indexFunds").findOne({ _id: f.fundId })).toMatchObject({
      cashAnchor: 9000,
    });
  });
  it("writes off a claim whose holder is gone instead of retrying it forever", async () => {
    const f = world();
    await f.db.collection("npps").deleteMany({});
    expect(await processQueuedRedemptions(f.db, f.fund, false, 7)).toBe(0);
    // No debit and no receipts: nothing can receive this payout.
    expect(f.memory.collection("financialTxLog").docs).toHaveLength(0);
    expect(f.memory.collection("indexFundTransactions").docs).toHaveLength(0);
    expect(f.memory.collection("ledgerEntries").docs).toHaveLength(0);
    expect(await f.db.collection("indexFunds").findOne({ _id: f.fundId })).toMatchObject({
      cashAnchor: 10000,
      unitSupply: 1_000_000,
    });
    expect(
      await f.db.collection("indexFundRedemptionQueue").findOne({ _id: f.entry._id })
    ).toMatchObject({ status: "cancelled", units: 10, cancelReason: "holder_missing" });
    // The written-off row no longer holds the fund out of trading or NAV backing.
    const queued = await loadQueuedRedemptionUnitsByFundId(f.db, [f.fundId]);
    expect(queued.get(String(f.fundId)) ?? 0).toBe(0);
    // Terminal: a later pass has nothing left to claim.
    expect(await processQueuedRedemptions(f.db, f.fund, false, 8)).toBe(0);
    expect(f.memory.collection("financialTxLog").docs).toHaveLength(0);
  });

  it("writes off only the unpaid remainder of a partially paid claim", async () => {
    const f = world();
    await f.db
      .collection("indexFundRedemptionQueue")
      .updateOne(
        { _id: f.entry._id },
        { $set: { status: "partial", paidAmountAnchor: 400, units: 6 } }
      );
    await f.db.collection("npps").deleteMany({});
    expect(await processQueuedRedemptions(f.db, f.fund, false, 7)).toBe(0);
    expect(
      await f.db.collection("indexFundRedemptionQueue").findOne({ _id: f.entry._id })
    ).toMatchObject({ status: "cancelled", units: 6, paidAmountAnchor: 400 });
    expect(f.memory.collection("financialTxLog").docs).toHaveLength(0);
  });

  it("writes off a legacy claim whose units never left the fund", async () => {
    const f = world();
    await f.db
      .collection("indexFundRedemptionQueue")
      .updateOne({ _id: f.entry._id }, { $unset: { unitsBurnedAtRequest: "" } });
    await f.db.collection("npps").deleteMany({});
    expect(await processQueuedRedemptions(f.db, f.fund, false, 7)).toBe(0);
    expect(
      await f.db.collection("indexFundRedemptionQueue").findOne({ _id: f.entry._id })
    ).toMatchObject({ status: "cancelled", units: 10 });
    // Legacy units were never removed, so unitSupply stays as it was.
    expect(await f.db.collection("indexFunds").findOne({ _id: f.fundId })).toMatchObject({
      cashAnchor: 10000,
      unitSupply: 1_000_000,
    });
  });

  it("pays live holders and writes off only the vanished one in the same pass", async () => {
    const f = world();
    const liveId = new ObjectId();
    await f.db
      .collection("npps")
      .insertOne({ _id: liveId, countryId: "US", name: "Live NPP", nppInvestmentCashAnchor: 0 });
    await f.db.collection("indexFundRedemptionQueue").insertOne({
      ...f.entry,
      _id: new ObjectId(),
      nppId: liveId,
      units: 5,
      requestedAmountAnchor: 500,
    });
    await f.db.collection("npps").deleteOne({ _id: f.nppId });
    expect(await processQueuedRedemptions(f.db, f.fund, false, 7)).toBe(1);
    expect(
      await f.db.collection("indexFundRedemptionQueue").findOne({ _id: f.entry._id })
    ).toMatchObject({ status: "cancelled", units: 10 });
    const live = await f.db.collection("indexFundRedemptionQueue").findOne({ nppId: liveId });
    expect(live).toMatchObject({ status: "paid", units: 0, paidAmountAnchor: 500 });
    expect(await f.db.collection("npps").findOne({ _id: liveId })).toMatchObject({
      nppInvestmentCashAnchor: 500,
    });
    expect(await f.db.collection("indexFunds").findOne({ _id: f.fundId })).toMatchObject({
      cashAnchor: 9500,
    });
  });
  it("mirrors an anchor-stated cross-currency redemption onto the fund's own key", async () => {
    const f = world("UK");
    expect(await processQueuedRedemptions(f.db, f.fund, false, 7)).toBe(1);
    const row = f.memory.collection("financialTxLog").docs[0] as unknown as DerivableTx;
    expect(row).toMatchObject({
      amount: 1000,
      anchorAmount: 1000,
      currencyCode: "GBP",
      meta: { fundCurrency: "USD" },
    });
    // NPP cash is ₳-denominated, so the fund's debit is exactly the row's anchor.
    expect(fundMirrorAccount(row)).toBe(`fund:${f.fundId}:USD`);
    const entries = deriveLedgerEntries([row]);
    expect(entries).toHaveLength(2);
    expect(entries[1].legs[0]).toMatchObject({
      account: `fund:${f.fundId}:USD`,
      currencyCode: "USD",
      anchorAmount: -1000,
      role: "primary",
    });
    expect(f.memory.collection("ledgerEntries").docs).toHaveLength(2);
  });
});
