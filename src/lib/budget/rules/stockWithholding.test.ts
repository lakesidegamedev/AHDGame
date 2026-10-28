import { describe, expect, it } from "vitest";
import { stockSaleWithholding, type StockWithholdingContext } from "./stockWithholding";
import { stockTaxReceipt } from "./capitalGainsTax";

const context: StockWithholdingContext = {
  tier: "high",
  countryId: "US",
  currency: "USD",
  sourcePath: "currencyBalances.personal.USD",
  sourceFx: 1,
  walletFx: 1,
  nationalBudgetId: "federal",
  nationalCurrency: "USD",
  nationalFx: 1,
  stateId: "US_CA",
  regionalCurrency: "USD",
  regionalFx: 1,
  nationalRates: { incomeTax: 30, capitalGainsTaxHigh: 20 },
  regionalRates: { incomeTax: 5, capitalGainsTaxHigh: 5 },
};
describe("share sale withholding", () => {
  it("taxes profit, distinguishes holding terms and preserves cost basis", () => {
    const receipt = {
      version: 1 as const,
      assessmentTurn: 2,
      incomeAmount: 100,
      capitalAmount: 200,
      costBasisAnchor: 700,
    };
    const held = stockSaleWithholding(receipt, context);
    expect(held.income).toMatchObject({ gross: 100, federal: 30, regional: 5 });
    expect(held.capital).toMatchObject({ gross: 200, federal: 40, regional: 10 });
    expect(held.walletAmount).toBe(85);
    expect(stockTaxReceipt({ ...receipt, withholding: held })).toBeDefined();
    expect(() =>
      stockTaxReceipt({ ...receipt, withholding: { ...held, walletAmount: 0 } })
    ).toThrow();
  });
  it.each([1, 0.75, 118.6])("converts an anchor wallet to tax currency at %s", (sourceFx) => {
    const held = stockSaleWithholding(
      { version: 1, assessmentTurn: 2, incomeAmount: 0, capitalAmount: 1000 },
      { ...context, sourceFx, walletFx: 1 }
    );
    expect(held.walletAmount).toBeCloseTo(
      (Math.floor(1000 * sourceFx * 0.2) + Math.floor(1000 * sourceFx * 0.05)) / sourceFx
    );
    expect(held.walletAmount).toBeLessThanOrEqual(1000);
  });
  it("does not tax recovered basis or losses", () => {
    expect(
      stockSaleWithholding(
        { version: 1, assessmentTurn: 2, incomeAmount: 0, capitalAmount: 0 },
        context
      ).walletAmount
    ).toBe(0);
  });
  it("caps combined taxes at realized profit", () => {
    expect(
      stockSaleWithholding(
        { version: 1, assessmentTurn: 2, incomeAmount: 100, capitalAmount: 100 },
        { ...context, nationalRates: { incomeTax: 100 }, regionalRates: { incomeTax: 100 } }
      ).walletAmount
    ).toBe(200);
  });
});
