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
