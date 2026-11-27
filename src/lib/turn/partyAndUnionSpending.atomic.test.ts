import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { processPartyGOTV } from "./demographicTurnoutTurn";
import { processLabourRelationsTurn } from "./unions/labourRelationsTurn";
import {
  flattenPartyTurnoutTargets,
  getTurnoutTargetsForCountry,
} from "@/lib/demographics/turnoutTargets";
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotifications: vi.fn(async () => {}) }));
const unionId = new ObjectId(),
  sectorId = new ObjectId(),
  corpId = new ObjectId();
function base() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 99,
      worldEpochId: "synthetic-party-spend",
      preset: "2027-default",
    },
  ]);
  f.memory.seed("gameConfig", [{ _id: "default" }]);
  return f;
}
function partyFixture() {
  const f = base();
  const target = flattenPartyTurnoutTargets(getTurnoutTargetsForCountry("CA", "2027-default"))[0];
  f.memory.seed("partyBudget", [
    {
      _id: new ObjectId(),
      partyId: "1",
      countryId: "CA",
      scope: "national",
      gotvBudgetPerTurn: 1000,
      gotvBudgetPercent: 0,
      gotvTargetCategory: target.category,
      gotvTargetGroup: target.group,
    },
  ]);
  f.memory.seed("politicalParties", [
    {
      _id: new ObjectId(),
      countryId: "CA",
      sequentialId: 1,
      name: "Synthetic party",
      treasury: 10000,
      economicPosition: target.economicLean,
      socialPosition: target.socialLean,
    },
  ]);
  f.memory.seed("stateDemographicTurnout", [
    { _id: "ON", countryId: "CA", modifiers: { [target.category]: { [target.group]: 0 } } },
  ]);
  f.memory.seed("states", [{ _id: "ON", countryId: "CA", population: 100000, gdp: 1000000000 }]);
  f.memory.seed("exchangeRates", [{ _id: "CA", currencyCode: "CAD", baseRate: 1.4, rate: 1.4 }]);
  f.memory.seed("federalBudget", [{ _id: "CA", countryId: "CA", currencyCode: "CAD" }]);
  return { ...f, target };
}
function unionFixture() {
  const f = base();
  f.memory.seed("unions", [
    { _id: unionId, name: "Synthetic union", countryId: "US", treasury: 5000 },
  ]);
  f.memory.seed("corporateSectors", [
    {
      _id: sectorId,
      stateId: "NY",
      workers: 1000,
      unionization: 60,
      wageLevel: 1,
      workerExpectationIndex: 1.1,
    },
  ]);
  f.memory.seed("bargainingCampaigns", [
    {
      _id: new ObjectId(),
      unionId,
      countryId: "US",
      sectorType: "manufacturing",
      employerCorporationId: corpId,
      sectorIds: [sectorId],
      status: "dispute",
      escalationLevel: "overtime_ban",
      startedAtTurn: 95,
      deadlineTurn: 100,
      disputeStartedAtTurn: 100,
      lastActionTurn: 100,
    },
  ]);
  f.memory.seed("macroMetrics", [
    { _id: "NY", economic: { costOfLiving: { value: 110 } } },
    { _id: "us_national", economic: { unemploymentRate: { value: 5 } } },
  ]);
  return f;
}
const gotv = (db: import("mongodb").Db) =>
  processPartyGOTV(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    100,
    db
  );
describe("party turnout payment and delivery", () => {
  it.each([
    "politicalParties",
    "treasuryTransactions",
    "financialTxLog",
    "stateDemographicTurnout",
    "bankMoneyMoves",
  ])("rolls back landed %s and preserves native receipts on retry", async (collection) => {
    const f = partyFixture();
    const fault = withInjectedCrash(f.memory, { collection, onCall: 1, afterWrite: true });
    await expect(gotv(fault.db)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect((await f.db.collection("politicalParties").findOne({}))!.treasury).toBe(10000);
    expect(
      (await f.db.collection("stateDemographicTurnout").findOne({}))!.modifiers[f.target.category][
        f.target.group
      ]
    ).toBe(0);
    const first = await gotv(f.db);
    expect(await gotv(f.db)).toEqual(first);
    expect((await f.db.collection("politicalParties").findOne({}))!.treasury).toBe(9000);
    expect(
      (await f.db.collection("stateDemographicTurnout").findOne({}))!.modifiers[f.target.category][
        f.target.group
      ]
    ).toBeGreaterThan(0);
    expect(
      (await f.db.collection("financialTxLog").findOne({ type: "party_gotv_spend" }))!.currencyCode
    ).toBe("CAD");
  });
  it("overlapping spenders deliver one paid boost", async () => {
    const f = partyFixture();
    const [a, b] = await Promise.all([gotv(f.db), gotv(f.db)]);
    expect(a).toEqual(b);
    expect((await f.db.collection("politicalParties").findOne({}))!.treasury).toBe(9000);
  });
});
describe("union ban upkeep settlement", () => {
  it.each(["bargainingCampaigns", "unions", "bankMoneyMoves"])(
    "rolls back landed %s before retry",
    async (collection) => {
      const f = unionFixture();
      const fault = withInjectedCrash(f.memory, { collection, onCall: 1, afterWrite: true });
      await expect(processLabourRelationsTurn(fault.db, 100)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect((await f.db.collection("unions").findOne({}))!.treasury).toBe(5000);
      const result = await processLabourRelationsTurn(f.db, 100);
      const after = await f.db.collection("unions").findOne({});
      expect(after!.treasury).toBeLessThan(5000);
      expect(await processLabourRelationsTurn(f.db, 100)).toEqual(result);
      expect(await f.db.collection("unions").findOne({})).toEqual(after);
    }
  );
  it("overlapping upkeep passes debit one installment", async () => {
    const f = unionFixture();
    const [a, b] = await Promise.all([
      processLabourRelationsTurn(f.db, 100),
      processLabourRelationsTurn(f.db, 100),
    ]);
    expect(a).toEqual(b);
    expect(await f.db.collection("bankMoneyMoves").countDocuments({})).toBe(1);
  });
});
