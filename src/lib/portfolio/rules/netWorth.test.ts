import { it, expect } from "vitest";
import { personalNetWorth, personalPortfolioNetWorth } from "./netWorth";
it("reconciles all asset classes against loan and tax liabilities on portfolio pages", () => {
  const parts = {
    stockValue: 10,
    bondValue: 20,
    fundValue: 250,
    cashValue: 1000,
    loanDebt: 300,
    incomeTaxDebt: 50,
  };
  expect(personalPortfolioNetWorth(parts)).toBe(930);
  expect(personalPortfolioNetWorth({ ...parts, loanDebt: 2000 })).toBe(-770);
  expect(personalNetWorth(1280, 2000, 50)).toBe(0);
});

it("preserves negative historical wealth using recorded liabilities", async () => {
  const { recordedPersonalNetWorth } = await import("./netWorth");
  expect(
    recordedPersonalNetWorth({
      totalValue: 100,
      locDebtValue: 200,
      incomeTaxDebtValue: 10,
      netValue: 0,
    })
  ).toBe(-110);
  expect(recordedPersonalNetWorth({ totalValue: 100 })).toBeNull();
  expect(recordedPersonalNetWorth({ totalValue: 100, netValue: 90 })).toBe(90);
});
