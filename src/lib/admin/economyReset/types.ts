/**
 * Plan and marker shapes for the economy-only reset.
 *
 * The plan is plain JSON: ids are hex strings, amounts are numbers and there
 * are no dates, so the same live world always serializes to the same bytes and
 * the same digest.
 */

export const ECONOMY_RESET_PLAN_VERSION = 1;

/** Migration-only store of approved plans, one document per digest. */
export const ECONOMY_RESET_PLANS_COLLECTION = "economyResetPlans";

export const ECONOMY_RESET_PHASES = [
  "holders",
  "bonds",
  "centralBanks",
  "treasury",
  "wipe",
  "unset",
  "indexes",
  "reseedCountryCorporations",
  "reseedUnownedSectors",
  "reseedNppCorporations",
  "reseedNpcBanks",
  "currencyTopology",
  "verifyCommandEconomy",
  "sovereignBonds",
  "moneySupply",
  "fundMigrations",
  "exchangeSnapshot",
  "witness",
  "diagnostic",
] as const;
export type EconomyResetPhase = (typeof ECONOMY_RESET_PHASES)[number];

/** Character wallet reset to its creation endowment. */
export interface CharacterEndowmentPatch {
  id: string;
  countryId: string;
  currency: string;
  /** Home-currency personal cash after the reset. */
  personalLocal: number;
  /** Anchor endowment mirrored into the legacy scalar. */
  cashOnHand: number;
}

export interface SovereignBondRehome {
  id: string;
  countryId: string;
  currency: string;
  totalIssued: number;
  publicFloatBefore: number;
  publicFloatAfter: number;
  holdersRemoved: number;
  unitsMoved: number;
}

export interface CouponClaimPatch {
  id: string;
  /** Delete when no public-float holder remains. */
  action: "delete" | "trim";
  amountLocalBefore: number;
  amountLocalAfter: number;
  currency: string;
}

export interface LegacyCouponClaimPatch {
  budgetId: string;
  claimIds: string[];
  /** Claims with no public-float holder left, removed from the budget array. */
  removedClaimIds: string[];
  amountLocalRemoved: number;
}

export interface CentralBankAdjustment {
  bankId: string;
  currency: string;
  centralBankSavingsDestroyed: number;
  locWrittenOff: number;
  reserveBalanceBefore: number;
  reserveBalanceAfter: number;
  /** Write-off that reserves could not absorb without going negative. */
  unabsorbed: number;
}

export interface PublicBuyerSweep {
  walletId: string;
  countryId: string;
  budgetId: string;
  walletCurrency: string;
  walletCash: number;
  treasuryCurrency: string;
  treasuryCredit: number;
}

export interface DefenceRelease {
  countryId: string;
  encumberedBefore: number;
  release: number;
}

export interface PensionConversion {
  id: string;
  assetsAnchorBefore: number;
  investedValueAnchor: number;
}

export interface CurrencyTotals {
  native: number;
  anchor: number;
}

export interface EconomyResetPlan {
  version: number;
  worldEpochId: string;
  currentTurn: number;
  /** Turn the witness ledger entries belong to: one past the clock. */
  ledgerTurn: number;
  preset: string;
  approvalReference: string;
  commandEconomyEnabled: boolean;
  ledgerShadow: boolean;
  treasuryCashLedgerEnabled: boolean;
  wipe: { collection: string; count: number }[];
  partialWipe: { collection: string; count: number }[];
  characters: CharacterEndowmentPatch[];
  imperialCharacterIds: string[];
  nppIdsWithMoney: string[];
  sovereignBonds: SovereignBondRehome[];
  corporateBondIds: string[];
  couponClaims: CouponClaimPatch[];
  legacyCouponClaims: LegacyCouponClaimPatch[];
  centralBanks: CentralBankAdjustment[];
  publicBuyerSweeps: PublicBuyerSweep[];
  defenceReleases: DefenceRelease[];
  pensionConversions: PensionConversion[];
  incomeTaxAssessmentsVoided: number;
  money: {
    /** Real balances removed, by account kind then currency. */
    destroyedByKind: Record<string, Record<string, CurrencyTotals>>;
    endowmentsByCurrency: Record<string, number>;
    corporateBondFaceByCurrency: Record<string, number>;
    bankLoanCount: number;
  };
  /** Opening balance of every shadow-ledger real account, in anchor units. */
  openingBalances: Record<string, number>;
  warnings: string[];
  blockers: string[];
}

export interface EconomyResetMarker {
  digest: string;
  approvalReference: string;
  phasesDone: EconomyResetPhase[];
  startedAt: Date;
  /** Pre-apply switches restored at the end. */
  restore: { corporationActionsPaused: boolean; playerTransfersPaused: boolean };
  completedAt?: Date;
  diagnosticFailures?: number;
}
