/**
 * A redemption pass loads its queue, holders, rates and audit context once for
 * every fund it serves (#4571).
 *
 * Each of those used to be read inside the per-fund call, so a pass over N
 * waiting funds paid N times for data that cannot change between them. This
 * pins the pass-level read and checks the per-fund calls add no reads of their
 * own.
 */
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { countRoundTrips } from "@/lib/test-utils/roundTripCounter";
import type { IndexFund, IndexFundRedemptionQueueEntry } from "@/lib/db/types";
import { prepareQueuedRedemptionPass, processQueuedRedemptions } from "./processQueuedRedemptions";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const T0 = new Date("2000-01-01T00:00:00Z");
const TURN = 12;

function fund(index: number): IndexFund {
  return {
    _id: new ObjectId(),
    slug: `pass-context-${index}`,
    name: `Pass Context Fund ${index}`,
    tickerSymbol: `PC${index}`,
    scope: "country",
    kind: "broad",
    countryId: "US",
    anchorCurrencyCode: "USD",
    status: "active",
    quotedNav: 100,
    unitSupply: 1_000_000,
    reserveUnits: 0,
    cashAnchor: 1_000_000,
    targetConstituents: [],
    holdings: [],
    createdAt: T0,
    updatedAt: T0,
  } as IndexFund;
}

function world() {
  const memory = createInMemoryDb();
  const db = memory as unknown as Db;
  const funds = [fund(1), fund(2), fund(3)];
  const nppId = new ObjectId();
  const characterId = new ObjectId();
  const imperialCharacterId = new ObjectId();
  const queue: IndexFundRedemptionQueueEntry[] = [
    {
      _id: new ObjectId(),
      fundId: funds[0]._id,
      holderKind: "npp",
      nppId,
      units: 10,
      requestedNavAnchor: 100,
      requestedAmountAnchor: 1_000,
      paidAmountAnchor: 0,
      status: "queued",
      unitsBurnedAtRequest: true,
      createdAt: T0,
      updatedAt: T0,
    },
    {
      _id: new ObjectId(),
      fundId: funds[1]._id,
      holderKind: "character",
      characterId,
      units: 10,
      requestedNavAnchor: 100,
      requestedAmountAnchor: 1_000,
      paidAmountAnchor: 0,
      status: "queued",
      unitsBurnedAtRequest: true,
      createdAt: new Date(T0.getTime() + 1),
      updatedAt: new Date(T0.getTime() + 1),
    },
    {
      _id: new ObjectId(),
      fundId: funds[2]._id,
      holderKind: "imperial_character",
      imperialCharacterId,
      units: 10,
      requestedNavAnchor: 100,
      requestedAmountAnchor: 1_000,
      paidAmountAnchor: 0,
      status: "queued",
      unitsBurnedAtRequest: true,
      createdAt: new Date(T0.getTime() + 2),
      updatedAt: new Date(T0.getTime() + 2),
    },
  ];
  memory.seed(
    "indexFunds",
    funds.map((row) => ({ ...row }))
  );
  memory.seed(
    "indexFundRedemptionQueue",
    queue.map((row) => ({ ...row }))
  );
  memory.seed("npps", [{ _id: nppId, countryId: "US", name: "NPP", nppInvestmentCashAnchor: 0 }]);
  memory.seed("characters", [
    { _id: characterId, name: "Holder", currencyBalances: { personal: { USD: 0 } } },
  ]);
  memory.seed("imperialCharacters", [
    { _id: imperialCharacterId, name: "Imperial", currencyBalances: { personal: { USD: 0 } } },
  ]);
  memory.seed("gameConfig", [{ _id: "default", ledgerShadow: true }]);
  memory.seed("gameState", [{ _id: "current", currentTurn: TURN - 1 }]);
  memory.seed("exchangeRates", [{ currencyCode: "USD", rate: 1 }]);
  return { memory, db, funds, queue };
}

describe("queued redemption pass context", () => {
  it("reads the queue, holders and audit context once for every fund it serves", async () => {
    const w = world();
    const trips = countRoundTrips(w.memory);
    const context = await prepareQueuedRedemptionPass(w.db, w.funds, true);
    for (const current of w.funds)
      await processQueuedRedemptions(w.db, current, true, TURN, true, { claimsLeft: 10 }, context);

    // One queue read for the whole pass, not one per fund.
    expect(trips.count("indexFundRedemptionQueue", "find")).toBe(1);
    // One projected read per holder collection.
    expect(trips.count("npps", "find")).toBe(1);
    expect(trips.count("characters", "find")).toBe(1);
    expect(trips.count("imperialCharacters", "find")).toBe(1);
    // One audit context (thresholds) and one rate read for the pass.
    expect(trips.count("systemSettings", "findOne")).toBe(1);
    expect(trips.count("exchangeRates", "find")).toBe(1);
  });

  it("defers a fund whose rate is missing, exactly as the per-fund gate did", async () => {
    const w = world();
    await w.db.collection("exchangeRates").deleteMany({});
    const context = await prepareQueuedRedemptionPass(w.db, w.funds, true);
    for (const current of w.funds)
      expect(
        await processQueuedRedemptions(w.db, current, true, TURN, true, { claimsLeft: 10 }, context)
      ).toBe(0);
    const queue = await w.db.collection("indexFundRedemptionQueue").find({}).toArray();
    expect(queue.every((row) => row.status === "queued" && !row.settlementClaimId)).toBe(true);
  });

  it("still pays a single fund that loads its own context", async () => {
    const w = world();
    expect(await processQueuedRedemptions(w.db, w.funds[0], true, TURN)).toBe(1);
    const queue = await w.db.collection("indexFundRedemptionQueue").find({}).toArray();
    expect(queue.map((row) => row.status).sort()).toEqual(["paid", "queued", "queued"]);
  });
});
