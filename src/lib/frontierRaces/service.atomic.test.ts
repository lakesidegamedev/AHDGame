import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { fundFrontierRace, processFrontierRaces } from "./service";
import { entrantKey } from "./rules";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/era/context", () => ({ getEraContext: async () => ({ year: 2050 }) }));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn() }));
function world() {
  const f = createTransactionalMemoryDb(),
    corp = new ObjectId(),
    loser = new ObjectId();
  f.memory.seed("corporations", [
    { _id: corp, name: "Winner", rdScore: 10000 },
    { _id: loser, name: "Loser", rdScore: 0 },
  ]);
  return { ...f, corp, loser };
}
describe("atomic frontier contributions and awards", () => {
  it("does not leave paid R&D pending after promotion fails", async () => {
    const f = world(),
      input = {
        raceId: "fusion",
        kind: "corporation" as const,
        entityId: f.corp.toHexString(),
        points: 100,
        turn: 1,
      };
    const fault = withInjectedCrash(f.memory, {
      collection: "frontierRaces",
      op: "findOneAndUpdate",
      onCall: 2,
      afterWrite: true,
    });
    await expect(fundFrontierRace(fault.db, input)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(f.memory.collection("corporations").docs[0].rdScore).toBe(10000);
    expect((await fundFrontierRace(f.db, input)).ok).toBe(true);
    expect(f.memory.collection("corporations").docs[0].rdScore).toBe(9900);
    expect(f.memory.collection("frontierRaces").docs[0].contributions).toEqual({
      [entrantKey("corporation", input.entityId)]: 100,
    });
  });
  it.each(["winner", "licence"])(
    "rolls back the %s claim after a landed award and resolves once",
    async (mode) => {
      const f = world(),
        winnerKey = entrantKey("corporation", f.corp.toHexString()),
        loserKey = entrantKey("corporation", f.loser.toHexString());
      f.memory.seed("frontierRaces", [
        {
          _id: "fusion",
          contributions: { [winnerKey]: 6000, [loserKey]: 2000 },
          names: {},
          ...(mode === "licence"
            ? {
                winner: { key: winnerKey, points: 6000, turn: 1 },
                losers: [{ key: loserKey, points: 2000 }],
                licenceTurn: 49,
                licencesSettled: false,
              }
            : {}),
        },
      ]);
      const fault = withInjectedCrash(f.memory, {
        collection: "corporations",
        op: "updateOne",
        onCall: 1,
        afterWrite: true,
      });
      await expect(processFrontierRaces(fault.db, 50)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      const before = f.memory.collection("frontierRaces").docs[0];
      if (mode === "winner") expect(before.winner).toBeUndefined();
      else expect(before.licencesSettled).toBe(false);
      const results = await Promise.all([
        processFrontierRaces(f.db, 50),
        processFrontierRaces(f.db, 50),
      ]);
      expect(
        results.reduce(
          (sum, row) => sum + (mode === "winner" ? row.racesWon : row.licencesIssued),
          0
        )
      ).toBe(1);
      expect(
        f.memory.collection("corporations").docs[mode === "winner" ? 0 : 1].frontierMethods
      ).toEqual({ fusion: mode });
    }
  );
});
