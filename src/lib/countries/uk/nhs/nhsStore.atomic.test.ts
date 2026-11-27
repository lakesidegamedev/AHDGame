import { describe, expect, it } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { tickNhsFromBudget } from "./nhsStore";
const args = { fiscalYear: 1953, currentTurn: 10, now: new Date(0) };
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 9, worldEpochId: "synthetic-nhs" }]);
  f.memory.seed("ukNhsState", [{ _id: "current", quality: 60 }]);
  f.memory.seed("federalBudget", [
    { _id: "UK", spending: { total: 100, byCategory: { health: 40 } } },
  ]);
  return f;
}
describe("NHS quality retry identity", () => {
  it.each(["ukNhsState", "bankMoneyMoves"])(
    "rolls back landed %s and advances once",
    async (collection) => {
      const f = fixture();
      const fault = withInjectedCrash(f.memory, { collection, onCall: 1, afterWrite: true });
      await expect(tickNhsFromBudget(fault.db, args)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect((await f.db.collection("ukNhsState").findOne({}))!.quality).toBe(60);
      const q = await tickNhsFromBudget(f.db, args);
      expect(q).toBeGreaterThan(60);
      expect(await tickNhsFromBudget(f.db, args)).toBe(q);
    }
  );
  it("overlapping ticks keep the original result even if funding changes", async () => {
    const f = fixture();
    const [a, b] = await Promise.all([
      tickNhsFromBudget(f.db, args),
      tickNhsFromBudget(f.db, args),
    ]);
    expect(a).toBe(b);
    await f.db
      .collection("federalBudget")
      .updateOne({ _id: "UK" as never }, { $set: { spending: {} } });
    expect(await tickNhsFromBudget(f.db, args)).toBe(a);
    expect(await tickNhsFromBudget(f.db, { ...args, currentTurn: 11 })).toBeGreaterThan(0);
  });
});
