import { describe, expect, it } from "vitest";
import { HOUSEHOLD_OPENING_TURNS, planHouseholdOpeningSeed } from "./householdOpeningRules";

const w = (id: string, spend: number, rate = 1) => ({
  walletId: id,
  countryId: id.toUpperCase(),
  currency: "USD",
  localPerAnchor: rate,
  perTurnSpendingAnchor: spend,
});

describe("household opening cash", () => {
  it("seeds a few turns of spending per wallet and reports what it creates", () => {
    const plan = planHouseholdOpeningSeed({
      wallets: [w("us", 100), w("jp", 50, 150)],
      approvalReference: "owner-2026-10-18",
    });
    expect(plan.seeds.find((s) => s.walletId === "us")!.openingCashAnchor).toBe(
      100 * HOUSEHOLD_OPENING_TURNS
    );
    expect(plan.seeds.find((s) => s.walletId === "jp")!.openingCashLocal).toBe(
      50 * HOUSEHOLD_OPENING_TURNS * 150
    );
    expect(plan.createdAnchor).toBe(150 * HOUSEHOLD_OPENING_TURNS);
  });
  it("refuses without an approval reference", () => {
    expect(() =>
      planHouseholdOpeningSeed({ wallets: [w("us", 1)], approvalReference: " " })
    ).toThrow();
  });
  it("refuses duplicates, missing rates and negative spending", () => {
    expect(() =>
      planHouseholdOpeningSeed({ wallets: [w("us", 1), w("us", 2)], approvalReference: "x" })
    ).toThrow();
    expect(() =>
      planHouseholdOpeningSeed({ wallets: [w("us", 1, 0)], approvalReference: "x" })
    ).toThrow();
    expect(() =>
      planHouseholdOpeningSeed({ wallets: [w("us", -1)], approvalReference: "x" })
    ).toThrow();
  });
});
