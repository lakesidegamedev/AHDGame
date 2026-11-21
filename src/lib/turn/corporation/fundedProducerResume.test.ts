import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { corporationTurnJournalCollection } from "@/lib/db/repositories/corporationTurnJournal";
import { producerEconomyTurnsCollection } from "@/lib/db/repositories/producerEconomyTurns";
import { getDb } from "@/lib/mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { encodeReceipt } from "@/lib/market/producerMarket/receiptStorage";
import { toInternalUnits } from "@/lib/lineOfCredit/locMath";
import { corporationTurnRerunSet } from "@/simulation/engine/corporationResume";
import { validateLockedResume } from "@/simulation/engine/turnResumeBootstrap";
import { processCorporationTurn } from "./index";
import { runFundedProducerTurn } from "./fundedProducerTurn";
import { processSectors } from "./sectorCalculations";
import { runCorporationTurnSideEffects } from "./corporationTurnSideEffects";
import { processVoteReminders } from "./voteReminders";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/db/runRequiredTransaction", () => ({
  runRequiredTransaction: (body: (session: object) => unknown) => body({}),
}));
vi.mock("./fundedProducerTurn", () => ({
  producerStageEnv: () => ({}),
  runFundedProducerTurn: vi.fn(),
}));
vi.mock("./sectorCalculations", () => ({ processSectors: vi.fn() }));
vi.mock("./corporationTurnSideEffects", () => ({ runCorporationTurnSideEffects: vi.fn() }));
vi.mock("./voteReminders", async (original) => ({
  ...(await original<typeof import("./voteReminders")>()),
  processVoteReminders: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/budget/revenue", async (original) => ({
  ...(await original<typeof import("@/lib/budget/revenue")>()),
  refreshNationalBudgetRevenue: vi.fn(),
}));

const turn = 11;
const worldEpoch = "test-funded-resume";
const key = JSON.stringify([worldEpoch, turn]);
const market = {
  _id: key,
  worldEpoch,
  turn,
  status: "settled",
  ...encodeReceipt({ version: 1, worldEpoch, request: { turn } }),
};

function fixture(stage = 1) {
  const memory = createInMemoryDb();
  const db = memory as unknown as Db;
  const characterId = new ObjectId();
  const state = {
    _id: "current",
    currentTurn: turn - 1,
    processingTargetTurn: turn,
    processingPhase: "corporationTurn",
    processingPhaseStatuses: { corporationTurn: { status: "running" as const } },
    worldEpochId: worldEpoch,
    resetWorldId: worldEpoch,
    isActive: true,
    isProcessing: true,
    processingKind: "turn",
    producerOpening: { worldEpoch, turn: turn - 1, digest: "opening" },
  };
  memory.seed("gameState", [state]);
  memory.seed("gameConfig", [
    { _id: "default", producerMarketLiveFromTurn: turn, turnResilienceStage: stage },
  ]);
  memory.seed("characters", [
    {
      _id: characterId,
      name: "Test recipient",
      countryId: "US",
      homeState: "US_CA",
      incomeTaxStartTurn: 1,
      currencyBalances: { personal: { GBP: 0 } },
    },
  ]);
  memory.seed("federalBudget", [
    {
      _id: "federal",
      countryId: "US",
      currencyCode: "USD",
      taxRates: { incomeTax: 20 },
    },
  ]);
  memory.seed("stateBudgets", [{ _id: "US_CA", countryId: "US", taxRates: { incomeTax: 10 } }]);
  memory.seed("macroMetrics", [{ _id: "US_CA", economic: { medianIncome: { value: 100 } } }]);
  const usd = { _id: "USD", currencyCode: "USD", rate: 1 };
  memory.seed("exchangeRates", [usd]);
  vi.mocked(getDb).mockResolvedValue(db);
  vi.mocked(runFundedProducerTurn).mockImplementation(async () => {
    await producerEconomyTurnsCollection<typeof market>(db).insertOne(market);
    return {
      receiptsBySectorId: new Map(),
      settledProfitByCorp: new Map(),
      headcountBySectorId: new Map(),
    };
  });
  vi.mocked(runCorporationTurnSideEffects).mockResolvedValue({ nppNewSectors: [] });
  const restoreRate = () =>
    memory.seed("exchangeRates", [{ _id: "GBP", currencyCode: "GBP", rate: 2 }]);
  return { db, state, memory, characterId, restoreRate };
}

describe("funded corporation payout recovery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses evidence for a different market digest", async () => {
    const { db, state, memory } = fixture();
    memory.seed("producerEconomyTurns", [market]);
    await corporationTurnJournalCollection<{ _id: string } & Record<string, unknown>>(db).insertOne(
      {
        _id: `fundedClosing:${key}`,
        kind: "fundedClosingManifest",
        worldEpoch,
        turn,
        version: 1,
        marketDigest: "0".repeat(64),
        hash: "1".repeat(64),
        chunkCount: 1,
      }
    );
    expect(await corporationTurnRerunSet(db, state)).toEqual(new Set());
    await expect(processCorporationTurn(turn)).rejects.toThrow(/does not match the settled market/);
    expect(runFundedProducerTurn).not.toHaveBeenCalled();
  });

  it.each([0, 1])(
    "resumes the original gross payout after a missing earnings rate at stage %s",
    async (stage) => {
      const { db, state, memory, characterId, restoreRate } = fixture(stage);
      const id = characterId.toHexString();
      const { processSectors: calculateSectors } =
        await vi.importActual<typeof import("./sectorCalculations")>("./sectorCalculations");
      vi.mocked(processSectors).mockImplementationOnce((...args) => ({
        ...calculateSectors(...args),
        totalIncomeGenerated: 100,
        ceoSalaryPayments: new Map([[id, new Map([["GBP", 100]])]]),
      }));
      await expect(processCorporationTurn(turn)).rejects.toThrow(
        "Earnings exchange rate unavailable"
      );
      expect(
        (await db.collection("characters").findOne({ _id: characterId }))?.currencyBalances.personal
          .GBP
      ).toBe(0);
      const rerun = await corporationTurnRerunSet(db, state);
      expect(rerun).toEqual(new Set(["corporationTurn"]));
      const resume = validateLockedResume(state as never, turn, rerun, stage >= 1);
      expect(resume?.appliedPhases.has("corporationTurn")).toBe(false);
      restoreRate();
      vi.mocked(processVoteReminders).mockRejectedValueOnce(new Error("Reminders unavailable"));
      if (stage === 1) {
        const journal = memory.collection("corporationTurnJournal");
        const findOne = journal.findOne.bind(journal);
        const read = vi.spyOn(journal, "findOne").mockImplementation(async (...args) => {
          if (
            args[0]?._id === `${worldEpoch}:${turn}` &&
            memory.collection("playerIncomeTaxBatches").docs.length > 0
          ) {
            read.mockRestore();
            throw new Error("Closing journal read unavailable");
          }
          return findOne(...args);
        });
        await expect(processCorporationTurn(turn)).rejects.toThrow(
          "Closing journal read unavailable"
        );
        expect(memory.collection("playerIncomeTaxBatches").docs).toHaveLength(1);
        await db.collection("exchangeRates").deleteMany({ currencyCode: "GBP" });
      }
      const result = await processCorporationTurn(turn);
      expect(await processCorporationTurn(turn)).toEqual(result);
      expect(processVoteReminders).toHaveBeenCalledTimes(1);
      expect(result.currencyIncomeFaceByCharacterId.get(id)).toEqual(new Map([["GBP", 100]]));
      expect(result.currencyIncomeInternalByCharacterId.get(id)).toBe(toInternalUnits(100, 2));
      expect(
        (await db.collection("characters").findOne({ _id: characterId }))?.currencyBalances.personal
          .GBP
      ).toBe(70);
      expect(memory.collection("playerIncomeTaxBatches").docs).toHaveLength(1);
      expect(runFundedProducerTurn).toHaveBeenCalledTimes(1);
      expect(processSectors).toHaveBeenCalledTimes(1);
      expect(runCorporationTurnSideEffects).toHaveBeenCalledTimes(1);
    }
  );

  it("holds a settled funded market without a closing plan before running effects", async () => {
    const { db, state, memory } = fixture();
    memory.seed("producerEconomyTurns", [market]);
    expect(await corporationTurnRerunSet(db, state)).toEqual(new Set());
    await expect(processCorporationTurn(turn)).rejects.toThrow(/closing plan/);
    expect(runFundedProducerTurn).not.toHaveBeenCalled();
    expect(processSectors).not.toHaveBeenCalled();
  });
});
