import { expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { convertPublicCurrency } from "./convertPublicCurrency";
it("rolls back an interrupted regional conversion and preserves debt rates and turns on retry", async () => {
  const f = createTransactionalMemoryDb();
  const financing = {
    principal: 420,
    cash: 210,
    annualInterest: 21,
    interestRate: 0.05,
    lastSettledTurn: 111,
    borrowed: 84,
    repaid: 42,
    interestPaid: 4.2,
  };
  f.memory.seed("states", [{ _id: "ON", countryId: "CA", gdp: 4200 }]);
  f.memory.seed("stateBudgets", [
    { _id: "ON", countryId: "CA", revenue: { total: 420 }, balance: 210, financing },
  ]);
  f.memory.seed("regionalBudgets", [{ _id: "ON", totalBudget: 420, financing }]);
  const budgets = f.memory.collection("stateBudgets"),
    update = budgets.updateOne.bind(budgets);
  vi.spyOn(budgets, "updateOne").mockImplementationOnce(async (...args) => {
    await update(...args);
    throw new Error("interrupted regional denomination");
  });
  await expect(convertPublicCurrency(f.db, "ON", 0.2)).rejects.toThrow(
    "interrupted regional denomination"
  );
  expect(f.memory.collection("states").docs[0].gdp).toBe(4200);
  expect(budgets.docs[0].financing).toEqual(financing);
  await convertPublicCurrency(f.db, "ON", 0.2);
  expect(f.memory.collection("states").docs[0].gdp).toBe(840);
  expect(budgets.docs[0].financing).toMatchObject({
    principal: 84,
    cash: 42,
    annualInterest: 4.2,
    interestRate: 0.05,
    lastSettledTurn: 111,
  });
  expect(f.memory.collection("regionalBudgets").docs[0].financing).toEqual(
    budgets.docs[0].financing
  );
});
