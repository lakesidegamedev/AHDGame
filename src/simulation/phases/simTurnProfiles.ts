/**
 * SIM-ONLY turn-phase profiles for the headless worldsim.
 *
 * Inert unless a sandbox gameConfig sets `simTurnPhaseMode: "elections-only"`,
 * in which case the turn runtime skips ELECTIONS_SKIP_PHASES so election-balance
 * runs skip the heavy economic machinery while all political phases still run
 * against the real engine.
 *
 * A denylist, not an allowlist: any phase not named here runs by default, so a
 * new political phase is included automatically. This file IS the
 * econ/election boundary.
 *
 * Because the econ phases are skipped, national metrics, prices and approval
 * drivers hold at bootstrap values for the whole run, giving a stable substrate
 * for reading election balance.
 */

export type SimTurnPhaseMode = "full" | "elections-only" | "economy-only" | "macro-only";

/**
 * Economic phases retained for a fixed-policy macro balance run. This is an
 * allowlist so elections, campaigns, legislation, cabinet churn, and random
 * events remain frozen while the real economy and accounting loops advance.
 */
export const ECONOMY_ONLY_PHASES: ReadonlySet<string> = new Set<string>([
  "bannedShareholderRelease",
  "inactiveShareholderShareRelease",
  "corporationTurn",
  "departmentProgramSettlement",
  "unionsTurn",
  "savingsInterestTurn",
  "npcBankPolicyTurn",
  "bankingTurn",
  "pensionTurn",
  "prospectingResolution",
  "macroCountryTurn",
  "bondTurn",
  "commodityPrices",
  "contractSettlement",
  "lineOfCreditTurn",
  "recomputeSharePrices",
  "bankSolvencyTurn",
  "financialSuspectScan",
  "settlement",
  "fiscalYear",
  "policyEffects",
  "demographicEffects",
  "unownedSectorGrowth",
  "metricDecay",
  "investorConfidenceDecay",
  "stateOwnershipConcentration",
  "subsidyBudget",
  "regionalBudgetProcessing",
  "jpRegionalBudgetProcessing",
  "deRegionalBudgetProcessing",
  "metricEngine",
  "demographicFlows",
  "census",
  "eraCrossing",
  "metricActivation",
  "nationalMetrics",
  "fiscalBaseGrowth",
  "economicModel",
  "tradeGrowthMirror",
  "inflationRecalc",
  "commandEconomy",
  "brettonWoodsTurn",
  "ledgerPreForexSnapshot",
  "forexTurn",
  "centralBankChairTurn",
  "fomcMeetings",
  "nppMonetaryOperations",
  "metricHistory",
  "interestRateSnapshot",
  "portfolioSnapshot",
  "corpPortfolioSnapshot",
  "stockExchangeSnapshot",
  "investorRankingSnapshot",
  "wealthListSnapshot",
  "gameHealthSnapshot",
  "auditAnomalyScan",
  "suspiciousDetection",
  "indexFunds",
  "moneySupplySnapshot",
  "ledgerBalanceSnapshot",
  "ledgerReconcile",
  "economicVitalSigns",
]);

/**
 * Fixed-corporate subset for long macro horizons. Commodity prices still run
 * against the cloned flow state, while corporate strategy and heavy ledgers
 * remain frozen.
 */
export const MACRO_ONLY_PHASES: ReadonlySet<string> = new Set<string>([
  "macroCountryTurn",
  "departmentProgramSettlement",
  "commodityPrices",
  "fiscalYear",
  "policyEffects",
  "demographicEffects",
  "unownedSectorGrowth",
  "metricDecay",
  "investorConfidenceDecay",
  "stateOwnershipConcentration",
  "subsidyBudget",
  "regionalBudgetProcessing",
  "jpRegionalBudgetProcessing",
  "deRegionalBudgetProcessing",
  "metricEngine",
  "demographicFlows",
  "census",
  "eraCrossing",
  "metricActivation",
  "nationalMetrics",
  "fiscalBaseGrowth",
  "economicModel",
  "tradeGrowthMirror",
  "inflationRecalc",
  "commandEconomy",
  "brettonWoodsTurn",
  "ledgerPreForexSnapshot",
  "forexTurn",
  "centralBankChairTurn",
  "fomcMeetings",
  "nppMonetaryOperations",
  "metricHistory",
  "interestRateSnapshot",
  "gameHealthSnapshot",
  "auditAnomalyScan",
  "suspiciousDetection",
  "moneySupplySnapshot",
]);

/**
 * Economy / finance / ledger phases skipped under the "elections-only" profile.
 * Every name here must exist in BASE_TURN_PHASE_NAMES (src/simulation/phases/
 * turnPhaseNames.ts). Names are matched exactly; an unknown name is simply never
 * hit (harmless). Deliberately excludes ambiguous political phases (crisisTurn,
 * ministerialOrders, billLifecycle, referendumLifecycle) — those are kept.
 */
export const ELECTIONS_SKIP_PHASES: ReadonlySet<string> = new Set<string>([
  // Intelligence is not election machinery. This list is a DENYLIST, so a phase
  // left out of it RUNS and bills time in every election-balance run.
  "intelligenceTurn",
  // Account / shareholder maintenance (groups 1-2)
  "bannedShareholderRelease",
  "inactiveShareholderShareRelease",
  // resourceAndFinanceStart — economy/finance core (corporationTurn = the hotspot)
  "corporationTurn",
  "departmentProgramSettlement",
  "unionsTurn",
  "nppUnionBehavior",
  "savingsInterestTurn",
  "npcBankPolicyTurn",
  "bankingTurn",
  "pensionTurn",
  "prospectingResolution",
  "bondTurn",
  "macroCountryTurn",
  "commodityPrices",
  "contractSettlement",
  "lineOfCreditTurn",
  "recomputeSharePrices",
  "bankSolvencyTurn",
  "financialSuspectScan",
  // stateEffectsAndNationalAggregation — the economy legs only. The approval /
  // demographic / snapshot legs of this mega-adapter (nationalMetrics, census,
  // demographicFlows, bucketApprovalDecay, approvalSnapshot, metricHistory,
  // partyHistorySnapshot, socialAxisDrift, policyEffects, demographicEffects) are
  // NOT listed here, so they keep running and feed vote share.
  "unownedSectorGrowth",
  "metricDecay",
  "investorConfidenceDecay",
  "stateOwnershipConcentration",
  "subsidyBudget",
  "regionalBudgetProcessing",
  "jpRegionalBudgetProcessing",
  "deRegionalBudgetProcessing",
  "metricEngine",
  "metricActivation",
  "fiscalBaseGrowth",
  "economicModel",
  "tradeGrowthMirror",
  "inflationRecalc",
  "brettonWoodsTurn",
  "ledgerPreForexSnapshot",
  "forexTurn",
  "centralBankChairTurn",
  "fomcMeetings",
  "centralBankChairExecutiveRemoval",
  "centralBankChairSelection",
  // fiscalYearBoundary
  "fiscalYear",
  // Economy snapshots
  "interestRateSnapshot",
  "portfolioSnapshot",
  "corpPortfolioSnapshot",
  "stockExchangeSnapshot",
  "investorRankingSnapshot",
  "wealthListSnapshot",
  // indexFunds + ledger groups
  "indexFunds",
  "ledgerBalanceSnapshot",
  "ledgerReconcile",
  "economicVitalSigns",
]);

/**
 * Build the per-phase predicate passed into createTurnPhaseRuntime.
 * Returns `undefined` for the full/default profile so the runtime does ZERO
 * extra work in prod (no filtering closure at all). Returns a denylist predicate
 * for "elections-only".
 */
export function getSimTurnPhasePredicate(
  mode: SimTurnPhaseMode | undefined | null
): ((phaseName: string) => boolean) | undefined {
  if (mode === "macro-only") return (phaseName: string) => MACRO_ONLY_PHASES.has(phaseName);
  if (mode === "economy-only") return (phaseName: string) => ECONOMY_ONLY_PHASES.has(phaseName);
  if (mode !== "elections-only") return undefined;
  return (phaseName: string) => !ELECTIONS_SKIP_PHASES.has(phaseName);
}
