import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import {
  placePendingShareIssuances,
  planEquityPrimaryPlacement,
  prepareEquityPrimaryPlacement,
  recordCappedPrimaryPlacement,
} from "./primaryMarket";
import { primaryPlacementNotice } from "./cashoutLimits";

vi.mock("@/lib/gameState", () => ({
  getGameState: vi.fn().mockResolvedValue({ currentYear: 2000, currentTurn: 100 }),
}));

vi.mock("@/lib/currency/gdpAnchorRate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/currency/gdpAnchorRate")>()),
  loadWorldEraUnitScale: vi.fn().mockResolvedValue(1),
}));

const TURN = 100;

interface CorpOverrides {
  liquidCapital?: number;
  fundamentalSharePrice?: number;
  earningsHistory?: number[];
  primaryPoolPlacements?: { turn: number; paidLocal: number }[];
}

/** 10,000 shares, 1,000,000 cash and nothing else: book is 100 per share. */
function makeCorp(overrides: CorpOverrides = {}) {
  return {
    _id: new ObjectId(),
    name: "Paper Corp",
    countryId: "US",
    liquidCurrencyCode: "USD",
    liquidCapital: 1_000_000,
    sharePrice: 200,
    fundamentalSharePrice: 200,
    earningsHistory: [0, 0, 0],
    totalShares: 10_000,
    ...overrides,
  };
}

function makeDb(corp: ReturnType<typeof makeCorp>, stage: number | null): MockDb {
  const db = createMockDb();
  db.collection("gameConfig").findOne.mockResolvedValue(
    stage === null ? null : { equityCashoutLimitsStage: stage }
  );
  db.collection("corporations").find().toArray.mockResolvedValue([corp]);
  db.collection("exchangeRates")
    .find()
    .toArray.mockResolvedValue([{ currencyCode: "USD", rate: 1 }]);
  db.collection("exchangeRates").findOne.mockResolvedValue({ currencyCode: "USD", rate: 1 });
  db.collection("equityMarketPools").findOne.mockResolvedValue({
    _id: "USD",
    cashLocal: 1e12,
    targetCashLocal: 1e12,
    m2Local: 1e13,
    poolAccountingVersion: 2,
  });
  db.collection("equityMarketPools").findOneAndUpdate.mockResolvedValue({ cashLocal: 1e12 });
  return db;
}

describe("primary placement with equity cashout limits on", () => {
  it("places an inflated price with flat earnings at the cap, not the quote", async () => {
    const corp = makeCorp();
    const db = makeDb(corp, 1);
    const placement = await prepareEquityPrimaryPlacement(
      db as unknown as Db,
      corp as never,
      1_000,
      200,
      new Date(),
      { turn: TURN }
    );
    expect(placement.placedShares).toBe(1_000);
    expect(placement.paidLocal).toBe(100_000);
    expect(placement.cashoutLimits).toMatchObject({ price: 100, priceCapped: true });
    expect(
      primaryPlacementNotice(placement.cashoutLimits, placement.placedShares, 1_000)
    ).toContain("paid 100 per share, not the 200 quote");
  });

  it("leaves an honest price unaffected", async () => {
    const corp = makeCorp({ fundamentalSharePrice: 50 });
    const db = makeDb(corp, 1);
    const placement = await planEquityPrimaryPlacement(
      db as unknown as Db,
      corp as never,
      1_000,
      50,
      {
        turn: TURN,
      }
    );
    expect(placement.plannedGrossLocal).toBe(50_000);
    expect(placement.cashoutLimits).toMatchObject({ price: 50, priceCapped: false });
    expect(primaryPlacementNotice(placement.cashoutLimits, 1_000, 1_000)).toBeUndefined();
  });

  it("lets trailing earnings back a price above book", async () => {
    // 1.2M a year over 10,000 shares is 120 a share; 15x is 1,800, so the fundamental binds.
    const corp = makeCorp({ earningsHistory: [1_200_000, 1_200_000, 1_200_000] });
    const db = makeDb(corp, 1);
    const placement = await planEquityPrimaryPlacement(
      db as unknown as Db,
      corp as never,
      100,
      200,
      {
        turn: TURN,
      }
    );
    expect(placement.cashoutLimits).toMatchObject({ price: 200, priceCapped: false });
  });

  it("binds the 48-turn cumulative cap", async () => {
    // 400k placed 10 turns ago on 1M of book: 600k starting equity, 200k left.
    // The 500k entry from 60 turns ago has left the window.
    const corp = makeCorp({
      fundamentalSharePrice: 50,
      primaryPoolPlacements: [
        { turn: TURN - 60, paidLocal: 500_000 },
        { turn: TURN - 10, paidLocal: 400_000 },
      ],
    });
    const db = makeDb(corp, 1);
    const placement = await planEquityPrimaryPlacement(
      db as unknown as Db,
      corp as never,
      10_000,
      50,
      { turn: TURN }
    );
    expect(placement.placedShares).toBe(4_000);
    expect(placement.unsoldShares).toBe(6_000);
    expect(primaryPlacementNotice(placement.cashoutLimits, 4_000, 10_000)).toContain(
      "every 48 turns"
    );
  });

  it("records what the pool paid, pruning entries outside the window", async () => {
    const corp = makeCorp();
    const db = makeDb(corp, 1);
    await recordCappedPrimaryPlacement(db as unknown as Db, corp._id as never, {
      paidLocal: 1234.5,
      cashoutLimits: {
        turn: TURN,
        askingPrice: 1,
        capPrice: 1,
        price: 1,
        priceCapped: false,
        windowBudget: 1,
        maxShares: 1,
      },
    });
    const pipeline = db.collectionMocks.corporations.updateOne.mock.calls[0][1] as Array<{
      $set: { primaryPoolPlacements: { $concatArrays: unknown[] } };
    }>;
    const [kept, added] = pipeline[0].$set.primaryPoolPlacements.$concatArrays as [
      { $filter: { cond: { $gt: [string, number] } } },
      unknown[],
    ];
    expect(kept.$filter.cond.$gt[1]).toBe(TURN - 48);
    expect(added).toEqual([{ turn: TURN, paidLocal: 1234.5 }]);
  });

  it.each([
    ["places a pending remainder at the cap while the window has room", [], true],
    [
      "does not pace a pending remainder past the window cap",
      [{ turn: TURN - 1, paidLocal: 500_000 }],
      false,
    ],
  ])("%s", async (_name, placements, expectPlaced) => {
    const corp = {
      ...makeCorp({ primaryPoolPlacements: placements }),
      pendingShareIssuance: {
        remainingShares: 1_000,
        requestedShares: 1_000,
        source: "direct",
        createdAtTurn: TURN - 1,
        initialPriceLocal: 200,
      },
    };
    const db = makeDb(corp, 1);
    db.collectionMocks.corporations.find.mockImplementation((filter: Record<string, unknown>) =>
      "pendingShareIssuance.remainingShares" in filter
        ? { sort: () => ({ toArray: async () => [corp] }) }
        : { toArray: async () => [corp] }
    );
    const result = await placePendingShareIssuances(db as unknown as Db, TURN, new Date());
    if (!expectPlaced) {
      expect(result.sharesPlaced).toBe(0);
      expect(db.collectionMocks.corporations.updateOne).not.toHaveBeenCalled();
      return;
    }
    expect(result.sharesPlaced).toBeGreaterThan(0);
    // Placed at the 100 book cap, not the quote, and recorded against the window.
    expect(result.paidLocal).toBe(result.sharesPlaced * 100);
    expect(db.collectionMocks.corporations.updateOne).toHaveBeenCalledTimes(2);
  });
});

describe("primary placement with equity cashout limits off", () => {
  it.each([null, 0])("prices at the asking price exactly as before (stage %s)", async (stage) => {
    const corp = makeCorp({ primaryPoolPlacements: [{ turn: TURN - 1, paidLocal: 5_000_000 }] });
    const db = makeDb(corp, stage);
    const placement = await prepareEquityPrimaryPlacement(
      db as unknown as Db,
      corp as never,
      1_000,
      200,
      new Date(),
      { turn: TURN }
    );
    expect(placement).toEqual({
      poolActive: true,
      currency: "USD",
      requestedShares: 1_000,
      placedShares: 1_000,
      unsoldShares: 0,
      paidLocal: 200_000,
    });
    expect(db.collectionMocks.corporations.find).not.toHaveBeenCalledWith(
      expect.objectContaining({ _id: expect.anything() }),
      expect.anything()
    );
  });
});
