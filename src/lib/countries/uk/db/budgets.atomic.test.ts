import { describe, it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { tableBudgetWithBill, applyBudgetOutcome } from "./budgets";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/countries/uk/budget/budgetValidation", () => ({
  validateBudget: () => ({ ok: true }),
}));
vi.mock("@/lib/countries/uk/confidence/confidenceGaugeStore", () => ({
  applyConfidenceEventToGov: async (db: Db) => {
    await db
      .collection("governmentFormations")
      .updateOne({ _id: "UK" as never }, { $inc: { events: 1 } });
  },
}));
describe("annual UK budget atomic lifecycle", () => {
  it("rolls back tabled status after the vote bill lands, then tables once", async () => {
    const f = createTransactionalMemoryDb();
    f.memory.seed("ukBudgets", [{ _id: new ObjectId(), fiscalYear: 2027, status: "draft" }]);
    const args = {
      fiscalYear: 2027,
      chancellorCharacterId: null,
      chancellorName: null,
      chancellorParty: null,
      currentTurn: 5,
      now: new Date(),
      provisions: [],
    };
    const fault = withInjectedCrash(f.memory, {
      collection: "bills",
      op: "insertOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(tableBudgetWithBill(fault.db, args)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(f.memory.collection("ukBudgets").docs[0].status).toBe("draft");
    expect(f.memory.collection("bills").docs).toHaveLength(0);
    const results = await Promise.all([
      tableBudgetWithBill(f.db, args),
      tableBudgetWithBill(f.db, args),
    ]);
    expect(results.filter((row) => row.ok)).toHaveLength(1);
    expect(f.memory.collection("bills").docs).toHaveLength(1);
  });
  it.each([true, false])(
    "rolls back passed=%s with a landed confidence outcome and resolves once",
    async (passed) => {
      const f = createTransactionalMemoryDb();
      f.memory.seed("ukBudgets", [{ _id: new ObjectId(), fiscalYear: 2027, status: "tabled" }]);
      f.memory.seed("governmentFormations", [{ _id: "UK", events: 0 }]);
      const args = { fiscalYear: 2027, passed, now: new Date() };
      const fault = withInjectedCrash(f.memory, {
        collection: "governmentFormations",
        op: "updateOne",
        onCall: 1,
        afterWrite: true,
      });
      await expect(applyBudgetOutcome(fault.db, args)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(f.memory.collection("ukBudgets").docs[0].status).toBe("tabled");
      expect(f.memory.collection("governmentFormations").docs[0].events).toBe(0);
      const results = await Promise.all([
        applyBudgetOutcome(f.db, args),
        applyBudgetOutcome(f.db, args),
      ]);
      expect(results.filter((row) => row.ok)).toHaveLength(1);
      expect(f.memory.collection("governmentFormations").docs[0].events).toBe(1);
    }
  );
});
