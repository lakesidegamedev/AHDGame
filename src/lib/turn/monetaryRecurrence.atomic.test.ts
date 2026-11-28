import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
vi.mock("@/lib/sovereignDefault/crisisNews", () => ({
  emitRecoveryCompleteNews: vi.fn(async () => {}),
}));
vi.mock("@/lib/notifications", () => ({ createNotifications: vi.fn(async () => {}) }));
vi.mock("@/lib/news", () => ({ createSystemNewsPost: vi.fn(async () => {}) }));
import { processFomcMeetings } from "./fomcMeetingTurn";
import { processCentralBankChairTurn } from "./centralBankChairTurn";
import { processSovereignRecoveryTurn } from "@/lib/sovereignDefault/recovery/recoveryTurn";
import { runInflationRecalc } from "./inflationRecalc";
function fixture() {
  const f = createTransactionalMemoryDb(),
    chair = new ObjectId();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 100,
      worldEpochId: "synthetic-monetary",
      preset: "2027-default",
      currentYear: 2027,
      startingYear: 2027,
    },
  ]);
  f.memory.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 1, baseRate: 1 }]);
  f.memory.seed("centralBanks", [
    {
      _id: "US",
      countryId: "US",
      primeRate: 10,
      primeRateSmoothed: 2,
      chairCharacterId: String(chair),
      chairMode: "player",
      chairInfamy: 95,
      resolveStreak: 0,
      fomcBoard: [],
    },
  ]);
  f.memory.seed("characters", [{ _id: chair, actions: 20, personalWealth: 1000 }]);
  f.memory.seed("federalBudget", [
    {
      _id: "federal",
      countryId: "US",
      gdp: 20000000000000,
      surplus: 100000,
      economicFactors: { inflationRate: 15, householdPriceIndex: 1.1, gdpGrowth: 2, wageGrowth: 2 },
      revenue: { total: 1000 },
      spending: { total: 500, debtInterest: 100 },
      sovereignCrisisState: "recovering",
      recoveryStartedAt: { turn: 99 },
      recoveryFiscalDisciplineStreak: 0,
      recoveryGdpPenaltyTurnsRemaining: 10,
    },
  ]);
  return f;
}
const transitions = [
  {
    name: "rate EMA",
    collection: "centralBanks",
    op: "bulkWrite" as const,
    run: (db: Db) => processFomcMeetings(db, 100, 2027, new Date(0)),
  },
  {
    name: "chair scrutiny and AP",
    collection: "characters",
    op: "bulkWrite" as const,
    run: (db: Db) => processCentralBankChairTurn(db, 100),
  },
  {
    name: "sovereign recovery",
    collection: "federalBudget",
    op: "bulkWrite" as const,
    run: (db: Db) => processSovereignRecoveryTurn(db, 100),
  },
  {
    name: "full inflation",
    collection: "federalBudget",
    op: "updateOne" as const,
    run: (db: Db) => runInflationRecalc(db, 100),
  },
];
describe("monetary transitions have original-turn receipts", () => {
  it.each(transitions)(
    "$name restores a landed interruption and replays without a second step",
    async ({ collection, op, run }) => {
      const { db, memory } = fixture(),
        before = await db.collection(collection).find({}).toArray();
      const fault = withInjectedCrash(memory, { collection, op, onCall: 1, afterWrite: true });
      await expect(run(fault.db)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(await db.collection(collection).find({}).toArray()).toEqual(before);
      const first = await run(db),
        after = await db.collection(collection).find({}).toArray();
      expect(after).not.toEqual(before);
      expect(await run(db)).toEqual(first);
      expect(await db.collection(collection).find({}).toArray()).toEqual(after);
    }
  );
  it("a delayed half-step cannot advance the price index after the full step", async () => {
    const { db } = fixture();
    await runInflationRecalc(db, 100);
    const full = await db.collection("federalBudget").findOne({});
    const result = await runInflationRecalc(db, 100, { stepFraction: 0.5 });
    expect(result.updated).toBe(0);
    expect(result.alreadyStepped).toBeGreaterThan(0);
    expect(await db.collection("federalBudget").findOne({})).toEqual(full);
  });
  it("overlapping full inflation passes publish the same settled index", async () => {
    const { db } = fixture();
    const result = await Promise.all([runInflationRecalc(db, 100), runInflationRecalc(db, 100)]);
    expect(result[0]).toEqual(result[1]);
    expect(
      await db.collection("bankMoneyMoves").countDocuments({ phase: "inflation-recalculation" })
    ).toBe(1);
  });
});
