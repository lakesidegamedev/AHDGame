import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId, type Db } from "mongodb";

// Regression fixture for an NPP-run country in a debt spiral (shaped like the
// Italy case in #5703: debt/GDP 4.89, CCC, primary auctions filling under 5%).
// Unlike crisisDetection.integration.test.ts, country access is NOT mocked:
// the real resolver reads `gameState.nppAutonomyLevel` and `countryGameStates`,
// which is where the detection gate went dead for worlds at autonomy v5 and v6.

vi.mock("../snapshotLoader", () => ({
  loadCountrySovereignSnapshot: vi.fn(),
}));
vi.mock("../requiredIssuance", () => ({
  computeRequiredIssuance: vi.fn().mockResolvedValue(750_000_000_000),
}));
vi.mock("../crisisNews", () => ({
  emitAuctionUndersubscribedNews: vi.fn().mockResolvedValue(undefined),
  emitAuctionFailedNews: vi.fn().mockResolvedValue(undefined),
  emitCrisisFiredNews: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../npc/npcExecutiveAutoPropose", () => ({
  npcExecutiveAutoPropose: vi.fn().mockResolvedValue({ ok: true, choice: "austerity" }),
}));
vi.mock("../political/applyPopulistSurge", () => ({
  applyPopulistSurgeOnCrisis: vi.fn().mockResolvedValue({ npcsAffected: 0 }),
}));

import { evaluateSovereignAuctionForCountry } from "../crisisDetection";
import { loadCountrySovereignSnapshot } from "../snapshotLoader";
import { npcExecutiveAutoPropose } from "../npc/npcExecutiveAutoPropose";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";

interface BudgetRow {
  _id: string;
  countryId: string;
  debtToGdpRatio: number;
  creditRating: string;
  sovereignCrisisState: string;
  failedAuctionConsecutiveCount: number;
  lastAuctionDemandRatio?: number;
  lastPrimaryFillRatio?: number;
}

function makeWorld(nppAutonomyLevel: string, budget: BudgetRow) {
  let row = { ...budget };
  const decisions: Array<Record<string, unknown>> = [];
  const db = {
    collection: vi.fn((name: string) => {
      switch (name) {
        case "federalBudget":
          return {
            findOne: vi.fn(async () => row),
            updateOne: vi.fn(async (_filter: unknown, update: { $set: object }) => {
              row = { ...row, ...update.$set };
              return { acknowledged: true, modifiedCount: 1, matchedCount: 1 };
            }),
          };
        case "sovereignCrisisDecisions":
          return {
            insertOne: vi.fn(async (doc: Record<string, unknown>) => {
              decisions.push(doc);
              return { acknowledged: true, insertedId: new ObjectId() };
            }),
          };
        case "gameState":
          return { findOne: vi.fn(async () => ({ _id: "current", nppAutonomyLevel })) };
        case "countryGameStates":
          // Not open to players: the country is run by the NPP governing brain.
          return {
            findOne: vi.fn(async () => ({
              _id: budget.countryId,
              status: "coming-soon",
              enabledForPlayers: false,
            })),
          };
        default:
          throw new Error(`unexpected collection: ${name}`);
      }
    }),
  } as unknown as Db;
  return { db, getRow: () => row, getDecisions: () => decisions };
}

const IT_BUDGET: BudgetRow = {
  _id: getNationalBudgetId("IT"),
  countryId: "IT",
  debtToGdpRatio: 4.89,
  creditRating: "CCC",
  sovereignCrisisState: "normal",
  failedAuctionConsecutiveCount: 0,
  lastPrimaryFillRatio: 0.0457,
};

const IT_SNAPSHOT = {
  countryCode: "IT",
  currentTurn: 0,
  debtToGdp: 4.89,
  inflationRate: 0.12,
  trust: 0.2,
  sovereignCouponRate: 9.0,
  fxDepreciationRate10t: 0.1,
  turnsSinceLastDefault: null,
  entityHoldings: 0,
  requiredIssuance: 750_000_000_000,
};

beforeEach(() => {
  vi.mocked(loadCountrySovereignSnapshot).mockReset();
  vi.mocked(loadCountrySovereignSnapshot).mockResolvedValue({ ...IT_SNAPSHOT });
  vi.clearAllMocks();
});

describe("crisisDetection: NPP-run country in a debt spiral", () => {
  it.each(["v1", "v4", "v5", "v6"])(
    "counts three failed fiscal-year auctions into crisisPending at autonomy %s",
    async (level) => {
      const { db, getRow, getDecisions } = makeWorld(level, IT_BUDGET);
      const realtime = 1_800_000_000_000;

      const results = [];
      for (const turn of [687, 735, 783]) {
        results.push(await evaluateSovereignAuctionForCountry(db, "IT", turn, realtime + turn));
      }

      expect(results.map((r) => r?.outcome)).toEqual(["failed", "failed", "failed"]);
      expect(results.map((r) => r?.newConsecutiveFailedCount)).toEqual([1, 2, 3]);
      expect(results.map((r) => r?.nextState)).toEqual(["warning", "warning", "crisisPending"]);
      expect(getRow().sovereignCrisisState).toBe("crisisPending");
      expect(getRow().failedAuctionConsecutiveCount).toBe(3);

      // The crisis decision is opened and handed to the NPP executive.
      expect(getDecisions()).toHaveLength(1);
      expect(getDecisions()[0]).toMatchObject({
        countryCode: "IT",
        state: "open",
        firedAtTurn: 783,
      });
      expect(npcExecutiveAutoPropose).toHaveBeenCalledTimes(1);
      expect(npcExecutiveAutoPropose).toHaveBeenCalledWith(
        db,
        expect.objectContaining({ countryCode: "IT", currentTurn: 783 })
      );
    }
  );

  it("still leaves a country frozen when autonomy is off", async () => {
    // The preview guard is unchanged: no governing brain, no crisis.
    const { db, getRow, getDecisions } = makeWorld("off", IT_BUDGET);
    for (const turn of [687, 735, 783]) {
      await evaluateSovereignAuctionForCountry(db, "IT", turn, 1_800_000_000_000 + turn);
    }
    expect(getRow().sovereignCrisisState).toBe("normal");
    expect(getRow().failedAuctionConsecutiveCount).toBe(0);
    expect(getDecisions()).toHaveLength(0);
    expect(npcExecutiveAutoPropose).not.toHaveBeenCalled();
  });
});
