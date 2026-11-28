import { describe, expect, it } from "vitest";
import type { Document } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { collectFiscalTaxes } from "./fiscalScaleTurn";
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("producerEconomyAccounts", [
    {
      _id: "households-US",
      kind: "households",
      worldEpoch: "synthetic",
      countryId: "US",
      cash: 1000,
      currency: "USD",
    },
  ]);
  f.memory.seed("federalBudget", [{ _id: "US", countryId: "US", treasuryCashLocal: 50 }]);
  return f;
}
const input = {
  turn: 10,
  worldEpoch: "synthetic",
  budgets: [{ _id: "US", countryId: "US", currencyCode: "USD", revenue: { total: 1000000 } }],
  scaleByBudget: new Map([["US", 1]]),
  rateByCurrency: new Map([["USD", 1]]),
};
describe("fiscal tax receipt authority", () => {
  it("returns the original collected amount after wallet, quote and budget inputs change", async () => {
    const { db } = fixture();
    const first = await collectFiscalTaxes(db, input);
    expect(first.get("US")).toBeGreaterThan(0);
    const budget = await db
      .collection<Document & { _id: string }>("federalBudget")
      .findOne({ _id: "US" });
    const retry = await collectFiscalTaxes(db, {
      ...input,
      budgets: [{ ...input.budgets[0], revenue: { total: 0 } }],
      rateByCurrency: new Map(),
    });
    expect(retry).toEqual(first);
    expect(await db.collection("federalBudget").findOne({})).toEqual(budget);
    expect(await db.collection("ledgerEntries").countDocuments({})).toBe(1);
  });
  it.each(["producerEconomyAccounts", "federalBudget", "bankMoneyMoves"])(
    "recovers a landed %s failure without changing the tax quote",
    async (collection) => {
      const { db, memory } = fixture();
      const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
      try {
        await collectFiscalTaxes(fault.db, input);
      } catch {
        /* The caller retries interrupted delivery. */
      }
      expect(fault.crashed).toBe(true);
      const result = await collectFiscalTaxes(db, input);
      expect(result.get("US")).toBeGreaterThan(0);
      const household = await db.collection("producerEconomyAccounts").findOne({});
      const treasury = await db.collection("federalBudget").findOne({});
      expect(household!.cash + treasury!.treasuryCashLocal).toBe(1050);
      const again = await collectFiscalTaxes(db, input);
      expect(again).toEqual(result);
      expect((await db.collection("federalBudget").findOne({}))?.treasuryCashLocal).toBe(
        treasury!.treasuryCashLocal
      );
    }
  );
});
