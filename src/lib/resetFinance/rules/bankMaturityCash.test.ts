import { describe, expect, it } from "vitest";
import { fundedBankMaturityCashByCountry, type BankMaturityReceipt } from "./bankMaturityCash";

function receipt(country: string, amount: number, applied = true): BankMaturityReceipt {
  const entry = (account: string) => ({
    applied,
    projection: {
      collection: "ledgerEntries",
      insert: {
        txType: "gov_bond_maturity_payment",
        emitSite: "banking/bankSovereignClaims:funding",
        legs: [
          { account: `${account}:${country}:USD`, amount: -amount, role: "primary" },
          { account: "sink:bank_sovereign_claim_funded:USD", amount, role: "contra" },
        ],
      },
    },
  });
  return { projections: [entry("government"), entry("government_cash")] };
}

describe("funded bank maturity cash receipts", () => {
  it("counts funded Treasury cash once across banks, insurance and countries", () => {
    expect(
      fundedBankMaturityCashByCountry([receipt("US", 2000), receipt("US", 500), receipt("CA", 800)])
    ).toEqual({ US: 2500, CA: 800 });
  });
  it("ignores unapplied witnesses and later release receipts", () => {
    expect(
      fundedBankMaturityCashByCountry([receipt("US", 2000, false), { projections: [] }])
    ).toEqual({});
  });
  it("does not count coupon funding or non-bank maturity receipts", () => {
    const coupon = receipt("US", 100);
    coupon.projections!.forEach((item) => {
      item.projection!.insert!.txType = "gov_coupon_payment";
    });
    const nonbank = receipt("CA", 100);
    nonbank.projections!.forEach((item) => {
      item.projection!.insert!.emitSite = "bonds/sovereignMaturity";
    });
    expect(fundedBankMaturityCashByCountry([coupon, nonbank])).toEqual({});
  });
  it.each([NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1])("refuses invalid cash %s", (amount) => {
    expect(() => fundedBankMaturityCashByCountry([receipt("US", amount)])).toThrow();
  });
});
