/**
 * A redemption pass settles a bounded number of queue claims (#3366).
 *
 * Every settlement is a durable money move of ~30 round trips. The pro-rata gate
 * hands every waiting entry a slice each pass, so an uncapped pass re-settled
 * the whole queue every turn; thousands of queued NPP redemptions alone ran the
 * index-fund phase past its 240s timeout. The pass must stop claiming at its
 * budget, leave the rest untouched for a later turn, and rotate so the entries
 * it skipped go first next time.
 */
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { countRoundTrips } from "@/lib/test-utils/roundTripCounter";
import type { IndexFund, IndexFundRedemptionQueueEntry } from "@/lib/db/types";
import { processQueuedRedemptions, QUEUED_REDEMPTION_CLAIMS_PER_PASS } from "./fundCron";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const ENTRIES = 600;
/** A pass budget below the queue, so the untouched remainder is observable. */
const BUDGET = 250;
const T0 = new Date("2000-01-01T00:00:00Z");

function world(missingNppIndexes: ReadonlySet<number> = new Set()) {
  const memory = createInMemoryDb();
  const fundId = new ObjectId();
  const fund: IndexFund = {
    _id: fundId,
    slug: "queue-budget-test",
    name: "Queue Budget Fund",
    tickerSymbol: "QBF",
    scope: "country",
    kind: "broad",
    countryId: "US",
    anchorCurrencyCode: "USD",
    status: "active",
    quotedNav: 100,
    unitSupply: 1_000_000,
    reserveUnits: 0,
    // Enough for every entry to receive a whole-unit pro-rata slice, not
    // enough to pay the queue: the shape that re-settled every entry per turn.
    cashAnchor: ENTRIES * 300,
    targetConstituents: [],
    holdings: [],
    createdAt: T0,
    updatedAt: T0,
  };
  const npps = Array.from({ length: ENTRIES }, (_, i) => ({
    _id: new ObjectId(),
    countryId: "US",
    name: `NPP ${i}`,
    nppInvestmentCashAnchor: 0,
  }));
  const entries: IndexFundRedemptionQueueEntry[] = npps.map((npp, i) => ({
    _id: new ObjectId(),
    fundId,
    holderKind: "npp",
    nppId: npp._id,
    units: 10,
    requestedNavAnchor: 100,
    requestedAmountAnchor: 1_000,
    paidAmountAnchor: 0,
    status: "queued",
    unitsBurnedAtRequest: true,
    createdAt: new Date(T0.getTime() + i),
    updatedAt: new Date(T0.getTime() + i),
  }));
  memory.seed("indexFunds", [{ ...fund }]);
  memory.seed(
    "indexFundRedemptionQueue",
    entries.map((e) => ({ ...e }))
  );
  // A holder the world no longer has: a merged or dissolved NPP leaves its queue
  // rows behind, and no credit can ever land on it.
  memory.seed(
    "npps",
    npps.filter((_, index) => !missingNppIndexes.has(index))
  );
  const missingNppIds = new Set(
    npps.filter((_, index) => missingNppIndexes.has(index)).map((npp) => String(npp._id))
  );
  memory.seed("gameConfig", [{ _id: "default", ledgerShadow: true }]);
  return { memory, db: memory as unknown as Db, fund, fundId, entries, missingNppIds };
}

async function nppCashTotal(db: Db): Promise<number> {
  const rows = await db.collection("npps").find({}).toArray();
  return rows.reduce((s, r) => s + Number(r.nppInvestmentCashAnchor ?? 0), 0);
}

describe("queued redemption pass budget", () => {
  it("bounds round trips per pass and conserves cash between fund and holders", async () => {
    const w = world();
    const trips = countRoundTrips(w.memory);
    const paid = await processQueuedRedemptions(w.db, w.fund, false, 9, true, {
      claimsLeft: BUDGET,
    });
    expect(paid).toBe(BUDGET);
    // NPP payouts settle in batches: about one claim write per entry plus a
    // fixed cost per batch, against ~30 round trips each when paid singly.
    console.log("BUDGET_TRIPS", trips.total(), trips.summary());
    expect(trips.total(), trips.summary()).toBeLessThan(BUDGET * 3);

    const fundAfter = await w.db.collection<IndexFund>("indexFunds").findOne({ _id: w.fundId });
    const credited = await nppCashTotal(w.db);
    expect(credited).toBeGreaterThan(0);
    expect(fundAfter!.cashAnchor + credited).toBeCloseTo(w.fund.cashAnchor, 6);

    const queue = await w.db
      .collection<IndexFundRedemptionQueueEntry>("indexFundRedemptionQueue")
      .find({})
      .toArray();
    // Unclaimed entries are untouched: no fence, no partial payout, no stale claim.
    expect(queue.filter((e) => e.status === "processing")).toHaveLength(0);
    const untouched = queue.filter((e) => e.paidAmountAnchor === 0);
    expect(untouched).toHaveLength(ENTRIES - BUDGET);
    for (const e of untouched) {
      expect(e).toMatchObject({ status: "queued", units: 10 });
      expect(e).not.toHaveProperty("settlementClaimId");
    }
    // Paid out plus still owed equals the cash that left the fund.
    const paidOut = queue.reduce((s, e) => s + e.paidAmountAnchor, 0);
    expect(paidOut).toBeCloseTo(credited, 6);
  });

  it("serves the entries a pass skipped before re-serving the ones it paid", async () => {
    const w = world();
    await processQueuedRedemptions(w.db, w.fund, false, 9, true, { claimsLeft: BUDGET });
    const fund1 = (await w.db.collection<IndexFund>("indexFunds").findOne({ _id: w.fundId }))!;
    await processQueuedRedemptions(w.db, fund1, false, 10, true, { claimsLeft: BUDGET });
    const queue = await w.db
      .collection<IndexFundRedemptionQueueEntry>("indexFundRedemptionQueue")
      .find({})
      .toArray();
    const served = queue.filter((e) => e.paidAmountAnchor > 0).length;
    expect(served).toBe(Math.min(ENTRIES, BUDGET * 2));
  });

  it("pays the whole queue in one default pass now that NPP payouts batch", async () => {
    const w = world();
    expect(QUEUED_REDEMPTION_CLAIMS_PER_PASS).toBeGreaterThanOrEqual(ENTRIES);
    const trips = countRoundTrips(w.memory);
    const paid = await processQueuedRedemptions(w.db, w.fund, false, 9, true);
    expect(paid).toBe(ENTRIES);
    expect(trips.total(), trips.summary()).toBeLessThan(ENTRIES * 3);
    const credited = await nppCashTotal(w.db);
    const fundAfter = await w.db.collection<IndexFund>("indexFunds").findOne({ _id: w.fundId });
    expect(fundAfter!.cashAnchor + credited).toBeCloseTo(w.fund.cashAnchor, 6);
  });

  it("shares one claim budget across funds in a pass", async () => {
    const w = world();
    const budget = { claimsLeft: 50 };
    const paid = await processQueuedRedemptions(w.db, w.fund, false, 9, true, budget);
    expect(paid).toBe(50);
    expect(budget.claimsLeft).toBe(0);
    const again = await processQueuedRedemptions(w.db, w.fund, false, 9, true, budget);
    expect(again).toBe(0);
  });

  it("leaves a payout whose holder is gone alone instead of fencing it every turn", async () => {
    // Every sixth NPP has been merged away. Its queue row can never be paid (the
    // credit leg is guarded on that id), and before this it was fenced, broken
    // out of the payout batch and restored on every single pass.
    const missing = new Set(
      Array.from({ length: ENTRIES }, (_, i) => i).filter((i) => i % 6 === 0)
    );
    const w = world(missing);
    const trips = countRoundTrips(w.memory);

    const paid = await processQueuedRedemptions(w.db, w.fund, false, 9, true, {
      claimsLeft: BUDGET,
    });

    // The budget went to claims that can actually pay.
    expect(paid).toBe(BUDGET);
    // One fence per paid entry and none for the vanished holders.
    expect(trips.count("indexFundRedemptionQueue", "findOneAndUpdate")).toBe(paid);
    expect(trips.count("indexFundRedemptionQueue", "updateOne")).toBe(0);

    const queue = await w.db
      .collection<IndexFundRedemptionQueueEntry>("indexFundRedemptionQueue")
      .find({})
      .toArray();
    const owedToNobody = queue.filter(
      (e) => w.missingNppIds.has(String(e.nppId)) && e.paidAmountAnchor === 0
    );
    expect(owedToNobody).toHaveLength(missing.size);
    for (const entry of owedToNobody) {
      // Never claimed, never restored: the obligation is exactly as it was.
      expect(entry).toMatchObject({ status: "queued", units: 10 });
      expect(entry).not.toHaveProperty("settlementClaimId");
      expect(entry).not.toHaveProperty("processingStartedAt");
      expect(entry.updatedAt).toEqual(entry.createdAt);
    }

    // Cash left the fund only for the holders it paid.
    const credited = await nppCashTotal(w.db);
    const fundAfter = await w.db.collection<IndexFund>("indexFunds").findOne({ _id: w.fundId });
    expect(credited).toBeGreaterThan(0);
    expect(fundAfter!.cashAnchor + credited).toBeCloseTo(w.fund.cashAnchor, 6);
  });

  it("keeps the surviving holders' payouts batched when vanished holders lead the queue", async () => {
    // The first entries are the ones that cannot pay: they used to flush the NPP
    // batch before every settlement attempt, so 250 payable claims cost 250
    // receipts instead of one.
    const missing = new Set(Array.from({ length: 50 }, (_, i) => i));
    const w = world(missing);
    const trips = countRoundTrips(w.memory);

    const paid = await processQueuedRedemptions(w.db, w.fund, false, 9, true, {
      claimsLeft: BUDGET,
    });

    expect(paid).toBe(BUDGET);
    const batches = w.memory
      .collection("bankMoneyMoves")
      .docs.filter((row) => String(row._id).startsWith("fund-redemption-batch:"));
    expect(batches).toHaveLength(1);
    expect(trips.total(), trips.summary()).toBeLessThan(BUDGET * 3);
  });
});
