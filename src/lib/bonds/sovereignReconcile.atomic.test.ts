import { describe, expect, it } from "vitest";
import { reconcileSovereignDebt } from "./sovereign";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";

function fixture() {
  const { db, memory } = createTransactionalMemoryDb();
  memory.seed("gameState", [{ _id: "current", currentTurn: 240 }]);
  memory.seed("federalBudget", [
    {
      _id: "federal",
      countryId: "US",
      currencyCode: "USD",
      debt: { principal: 10_000_000, interestRate: 0.05 },
      spending: { total: 1_000_000, debtInterest: 100_000 },
      revenue: { total: 2_000_000 },
      treasuryBalance: 1234,
      gdp: 100_000_000,
      surplus: 1_000_000,
      creditRating: "AAA",
    },
  ]);
  memory.seed("centralBanks", [{ _id: "US", primeRate: 5 }]);
  memory.seed("exchangeRates", [{ _id: "USD", currencyCode: "USD", rate: 1 }]);
  return { db, memory };
}
const params = { countryId: "US" as const, turn: 240, now: new Date("2026-01-01") };

describe("sovereign reconciliation atomic publication", () => {
  it.each(["bonds", "federalBudget", "financialTxLog"])(
    "rolls back a landed %s write and replays coupons once",
    async (collection) => {
      const { memory } = fixture();
      const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
      await expect(reconcileSovereignDebt(fault.db, params)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(memory.collection("bonds").docs).toHaveLength(0);
      expect(memory.collection("federalBudget").docs[0].spending).toEqual({
        total: 1_000_000,
        debtInterest: 100_000,
      });
      const result = await reconcileSovereignDebt(fault.db, params);
      expect(result!.totalIssued).toBe(10_000_000);
      const budget = memory.collection("federalBudget")
        .docs[0] as unknown as import("@/lib/db/types").FederalBudget;
      expect(budget.spending.debtInterest).toBeCloseTo(100_000 + result!.budgetInterestDelta);
      expect(budget.spending.total).toBeCloseTo(1_000_000 + result!.budgetInterestDelta);
      expect(budget.surplus).toBeCloseTo(1_000_000 - result!.budgetInterestDelta);
      expect(budget.treasuryBalance).toBe(1234);
      const retry = await reconcileSovereignDebt(fault.db, params);
      expect(retry!.totalIssued).toBe(0);
      expect(memory.collection("financialTxLog").docs).toHaveLength(result!.tranches.length);
      expect(memory.collection("federalBudget").docs[0].spending).toEqual(budget.spending);
    }
  );

  it("allows overlapping attempts to issue the source gap only once", async () => {
    const { db, memory } = fixture();
    const results = await Promise.all([
      reconcileSovereignDebt(db, params),
      reconcileSovereignDebt(db, params),
    ]);
    expect(results.reduce((sum, result) => sum + result!.totalIssued, 0)).toBe(10_000_000);
    expect(
      memory.collection("bonds").docs.reduce((sum, bond) => sum + Number(bond.totalIssued), 0)
    ).toBe(10_000_000);
  });
});
