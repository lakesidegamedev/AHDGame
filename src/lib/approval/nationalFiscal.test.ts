import { expect, it } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { loadNationalFiscalApprovalModifiers } from "./nationalFiscal";

it("converts the budget's debt fraction to percent without mixing regional budgets", async () => {
  const db = createMockDb();
  db.collection("federalBudget").findOne.mockResolvedValue({
    debtToGdpRatio: 1.5,
    surplus: -8,
    gdp: 100,
  });
  const modifiers = await loadNationalFiscalApprovalModifiers(db as unknown as Db, "US");
  expect(modifiers).toContainEqual(expect.objectContaining({ id: "nationalDebt", effect: -1 }));
  expect(modifiers).toContainEqual(expect.objectContaining({ id: "nationalDeficit", effect: -3 }));
  expect(db.collectionMocks.federalBudget.findOne).toHaveBeenCalledWith(
    { countryId: "US" },
    expect.objectContaining({ projection: expect.any(Object) })
  );
  expect(db.collectionMocks.stateBudgets).toBeUndefined();
  expect(db.collectionMocks.regionalBudgets).toBeUndefined();
});
