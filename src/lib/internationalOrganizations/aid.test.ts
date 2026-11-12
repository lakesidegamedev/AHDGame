import { describe, it, expect } from "vitest";
import { aidGrowthBoost } from "./aid";
import { payOrganizationAid } from "./aid";
import { createMockDb } from "@/lib/test-utils/mockDb";
import type { Db } from "mongodb";

describe("aidGrowthBoost", () => {
  it("is zero for non-positive amounts", () => {
    expect(aidGrowthBoost(0)).toBe(0);
    expect(aidGrowthBoost(-5)).toBe(0);
  });

  it("grows with aid size and is capped", () => {
    const small = aidGrowthBoost(1_000_000); // $1M
    const big = aidGrowthBoost(1_000_000_000); // $1B
    expect(big).toBeGreaterThan(small);
    expect(aidGrowthBoost(1e15)).toBeLessThanOrEqual(0.5);
  });

  it("does not value or debit aid for a recipient outside the preset fiscal roster", async () => {
    const db = createMockDb();
    expect(
      await payOrganizationAid(db as unknown as Db, "UN", "YU", 100, {
        context: {
          turn: 37,
          preset: "2027-default",
          treasuryCashLedgerEnabled: true,
          rates: new Map([["USD", 1]]),
          budgetCurrencies: new Map([["US", "USD"]]),
          fundCountries: new Map([["UN", "US"]]),
        },
      })
    ).toBe(false);
    expect(db.collectionMocks.organizationFunds).toBeUndefined();
    expect(db.collectionMocks.federalBudget).toBeUndefined();
  });
});
