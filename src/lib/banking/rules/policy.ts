/**
 * Feature availability for banking, resolved once and carried as a value.
 *
 * The switches that remain govern this subsystem, and they were interpreted at
 * forty-odd call sites through four helper functions, each with its own
 * default. A request that asked twice could get two answers if the config
 * changed between reads; a turn phase that asked per bank paid a read per bank;
 * and the LOC switch, which defaults ON, was one typo away from being read with
 * the banking convention, which defaults OFF.
 *
 * This module is the one interpretation. The shell loads the config document
 * once per request or turn, resolves it here, and passes the frozen snapshot
 * down. Nothing below the shell asks the database what is enabled.
 */

export type SavingsAccountsMode = "off" | "shadow" | "authoritative";

export interface BankingPolicyConfig {
  privateBankingEnabled?: boolean;
  bankConstructionFinanceEnabled?: boolean;
  bankPropTradingEnabled?: boolean;
  bankContagionEnabled?: boolean;
  lineOfCreditEnabled?: boolean;
  treasuryCashLedgerEnabled?: boolean;
  savingsAccountsMode?: SavingsAccountsMode;
  savingsAccountsReadCurrencies?: string[];
}

/** Projection for the one config read the shell performs. */
export const BANKING_POLICY_PROJECTION = Object.freeze({
  privateBankingEnabled: 1,
  bankConstructionFinanceEnabled: 1,
  bankPropTradingEnabled: 1,
  bankContagionEnabled: 1,
  lineOfCreditEnabled: 1,
  treasuryCashLedgerEnabled: 1,
  savingsAccountsMode: 1,
  savingsAccountsReadCurrencies: 1,
} as const);

export interface BankingPolicySnapshot {
  /** Private banking as a whole. Off means a read-only freeze, not a drain. */
  privateBanking: boolean;
  /** Funded resolution consequences, on whenever banking is on. */
  failurePolitics?: boolean;
  /** Bank term loans tied to paid capacity builds, explicitly enabled only. */
  constructionFinance?: boolean;
  /** Prop desks, interbank market, margin line. Requires private banking. */
  propTrading: boolean;
  /** Funded short-sovereign treasury holdings, on whenever banking is on. */
  bankTreasury: boolean;
  /**
   * Investment-bank subscriptions to unplaced sovereign offers. Requires the
   * funded treasury-cash ledger on top of banking and prop trading.
   */
  sovereignPrimary?: boolean;
  /** Funded size-priced forex fees. Requires banking and prop trading. */
  propForexFees: boolean;
  /** Funded corporate equity and bond primary underwriting, on with banking. */
  primaryUnderwriting?: boolean;
  /** Failure contagion between same-currency deposit takers. Requires private banking. */
  contagion: boolean;
  /** Player lines of credit at the central bank. */
  lineOfCredit: boolean;
  /** Investment and universal charters offered to players. Requires private banking. */
  advancedCharters: boolean;
  treasuryCashLedger: boolean;
  /** Savings account rollout stage. */
  savingsAccounts: SavingsAccountsMode;
  /** Currencies whose reads come from the accounts. Empty unless authoritative. */
  savingsReadCurrencies: readonly string[];
}

/**
 * The defaults, stated once:
 *
 * - private banking is OFF unless explicitly `true`;
 * - prop trading and contagion are ON when banking is on, unless explicitly
 *   `false` (kill switches, not features);
 * - line of credit is ON unless explicitly `false`;
 * - everything else the funded layer needs is ON with private banking, except
 *   construction finance, which also needs an explicit opt-in because it ties
 *   bank cash to a third party's build, and the treasury cash ledger, which is
 *   still opt-in.
 */
export function resolveBankingPolicy(
  config: BankingPolicyConfig | null | undefined
): BankingPolicySnapshot {
  const privateBanking = config?.privateBankingEnabled === true;
  const mode = config?.savingsAccountsMode;
  const savingsAccounts: SavingsAccountsMode =
    mode === "shadow" || mode === "authoritative" ? mode : "off";
  const readCurrencies =
    savingsAccounts === "authoritative" && Array.isArray(config?.savingsAccountsReadCurrencies)
      ? Object.freeze([...config.savingsAccountsReadCurrencies])
      : Object.freeze([]);
  const propTrading = privateBanking && config?.bankPropTradingEnabled !== false;
  const treasuryCashLedger = config?.treasuryCashLedgerEnabled === true;
  return Object.freeze({
    privateBanking,
    failurePolitics: privateBanking,
    constructionFinance:
      privateBanking && treasuryCashLedger && config?.bankConstructionFinanceEnabled === true,
    propTrading,
    bankTreasury: privateBanking,
    sovereignPrimary: privateBanking && propTrading && treasuryCashLedger,
    propForexFees: privateBanking && propTrading,
    primaryUnderwriting: privateBanking,
    contagion: privateBanking && config?.bankContagionEnabled !== false,
    lineOfCredit: config?.lineOfCreditEnabled !== false,
    advancedCharters: privateBanking,
    treasuryCashLedger,
    savingsAccounts,
    savingsReadCurrencies: readCurrencies,
  });
}

/** Everything off: the snapshot for a world with no config document. */
export const BANKING_POLICY_OFF: BankingPolicySnapshot = resolveBankingPolicy(null);

/** Everything on: the snapshot the simulation harness and tests start from. */
export const BANKING_POLICY_ALL_ON: BankingPolicySnapshot = resolveBankingPolicy({
  privateBankingEnabled: true,
  bankConstructionFinanceEnabled: true,
  bankPropTradingEnabled: true,
  treasuryCashLedgerEnabled: true,
  bankContagionEnabled: true,
  lineOfCreditEnabled: true,
});

/** Whether balance-sheet and API reads for `currency` come from the accounts. */
export function savingsReadsAuthoritative(
  policy: BankingPolicySnapshot,
  currency: string
): boolean {
  return (
    policy.savingsAccounts === "authoritative" && policy.savingsReadCurrencies.includes(currency)
  );
}
