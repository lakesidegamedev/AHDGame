import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/budget/costs", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/budget/costs")>();
  return {
    ...actual,
    getSelectedPolicyOption: vi.fn(() => ({ name: "Second University" })),
    calculatePolicyOptionAnnualCost: vi.fn(() => 1_000_000_000),
  };
});
vi.mock("@/lib/budget/spending", () => ({
  resolveNationalGdpPerCapita: vi.fn(async () => 10_000),
  resolveNationalMedianIncome: vi.fn(async () => 10_000),
}));
vi.mock("@/lib/politicalLegislation/fiscalBase", () => ({
  countryFiscalBase: vi.fn(async () => ({ gdp: 1, population: 1 })),
  regionFiscalBase: vi.fn(async () => ({ gdp: 1, population: 1 })),
}));

vi.mock("@/lib/legislature/provisionEnrichment/fiscal", () => ({
  resolveProvisionFiscal: vi.fn(async () => ({})),
}));

import { resolveProvisionFiscal } from "@/lib/legislature/provisionEnrichment/fiscal";
import { validateStateBudgetImpact } from "./validation";

describe("validateStateBudgetImpact funding source", () => {
  let db: MockDb;

  beforeEach(() => {
    db = createMockDb();
    db.collection("stateBudgets");
    db.collection("regionalBudgets");
    db.collection("states");
    db.collection("legislationTypes");
    db.collectionMocks.legislationTypes.find.mockReturnValue({
      toArray: vi.fn(async () => [{ _id: "university", budgetCost: 0 }]),
    });
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "BY",
      countryId: "DE",
      population: 10_000_000,
      gdp: 200_000,
    });
  });

  it("funds a German regional bill from the live regional surplus, even when the legacy state budget is stale", async () => {
    db.collectionMocks.stateBudgets.findOne.mockResolvedValue({
      _id: "BY",
      countryId: "DE",
      revenue: { total: 100_000_000 },
      spending: { total: 100_000_000 },
      balance: 0,
      stateGdp: 100_000_000,
    });
    db.collectionMocks.regionalBudgets.findOne.mockResolvedValue({
      _id: "BY",
      countryId: "DE",
      totalBudget: 90_000_000_000,
      enactedBillCosts: 20_000_000_000,
      subsidyCosts: 0,
      surplus: 70_000_000_000,
    });

    const result = await validateStateBudgetImpact(db as unknown as Db, "BY", "DE", {
      legislationTypeId: "university",
      effectDirection: 1,
    });

    expect(result.allowed).toBe(true);
    expect(result.newBalance).toBe(69_000_000_000);
    expect(result.newTotalSpending).toBe(21_000_000_000);
  });

  it("rejects a German regional bill when its cost exceeds the live surplus", async () => {
    db.collectionMocks.regionalBudgets.findOne.mockResolvedValue({
      _id: "BY",
      countryId: "DE",
      totalBudget: 90_000_000_000,
      surplus: 500_000_000,
    });

    const result = await validateStateBudgetImpact(db as unknown as Db, "BY", "DE", {
      legislationTypeId: "university",
      effectDirection: 1,
    });

    expect(result.allowed).toBe(false);
    expect(result.shortfall).toBe(500_000_000);
  });

  it("continues to use revenue and accumulated balance for US state bills", async () => {
    db.collectionMocks.stateBudgets.findOne.mockResolvedValue({
      _id: "TX",
      countryId: "US",
      revenue: { total: 2_000_000_000 },
      spending: { total: 1_000_000_000 },
      balance: 1_000_000_000,
      stateGdp: 100_000_000_000,
    });

    const result = await validateStateBudgetImpact(db as unknown as Db, "TX", "US", {
      legislationTypeId: "university",
      effectDirection: 1,
    });

    expect(result.allowed).toBe(true);
    expect(result.newBalance).toBe(1_000_000_000);
    expect(db.collectionMocks.regionalBudgets.findOne).not.toHaveBeenCalled();
  });

  describe("revenue raised by the same bill", () => {
    const taxAndSpendBill = {
      legislationTypeId: "university",
      effectDirection: 1,
      provisions: [
        {
          type: "policy" as const,
          legislationTypeId: "university",
          effectDirection: 1,
        },
        {
          type: "policy" as const,
          legislationTypeId: "salesTax",
          policyOptionId: "rate:10",
          effectDirection: 1,
          proposedRate: 10,
        },
      ],
    };

    beforeEach(() => {
      // Revenue already fully spent: no headroom without the bill's own tax rise.
      db.collectionMocks.stateBudgets.findOne.mockResolvedValue({
        _id: "TX",
        countryId: "US",
        revenue: { total: 2_000_000_000 },
        spending: { total: 2_000_000_000 },
        balance: 0,
        stateGdp: 100_000_000_000,
      });
      db.collectionMocks.legislationTypes.find.mockReturnValue({
        toArray: vi.fn(async () => [
          { _id: "university", budgetCost: 0 },
          { _id: "salesTax", budgetCost: 0 },
        ]),
      });
    });

    it("refuses the spending when no tax revenue is raised", async () => {
      const result = await validateStateBudgetImpact(
        db as unknown as Db,
        "TX",
        "US",
        taxAndSpendBill as never
      );
      expect(result.allowed).toBe(false);
    });

    it("passes a bill whose own tax rise funds its spending", async () => {
      vi.mocked(resolveProvisionFiscal).mockResolvedValueOnce({
        fiscal: {
          currencyCode: "USD",
          currentRate: 6,
          proposedRate: 10,
          revenueDelta: 5_000_000_000,
        },
      } as never);
      const result = await validateStateBudgetImpact(
        db as unknown as Db,
        "TX",
        "US",
        taxAndSpendBill as never
      );
      expect(result.allowed).toBe(true);
      expect(result.newBalance).toBe(3_000_000_000);
    });

    it("does not let a tax cut add headroom or new refusals", async () => {
      vi.mocked(resolveProvisionFiscal).mockResolvedValueOnce({
        fiscal: {
          currencyCode: "USD",
          currentRate: 10,
          proposedRate: 6,
          revenueDelta: -5_000_000_000,
        },
      } as never);
      const result = await validateStateBudgetImpact(
        db as unknown as Db,
        "TX",
        "US",
        taxAndSpendBill as never
      );
      expect(result.allowed).toBe(false);
      expect(result.shortfall).toBe(2_000_000_000);
    });
  });
});
