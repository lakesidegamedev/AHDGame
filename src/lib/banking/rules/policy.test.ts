import { describe, expect, it } from "vitest";
import {
  BANKING_POLICY_ALL_ON,
  BANKING_POLICY_OFF,
  resolveBankingPolicy,
  savingsReadsAuthoritative,
  type BankingPolicyConfig,
} from "./policy";

describe("resolveBankingPolicy", () => {
  it("requires banking, Treasury cash accounting and explicit construction finance permission", () => {
    expect(resolveBankingPolicy({ bankConstructionFinanceEnabled: true }).constructionFinance).toBe(
      false
    );
    expect(resolveBankingPolicy({ privateBankingEnabled: true }).constructionFinance).toBe(false);
    expect(
      resolveBankingPolicy({ privateBankingEnabled: true, bankConstructionFinanceEnabled: true })
        .constructionFinance
    ).toBe(false);
    expect(
      resolveBankingPolicy({
        privateBankingEnabled: true,
        treasuryCashLedgerEnabled: true,
        bankConstructionFinanceEnabled: true,
      }).constructionFinance
    ).toBe(true);
  });
  it("enables the funded Treasury cash ledger only on an explicit true flag", () => {
    expect(resolveBankingPolicy(null).treasuryCashLedger).toBe(false);
    expect(resolveBankingPolicy({ treasuryCashLedgerEnabled: false }).treasuryCashLedger).toBe(
      false
    );
    expect(resolveBankingPolicy({ treasuryCashLedgerEnabled: true }).treasuryCashLedger).toBe(true);
  });

  it("enables Treasury holdings with banking alone", () => {
    expect(resolveBankingPolicy({ privateBankingEnabled: true }).bankTreasury).toBe(true);
    expect(resolveBankingPolicy({ privateBankingEnabled: false }).bankTreasury).toBe(false);
  });
  it("enables forex fees with banking whenever prop trading is not switched off", () => {
    expect(resolveBankingPolicy({ privateBankingEnabled: true }).propForexFees).toBe(true);
    expect(
      resolveBankingPolicy({ privateBankingEnabled: true, bankPropTradingEnabled: false })
        .propForexFees
    ).toBe(false);
  });
  it("defaults to banking off, LOC on, with a missing config document", () => {
    expect(resolveBankingPolicy(null)).toEqual({
      privateBanking: false,
      failurePolitics: false,
      constructionFinance: false,
      propTrading: false,
      propForexFees: false,
      bankTreasury: false,
      sovereignPrimary: false,
      treasuryCashLedger: false,
      contagion: false,
      lineOfCredit: true,
      primaryUnderwriting: false,
      advancedCharters: false,
      savingsAccounts: "off",
      savingsReadCurrencies: [],
    });
    expect(resolveBankingPolicy(undefined)).toEqual(BANKING_POLICY_OFF);
  });

  it("treats prop trading and contagion as kill switches that require banking", () => {
    expect(resolveBankingPolicy({ privateBankingEnabled: true })).toEqual({
      privateBanking: true,
      failurePolitics: true,
      constructionFinance: false,
      propTrading: true,
      propForexFees: true,
      bankTreasury: true,
      sovereignPrimary: false,
      treasuryCashLedger: false,
      contagion: true,
      lineOfCredit: true,
      primaryUnderwriting: true,
      advancedCharters: true,
      savingsAccounts: "off",
      savingsReadCurrencies: [],
    });
    expect(
      resolveBankingPolicy({
        privateBankingEnabled: false,
        bankPropTradingEnabled: true,
        bankContagionEnabled: true,
      })
    ).toEqual(BANKING_POLICY_OFF);
    expect(
      resolveBankingPolicy({ privateBankingEnabled: true, bankPropTradingEnabled: false })
        .propTrading
    ).toBe(false);
    expect(
      resolveBankingPolicy({ privateBankingEnabled: true, bankContagionEnabled: false }).contagion
    ).toBe(false);
  });

  it("turns LOC off only on an explicit false", () => {
    expect(resolveBankingPolicy({ lineOfCreditEnabled: false }).lineOfCredit).toBe(false);
    expect(resolveBankingPolicy({ lineOfCreditEnabled: undefined }).lineOfCredit).toBe(true);
  });

  it("enables primary underwriting with private banking alone", () => {
    expect(resolveBankingPolicy({ privateBankingEnabled: true }).primaryUnderwriting).toBe(true);
    expect(resolveBankingPolicy({ privateBankingEnabled: false }).primaryUnderwriting).toBe(false);
  });

  it("offers advanced charters with banking alone", () => {
    expect(resolveBankingPolicy({ privateBankingEnabled: true }).advancedCharters).toBe(true);
    expect(resolveBankingPolicy({ privateBankingEnabled: false }).advancedCharters).toBe(false);
  });

  it("carries funded failure politics with private banking alone", () => {
    expect(resolveBankingPolicy({ privateBankingEnabled: true }).failurePolitics).toBe(true);
    expect(resolveBankingPolicy({ privateBankingEnabled: false }).failurePolitics).toBe(false);
  });

  it("returns a frozen snapshot", () => {
    const snapshot = resolveBankingPolicy({ privateBankingEnabled: true });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(BANKING_POLICY_ALL_ON).toEqual({
      privateBanking: true,
      failurePolitics: true,
      constructionFinance: true,
      propTrading: true,
      propForexFees: true,
      bankTreasury: true,
      sovereignPrimary: true,
      treasuryCashLedger: true,
      contagion: true,
      lineOfCredit: true,
      primaryUnderwriting: true,
      advancedCharters: true,
      savingsAccounts: "off",
      savingsReadCurrencies: [],
    });
  });

  it("carries the savings rollout stage and read cohort", () => {
    expect(resolveBankingPolicy({ savingsAccountsMode: "shadow" }).savingsAccounts).toBe("shadow");
    expect(resolveBankingPolicy({ savingsAccountsMode: "bogus" as never }).savingsAccounts).toBe(
      "off"
    );
    const live = resolveBankingPolicy({
      savingsAccountsMode: "authoritative",
      savingsAccountsReadCurrencies: ["USD"],
    });
    expect(savingsReadsAuthoritative(live, "USD")).toBe(true);
    expect(savingsReadsAuthoritative(live, "GBP")).toBe(false);
    // Read cohorts mean nothing before writes are authoritative.
    const shadow = resolveBankingPolicy({
      savingsAccountsMode: "shadow",
      savingsAccountsReadCurrencies: ["USD"],
    });
    expect(shadow.savingsReadCurrencies).toEqual([]);
    expect(savingsReadsAuthoritative(shadow, "USD")).toBe(false);
  });

  it("is a pure function of the config: same input, same snapshot, every time", () => {
    const configs: BankingPolicyConfig[] = [];
    for (const privateBankingEnabled of [true, false, undefined]) {
      for (const bankPropTradingEnabled of [true, false, undefined]) {
        for (const lineOfCreditEnabled of [true, false, undefined]) {
          configs.push({ privateBankingEnabled, bankPropTradingEnabled, lineOfCreditEnabled });
        }
      }
    }
    for (const config of configs) {
      expect(resolveBankingPolicy(config)).toEqual(resolveBankingPolicy({ ...config }));
    }
  });
});
