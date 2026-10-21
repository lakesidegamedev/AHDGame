/**
 * A fund whose own rebalance turn is blocked by queued redemptions must catch
 * up on a later turn, not wait for the same slot the next day. NPP redemption
 * rows queued on turns divisible by four left funds on slots 1, 5, 9, ...
 * skipped every day, with no warning.
 */
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { getDb } from "@/lib/mongodb";
import type { IndexFund, IndexFundRedemptionQueueEntry } from "@/lib/db/types";
import { runIndexFundCron } from "./fundCron";
import { getAllFundDefinitions } from "./fundDefinitions";
import { getFundById } from "./fundQueries";
import { staggerPhase } from "@/lib/turn/staggerPhase";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/db/transactionSupport", () => ({
  assertTransactionSupportAtBoot: vi.fn(async () => false),
}));

const NOW = new Date("2000-01-01T00:00:00Z");

function world() {
  const memory = createInMemoryDb();
  const db = memory as unknown as Db;
  const corps = Array.from({ length: 6 }, (_, i) => ({
    _id: new ObjectId(),
    name: `Corp ${i}`,
    type: "technology",
    countryId: "US",
    liquidCurrencyCode: "USD",
    shareBuybackMode: "instant",
    sharePrice: 50 + i,
    fundamentalSharePrice: 50 + i,
    totalShares: 1_000_000,
    publicFloat: 200_000,
    liquidCapital: 1_000_000,
    shareholders: [],
    shareIssuanceProceeds: 0,
    createdAt: NOW,
    updatedAt: NOW,
  }));
  const def = getAllFundDefinitions().find(
    (d) => d.kind === "broad" && d.scope === "country" && d.countryId === "US"
  )!;
  const staleRebalance = new Date(Date.now() - 3 * TURNS_PER_DAY * 60 * 60_000);
  const fund = {
    _id: new ObjectId(),
    slug: def.slug,
    name: def.name,
    tickerSymbol: def.ticker,
    scope: def.scope,
    kind: def.kind,
    countryId: "US",
    anchorCurrencyCode: def.anchorCurrencyCode,
    status: "active",
    quotedNav: 100,
    unitSupply: 100_000,
    reserveUnits: 0,
    cashAnchor: 5_000_000,
    holdings: [],
    targetConstituents: [
      { corporationId: corps[0]._id, targetWeight: 1, marketCapAnchor: 50_000_000 },
    ],
    lastRebalancedAt: staleRebalance,
    createdAt: NOW,
    updatedAt: NOW,
  } as unknown as IndexFund;
  const npp = { _id: new ObjectId(), countryId: "US", name: "NPP", nppInvestmentCashAnchor: 0 };
  memory.seed("indexFunds", [{ ...fund }] as never);
  memory.seed("corporations", corps as never);
  memory.seed("npps", [npp]);
  memory.seed("equityMarketPools", [
    {
      _id: "USD",
      cashLocal: 5_000_000,
      targetCashLocal: 5_000_000,
      lifetime: { purchasesIn: 0 },
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  memory.seed("gameConfig", [
    { _id: "default", indexFundsMode: "full", ledgerShadow: true, turnLengthMinutes: 60 },
  ]);
  memory.seed("exchangeRates", [{ currencyCode: "USD", rate: 1 }]);
  memory.seed("gameState", [{ _id: "current", currentTurn: 1 }]);
  vi.mocked(getDb).mockResolvedValue(db);
  return { db, fund, npp, staleRebalance };
}

describe("index fund cron missed rebalance", () => {
  it("defers a blocked stagger-turn rebalance with a warning, catches up next turn, and does not repeat", async () => {
    const w = world();
    const staggerTurn = TURNS_PER_DAY * 10 + staggerPhase(String(w.fund._id), TURNS_PER_DAY);
    const queued: IndexFundRedemptionQueueEntry = {
      _id: new ObjectId(),
      fundId: w.fund._id,
      holderKind: "npp",
      nppId: w.npp._id,
      units: 10,
      requestedNavAnchor: 100,
      requestedAmountAnchor: 1_000,
      paidAmountAnchor: 0,
      status: "queued",
      unitsBurnedAtRequest: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await w.db
      .collection<IndexFundRedemptionQueueEntry>("indexFundRedemptionQueue")
      .insertOne(queued);

    const blocked = await runIndexFundCron(w.db, { currentTurn: staggerTurn });
    expect(blocked.rebalances).toBe(0);
    expect(blocked.redemptionsPaid).toBe(1);
    expect(blocked.errors).toEqual([
      `Fund ${w.fund.slug}: rebalance deferred, queued redemptions pending`,
    ]);
    expect((await getFundById(w.db, w.fund._id))?.lastRebalancedAt).toEqual(w.staleRebalance);

    const caughtUp = await runIndexFundCron(w.db, { currentTurn: staggerTurn + 1 });
    expect(caughtUp.errors).toEqual([]);
    expect(caughtUp.rebalances).toBe(1);
    const rebalancedAt = (await getFundById(w.db, w.fund._id))?.lastRebalancedAt;
    expect(rebalancedAt!.getTime()).toBeGreaterThan(w.staleRebalance.getTime());

    const next = await runIndexFundCron(w.db, { currentTurn: staggerTurn + 2 });
    expect(next.errors).toEqual([]);
    expect(next.rebalances).toBe(0);
    expect((await getFundById(w.db, w.fund._id))?.lastRebalancedAt).toEqual(rebalancedAt);
  }, 120_000);

  it("does not warn about queued redemptions on a turn the fund is not due", async () => {
    const w = world();
    // Fresh rebalance and an off-slot turn: queued rows here are routine.
    await w.db
      .collection("indexFunds")
      .updateOne({ _id: w.fund._id }, { $set: { lastRebalancedAt: new Date() } });
    await w.db.collection<IndexFundRedemptionQueueEntry>("indexFundRedemptionQueue").insertOne({
      _id: new ObjectId(),
      fundId: w.fund._id,
      holderKind: "npp",
      nppId: w.npp._id,
      units: 10,
      requestedNavAnchor: 100,
      requestedAmountAnchor: 1_000,
      paidAmountAnchor: 0,
      status: "queued",
      unitsBurnedAtRequest: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const offTurn = TURNS_PER_DAY * 10 + staggerPhase(String(w.fund._id), TURNS_PER_DAY) + 1;
    const result = await runIndexFundCron(w.db, { currentTurn: offTurn });
    expect(result.errors).toEqual([]);
    expect(result.rebalances).toBe(0);
  }, 120_000);
});
