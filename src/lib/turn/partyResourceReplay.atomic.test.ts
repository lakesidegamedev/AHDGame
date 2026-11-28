import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { processRegDriftDecay } from "./partyOrg/regDriftDecay";
import { processPartyActionGeneration } from "./partyActionGeneration";
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
const now = new Date("2026-01-01T00:00:00Z");
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 11, worldEpochId: "test" }]);
  f.memory.seed("stateRegistrationPool", [
    {
      _id: "US_TX",
      countryId: "US",
      stateId: "TX",
      independent: 50,
      unregistered: 30,
      lastUpdatedTurn: 11,
    },
  ]);
  f.memory.seed("statePartyOrg", [
    {
      _id: "TX_1",
      countryId: "US",
      stateId: "TX",
      partyId: "1",
      organization: 40,
      registration: 20,
      treasury: 1000000,
      politicalStrength: 20,
      nppActionPoints: 0,
    },
  ]);
  f.memory.seed("politicalParties", [
    {
      _id: new ObjectId(),
      countryId: "US",
      sequentialId: 1,
      tier: "major",
      politicalStrength: 20,
      nppActionPoints: 0,
      treasury: 1000000,
      psInvestmentBudget: 25000,
    },
  ]);
  return f;
}
it.each(["statePartyOrg", "stateRegistrationPool", "orgRegLedger", "bankMoneyMoves"])(
  "registration rolls back a landed %s write and replays the original turn",
  async (collection) => {
    const { memory } = fixture();
    const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
    await expect(processRegDriftDecay(12, now, fault.db)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(memory.collection("statePartyOrg").docs[0].registration).toBe(20);
    expect(memory.collection("stateRegistrationPool").docs[0].independent).toBe(50);
    const first = await processRegDriftDecay(12, now, fault.db);
    const balance = memory.collection("statePartyOrg").docs[0].registration;
    const second = await processRegDriftDecay(12, new Date(now.getTime() + 1000), fault.db);
    expect(second).toEqual(first);
    expect(memory.collection("statePartyOrg").docs[0].registration).toBe(balance);
    const pool = memory.collection("stateRegistrationPool").docs[0];
    expect(Number(balance) + Number(pool.independent) + Number(pool.unregistered)).toBeCloseTo(
      100,
      9
    );
  }
);
it.each([
  "politicalParties",
  "statePartyOrg",
  "partyPoliticalStrengthLedger",
  "treasuryTransactions",
  "bankMoneyMoves",
])(
  "strength generation rolls back a landed %s write and only buys strength once",
  async (collection) => {
    const { memory } = fixture();
    const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
    await expect(processPartyActionGeneration(now, fault.db, 12)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(memory.collection("politicalParties").docs[0].treasury).toBe(1000000);
    const first = await processPartyActionGeneration(now, fault.db, 12);
    expect(memory.collection("politicalParties").docs[0].treasury).toBe(975000);
    expect(await processPartyActionGeneration(now, fault.db, 12)).toEqual(first);
    expect(memory.collection("politicalParties").docs[0].treasury).toBe(975000);
    expect(memory.collection("treasuryTransactions").docs).toHaveLength(1);
  }
);
it("overlapping registration and strength replays converge on one turn each", async () => {
  const { db, memory } = fixture();
  await Promise.all([processRegDriftDecay(12, now, db), processRegDriftDecay(12, now, db)]);
  await Promise.all([
    processPartyActionGeneration(now, db, 12),
    processPartyActionGeneration(now, db, 12),
  ]);
  expect(memory.collection("politicalParties").docs[0].treasury).toBe(975000);
  expect(memory.collection("bankMoneyMoves").docs).toHaveLength(2);
});
