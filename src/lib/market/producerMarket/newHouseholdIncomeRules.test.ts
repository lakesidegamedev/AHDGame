import { describe, expect, it } from "vitest";
import {
  NEW_HOUSEHOLD_INCOME_MAX_SHARE,
  newHouseholdIncome,
  newHouseholdIncomeAuditWarning,
  newHouseholdIncomeOn,
  newHouseholdIncomeRecord,
  newHouseholdIncomeShare,
} from "./newHouseholdIncomeRules";
import { checkConservation } from "./shadowCarryRules";

describe("how much new household income", () => {
  it("is twice the annual real growth rate, at most 3%, and nothing while shrinking", () => {
    expect(newHouseholdIncomeShare(1.1)).toBeCloseTo(0.022, 12);
    expect(newHouseholdIncomeShare(8)).toBe(NEW_HOUSEHOLD_INCOME_MAX_SHARE);
    expect(newHouseholdIncomeShare(0)).toBe(0);
    expect(newHouseholdIncomeShare(-1.25)).toBe(0);
    expect(newHouseholdIncomeShare(undefined)).toBe(0);
    expect(newHouseholdIncomeShare(Number.NaN)).toBe(0);
  });

  it("is on unless the stage is set to 0", () => {
    expect(newHouseholdIncomeOn({})).toBe(true);
    expect(newHouseholdIncomeOn({ newHouseholdIncomeStage: 1 })).toBe(true);
    expect(newHouseholdIncomeOn({ newHouseholdIncomeStage: 0 })).toBe(false);
  });
});

describe("who gets it", () => {
  const wallets = [
    { accountId: "us-a", countryId: "US" },
    { accountId: "us-b", countryId: "US" },
    { accountId: "ca-a", countryId: "CA" },
    { accountId: "us-idle", countryId: "US" },
  ];
  const rows = newHouseholdIncome({
    wallets,
    incomeByWallet: new Map([
      ["us-a", 1000],
      ["us-b", 250],
      ["ca-a", 800],
    ]),
    realGdpGrowthByCountry: new Map([
      ["US", 1.1],
      ["CA", -1.25],
    ]),
  });

  it("gives every wallet in a country the same share of its own income: no winners", () => {
    expect(rows.map((r) => [r.walletId, r.countryId])).toEqual([
      ["us-a", "US"],
      ["us-b", "US"],
    ]);
    expect(rows[0]!.amount).toBeCloseTo(22, 9);
    expect(rows[1]!.amount).toBeCloseTo(5.5, 9);
    for (const r of rows) expect(r.share).toBeCloseTo(0.022, 12);
    // A shrinking country and a wallet with no income get nothing.
    expect(rows.some((r) => r.countryId === "CA" || r.walletId === "us-idle")).toBe(false);
  });

  it("keeps a turn record whose countries add up to the total", () => {
    const record = newHouseholdIncomeRecord(rows);
    const byCountry = Object.values(record.byCountry).reduce((s, c) => s + c.amountAnchor, 0);
    expect(record.totalAnchor).toBeCloseTo(27.5, 12);
    expect(byCountry).toBeCloseTo(record.totalAnchor, 12);
    expect(record.byCountry.US!.amountAnchor).toBeCloseTo(27.5, 9);
    expect(record.byCountry.US!.share).toBeCloseTo(0.022, 12);
  });

  it("is a named source in the money check: households close with it, and the check fails without it", () => {
    const opening = 5000;
    const transfers = 300;
    const spent = 900;
    const closing = opening + transfers + 27.5 - spent;
    const sinks = { spentOutsideHouseholds: spent };
    expect(
      checkConservation({
        openingTotal: opening,
        closingTotal: closing,
        sources: { householdTransfer: transfers, newHouseholdIncome: 27.5 },
        sinks,
      }).pass
    ).toBe(true);
    expect(
      checkConservation({
        openingTotal: opening,
        closingTotal: closing,
        sources: { householdTransfer: transfers },
        sinks,
      }).pass
    ).toBe(false);
  });
});

describe("the money-created audit", () => {
  it("is silent when the ledger minted what the turn planned", () => {
    expect(newHouseholdIncomeAuditWarning(27.5, 27.5)).toBeNull();
    expect(newHouseholdIncomeAuditWarning(0, 0)).toBeNull();
  });

  it("warns when the ledger minted more or less than planned", () => {
    expect(newHouseholdIncomeAuditWarning(27.5, 55)).toContain("ledger minted 55.00");
    expect(newHouseholdIncomeAuditWarning(27.5, 0)).toContain("planned 27.50");
  });
});
