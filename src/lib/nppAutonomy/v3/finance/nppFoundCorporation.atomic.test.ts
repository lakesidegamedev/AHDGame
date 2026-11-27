import { describe, it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import type { NPP } from "@/lib/db/types";
import { nppFoundCorporation } from "./nppFoundCorporation";
vi.mock("./shareCashLedger", () => ({ witnessNppFoundingCash: async () => {} }));
vi.mock("@/lib/admin/spawnNppCorporation", () => ({
  generateNppCorpName: () => "Founder Corp",
  spawnNppCorporation: async (db: Db) => {
    const id = new ObjectId(),
      ceo = new ObjectId();
    await db.collection("corporations").insertOne({
      _id: id,
      ceoId: ceo,
      liquidCapital: 2_000_000,
      shareholders: [{ nppId: ceo, shares: 100 }],
    });
    await db.collection("corporateSectors").insertOne({ corporationId: id, capacity: 5 });
    return { corporationId: String(id), nppId: String(ceo), name: "Founder Corp" };
  },
}));
function world() {
  const f = createTransactionalMemoryDb(),
    founder = {
      _id: new ObjectId(),
      countryId: "CA",
      homeState: "ON",
      party: "lib",
      nppInvestmentCashAnchor: 1000,
    } as unknown as NPP;
  f.memory.seed("gameState", [{ _id: "current", worldEpochId: "founding", currentTurn: 10 }]);
  f.memory.seed("npps", [founder as unknown as Record<string, unknown>]);
  const run = (db = f.db) =>
    nppFoundCorporation(db, founder, "agriculture", 280, 10, 2.8, new Set());
  return { ...f, founder, run };
}
describe("NPP corporation founding transaction", () => {
  it.each(["corporations", "corporateSectors"])(
    "rolls back a landed %s creation and grants only once on parallel retry",
    async (collection) => {
      const f = world(),
        fault = withInjectedCrash(f.memory, {
          collection,
          op: "insertOne",
          onCall: 1,
          afterWrite: true,
        });
      expect((await f.run(fault.db)).ok).toBe(false);
      expect(f.memory.collection("corporations").docs).toHaveLength(0);
      expect(f.memory.collection("corporateSectors").docs).toHaveLength(0);
      expect(f.memory.collection("npps").docs[0].nppInvestmentCashAnchor).toBe(1000);
      const results = await Promise.all([f.run(), f.run()]);
      expect(results.every((r) => r.ok)).toBe(true);
      expect(f.memory.collection("corporations").docs).toHaveLength(1);
      expect(f.memory.collection("corporateSectors").docs).toHaveLength(1);
      expect(f.memory.collection("npps").docs[0].nppInvestmentCashAnchor).toBe(900);
      expect(f.memory.collection("corporations").docs[0]).toMatchObject({
        ceoId: f.founder._id,
        liquidCapital: 2_000_000,
        shareholders: [{ nppId: f.founder._id, shares: 100 }],
      });
    }
  );
});
