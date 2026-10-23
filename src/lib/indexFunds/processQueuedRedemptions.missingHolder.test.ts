/**
 * A queued redemption whose holder no longer exists can never be paid (#4848).
 *
 * Party merges hard-delete over-cap NPPs and clean officials, candidacies and
 * campaigns, but not fund redemption queue rows. An orphaned row is retried every
 * pass: the batch branch finds no holder, settleQueuedPayout returns false, and
 * the row is restored to "queued" without a warning. fundCron defers rebalancing
 * while any queued redemption exists, so one orphan froze its fund for good.
 *
 * A row whose units left unitSupply at request time is a cash payable with no
 * holder: the fund keeps the cash, so the row is cancelled instead of retried.
 * A legacy row whose units are still live holdings stays queued with a warning,
 * because cancelling it would delete a claim with no payout.
 */
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { IndexFund, IndexFundRedemptionQueueEntry } from "@/lib/db/types";
import { processQueuedRedemptions } from "./processQueuedRedemptions";
import { listPendingRedemptions } from "./fundQueries";
import { loadQueuedRedemptionUnitsByFundId } from "./fundValuation";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const T0 = new Date("2000-01-01T00:00:00Z");
const QUEUE = "indexFundRedemptionQueue";

function world() {
  const memory = createInMemoryDb();
  const fundId = new ObjectId();
  const fund: IndexFund = {
    _id: fundId,
    slug: "missing-holder-test",
    name: "Missing Holder Fund",
    tickerSymbol: "MHF",
    scope: "country",
    kind: "broad",
    countryId: "US",
    anchorCurrencyCode: "USD",
    status: "active",
    quotedNav: 100,
    unitSupply: 1_000,
    reserveUnits: 0,
    cashAnchor: 10_000,
    targetConstituents: [],
    holdings: [],
    createdAt: T0,
    updatedAt: T0,
  };
  // The holder that still exists. Orphan holders are ids with no npps document.
  const liveHolder = {
    _id: new ObjectId(),
    countryId: "US",
    name: "Live NPP",
    nppInvestmentCashAnchor: 0,
  };
  memory.seed("indexFunds", [{ ...fund }]);
  memory.seed("npps", [liveHolder]);
  memory.seed("gameConfig", [{ _id: "default", ledgerShadow: true }]);
  return {
    memory,
    db: memory as unknown as Db,
    fund,
    fundId,
    liveHolder,
    seedQueue: (rows: IndexFundRedemptionQueueEntry[]) =>
      memory.seed(
        QUEUE,
        rows.map((row) => ({ ...row }))
      ),
  };
}

function entry(
  fundId: ObjectId,
  nppId: ObjectId,
  overrides: Partial<IndexFundRedemptionQueueEntry> = {}
): IndexFundRedemptionQueueEntry {
  return {
    _id: new ObjectId(),
    fundId,
    holderKind: "npp",
    nppId,
    units: 6,
    requestedNavAnchor: 100,
    requestedAmountAnchor: 600,
    paidAmountAnchor: 0,
    unitsBurnedAtRequest: true,
    status: "queued",
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

async function queueRow(db: Db, id: ObjectId): Promise<IndexFundRedemptionQueueEntry> {
  const row = await db.collection<IndexFundRedemptionQueueEntry>(QUEUE).findOne({ _id: id });
  if (!row) throw new Error(`queue row ${id} not found`);
  return row;
}

describe("queued redemption with a missing holder", () => {
  it("cancels an orphaned row whose units left the fund at request, leaving cash and unit supply alone", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = world();
    const orphan = entry(w.fundId, new ObjectId());
    w.seedQueue([orphan]);

    const paid = await processQueuedRedemptions(w.db, w.fund, false, 9, true);

    expect(paid).toBe(0);
    const row = await queueRow(w.db, orphan._id);
    expect(row.status).toBe("cancelled");
    expect(row).not.toHaveProperty("settlementClaimId");
    expect(row).not.toHaveProperty("processingStartedAt");
    expect(row).not.toHaveProperty("processingTurn");
    // Nothing was paid, so nothing may leave the fund, and the burned units must
    // not be burned a second time.
    const fundAfter = await w.db.collection<IndexFund>("indexFunds").findOne({ _id: w.fundId });
    expect(fundAfter!.cashAnchor).toBe(w.fund.cashAnchor);
    expect(fundAfter!.unitSupply).toBe(w.fund.unitSupply);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("cancelled queued redemption"));
    warn.mockRestore();
  });

  it("cancels the orphan and still pays the live holder in the same pass", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = world();
    const orphan = entry(w.fundId, new ObjectId());
    const payable = entry(w.fundId, w.liveHolder._id, {
      _id: new ObjectId(),
      units: 5,
      requestedAmountAnchor: 500,
      createdAt: new Date(T0.getTime() + 1),
      updatedAt: new Date(T0.getTime() + 1),
    });
    w.seedQueue([orphan, payable]);

    const paid = await processQueuedRedemptions(w.db, w.fund, false, 9, true);

    expect(paid).toBe(1);
    expect((await queueRow(w.db, orphan._id)).status).toBe("cancelled");
    const paidRow = await queueRow(w.db, payable._id);
    expect(paidRow.status).toBe("paid");
    expect(paidRow.paidAmountAnchor).toBeGreaterThan(0);
    const fundAfter = await w.db.collection<IndexFund>("indexFunds").findOne({ _id: w.fundId });
    const holderAfter = await w.db.collection("npps").findOne({ _id: w.liveHolder._id });
    expect(fundAfter!.cashAnchor + Number(holderAfter!.nppInvestmentCashAnchor)).toBeCloseTo(
      w.fund.cashAnchor,
      6
    );
    warn.mockRestore();
  });

  it("leaves a legacy row with live units queued and warns, so no claim is deleted", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = world();
    const legacy = entry(w.fundId, new ObjectId(), { unitsBurnedAtRequest: undefined, units: 5 });
    w.seedQueue([legacy]);

    const paid = await processQueuedRedemptions(w.db, w.fund, false, 9, true);

    expect(paid).toBe(0);
    const row = await queueRow(w.db, legacy._id);
    expect(row.status).toBe("queued");
    expect(row.units).toBe(5);
    expect(row).not.toHaveProperty("settlementClaimId");
    const fundAfter = await w.db.collection<IndexFund>("indexFunds").findOne({ _id: w.fundId });
    expect(fundAfter!.cashAnchor).toBe(w.fund.cashAnchor);
    expect(fundAfter!.unitSupply).toBe(w.fund.unitSupply);
    expect(await listPendingRedemptions(w.db, w.fundId)).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("stays queued"));
    warn.mockRestore();
  });

  it("clears the fund's queued-redemption gate once the orphan is cancelled", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = world();
    const orphan = entry(w.fundId, new ObjectId());
    w.seedQueue([orphan]);
    expect(
      (await loadQueuedRedemptionUnitsByFundId(w.db, [w.fundId])).get(w.fundId.toString())
    ).toBe(6);

    await processQueuedRedemptions(w.db, w.fund, false, 9, true);

    // fundCron defers a fund while this map has an entry for it; after the
    // cancel the map is empty and the rebalance can run.
    expect(
      (await loadQueuedRedemptionUnitsByFundId(w.db, [w.fundId])).get(w.fundId.toString())
    ).toBeUndefined();
    expect(await listPendingRedemptions(w.db, w.fundId)).toHaveLength(0);
    warn.mockRestore();
  });
});
