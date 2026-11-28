import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { networkUpkeep } from "@/lib/intelligence/cost";
import { processIntelligenceTurn } from "./intelligenceTurn";
vi.mock("@/lib/coldwar/tension", () => ({ getColdWarTension: async () => ({ value: 40 }) }));
vi.mock("@/lib/countryAccess", () => ({
  getAllCountryAccess: async () => ({
    US: { enabledForPlayers: true },
    PL: { enabledForPlayers: false },
  }),
}));
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 100, worldEpochId: "synthetic-intelligence" },
  ]);
  f.memory.seed("federalBudget", [
    {
      _id: "US",
      countryId: "US",
      gdp: 1000000,
      spending: { byCategory: { intelligence: TURNS_PER_YEAR * 1000 } },
      intelligenceAppropriation: { balance: 100000, accruedThroughTurn: 99 },
    },
  ]);
  f.memory.seed("intelligenceNetworks", [
    {
      _id: new ObjectId(),
      ownerCountryId: "US",
      targetCountryId: "PL",
      level: 1,
      progress: 10,
      funding: "steady",
      suspicion: 40,
      status: "active",
      cooledUntilTurn: null,
      lastOpTurn: 0,
    },
  ]);
  return f;
}
describe("intelligence funding and network delivery", () => {
  it.each([
    { collection: "federalBudget", op: "updateOne" as const },
    { collection: "intelligenceNetworks", op: "bulkWrite" as const },
    { collection: "intelligenceAgencies", op: "bulkWrite" as const },
    { collection: "bankMoneyMoves", op: "insertOne" as const },
  ])(
    "a landed $collection failure leaves the original appropriation and network retryable",
    async (point) => {
      const { db, memory } = fixture();
      const fault = withInjectedCrash(memory, { ...point, onCall: 1, afterWrite: true });
      await expect(processIntelligenceTurn(fault.db, 100)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect((await db.collection("federalBudget").findOne({}))?.intelligenceAppropriation).toEqual(
        { balance: 100000, accruedThroughTurn: 99 }
      );
      expect((await db.collection("intelligenceNetworks").findOne({}))?.progress).toBe(10);
      expect(await db.collection("intelligenceAgencies").countDocuments({})).toBe(0);
      const result = await processIntelligenceTurn(db, 100);
      const progress = (await db.collection("intelligenceNetworks").findOne({}))?.progress;
      expect(progress).toBeGreaterThan(10);
      expect(await processIntelligenceTurn(db, 100)).toEqual(result);
      expect((await db.collection("intelligenceNetworks").findOne({}))?.progress).toBe(progress);
      expect(
        (await db.collection("federalBudget").findOne({}))?.intelligenceAppropriation.balance
      ).toBe(100000 + Math.round(1000 - networkUpkeep("steady", 1000000)));
    }
  );
  it("overlapping phase retries settle one appropriation and one progress step", async () => {
    const { db } = fixture();
    const replies = await Promise.all([
      processIntelligenceTurn(db, 100),
      processIntelligenceTurn(db, 100),
    ]);
    expect(replies[0]).toEqual(replies[1]);
    expect(
      await db.collection("bankMoneyMoves").countDocuments({ kind: "turn-value-settlement" })
    ).toBe(1);
    expect(
      (await db.collection("federalBudget").findOne({}))?.intelligenceAppropriation.balance
    ).toBe(100000 + Math.round(1000 - networkUpkeep("steady", 1000000)));
  });
});
