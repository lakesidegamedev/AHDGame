/**
 * Builds the economy-only reset plan from plain world data.
 *
 * The census shell loads the live world and normalizes it into an
 * EconomyResetSource; this module turns that into the deterministic plan the
 * operator reviews and the apply shell executes. Every list is sorted and
 * every number rounded, so an unchanged world always produces the same plan.
 */
import type { CampaignCurrencyRates } from "@/lib/campaigns/rules/currency";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { getStartingYearForPreset } from "@/lib/constants/turnTime";
import { currencyForCountryAtYear, euroMembersAtYear } from "@/lib/currency/rules/eraCurrency";
import { accountCurrency, accountKind } from "@/lib/ledger/accounts";
import {
  ECONOMY_RESET_PLAN_VERSION,
  type CouponClaimPatch,
  type CurrencyTotals,
  type EconomyResetPlan,
  type LegacyCouponClaimPatch,
  type SovereignBondRehome,
} from "../types";
import {
  rehomeSovereignBond,
  trimCouponClaim,
  type CouponClaimHolder,
  type SovereignBondSource,
} from "./bonds";
import {
  addAmounts,
  centralBankAdjustments,
  centralBankHeldSavings,
  characterEndowment,
  defenceReleases,
  lineOfCreditOutstanding,
  pensionConversions,
  publicBuyerSweeps,
  type CurrencyAmounts,
  type LineOfCreditBook,
} from "./money";

/** Real account kinds whose balances the reset removes or rewrites. */
export const DESTROYED_ACCOUNT_KINDS: readonly string[] = Object.freeze([
  "character",
  "character_savings",
  "corporation",
  "economy_wallet",
  "fund",
  "fund_subscription_escrow",
  "npp",
]);

export interface EconomyResetSource {
  worldEpochId: string;
  currentTurn: number;
  preset: string;
  approvalReference: string;
  config: {
    commandEconomyEnabled: boolean;
    ledgerShadow: boolean;
    treasuryCashLedgerEnabled: boolean;
  };
  wipeCounts: Record<string, number>;
  partialWipeCounts: Record<string, number>;
  campaignRates: CampaignCurrencyRates;
  /** Live local-per-anchor rate by currency. */
  anchorRates: Record<string, number>;
  characters: {
    id: string;
    countryId: string;
    wealth?: string | null;
    referred: boolean;
    savings?: CurrencyAmounts;
    savingsHolder?: Record<string, string>;
    lineOfCredit?: LineOfCreditBook | null;
    pendingLocSettlement: boolean;
  }[];
  imperialCharacterIds: string[];
  npps: {
    id: string;
    hasMoney: boolean;
    savings?: CurrencyAmounts;
    lineOfCredit?: LineOfCreditBook | null;
  }[];
  sovereignBonds: SovereignBondSource[];
  corporateBonds: { id: string; currency: string; totalIssued: number }[];
  couponClaims: {
    id: string;
    pendingProjection: boolean;
    currency: string;
    amountLocal: number;
    holders: CouponClaimHolder[];
  }[];
  legacyCouponClaims: {
    budgetId: string;
    claims: { id: string; amountLocal: number; holders: CouponClaimHolder[] }[];
  }[];
  centralBanks: { bankId: string; reserveBalance: number; pendingLocReserveCredit: boolean }[];
  bankIdByCurrency: Record<string, string>;
  publicBuyerWallets: { walletId: string; countryId: string; currency: string; cash: number }[];
  budgets: {
    budgetId: string;
    countryId: string;
    currencyCode: string;
    /** The stored code, or null when the budget never recorded one. */
    storedCurrencyCode: string | null;
    defenseEncumbered: number;
  }[];
  openDefenceContracts: { countryId: string; encumberedAmount: number }[];
  pensionSchemes: { id: string; assetsAnchor: number; investedValueAnchor?: number }[];
  incomeTax: { open: number; collected: number };
  openMoneyFlowReceipts: number;
  partialBankMoneyMoves: number;
  bankLoanCount: number;
  openingBalances: Record<string, number>;
}

/** Round to a fixed precision so float noise never changes the digest. */
export function roundAmount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1e6) / 1e6;
}

function sortedRecord<T>(record: Record<string, T>, map: (value: T) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) out[key] = map(record[key]);
  return out;
}

function byId<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * applyEraCurrencyTopology redenominates any euro member whose budget is not
 * yet in EUR. On a kept budget that would rescale live fiscal state, so a
 * member treasury that is not already in EUR blocks the reset.
 */
export function currencyTopologyBlockers(
  budgets: { countryId: string; storedCurrencyCode: string | null }[],
  preset: string
): string[] {
  const year = getStartingYearForPreset(preset);
  const members = new Set<string>(
    euroMembersAtYear(year).filter(
      (countryId) =>
        currencyForCountryAtYear(countryId, year, COUNTRY_CURRENCY_MAP[countryId]) === "EUR"
    )
  );
  const out: string[] = [];
  for (const budget of budgets)
    if (members.has(budget.countryId) && budget.storedCurrencyCode !== "EUR")
      out.push(`euro-topology-mismatch:${budget.countryId}:${budget.storedCurrencyCode ?? "none"}`);
  return out;
}

export function buildEconomyResetPlan(source: EconomyResetSource): EconomyResetPlan {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // --- Wallets -----------------------------------------------------------
  const characters = byId(source.characters).map((character) => {
    if (character.pendingLocSettlement) blockers.push(`pending-loc-settlement:${character.id}`);
    return characterEndowment(character, source.preset, source.campaignRates);
  });
  const endowmentsByCurrency: Record<string, number> = {};
  for (const patch of characters) {
    endowmentsByCurrency[patch.currency] =
      (endowmentsByCurrency[patch.currency] ?? 0) + patch.personalLocal;
    if (!(source.anchorRates[patch.currency] > 0))
      blockers.push(`missing-exchange-rate:${patch.currency}`);
  }

  const centralBankSavings: CurrencyAmounts = {};
  const locWrittenOff: CurrencyAmounts = {};
  for (const character of source.characters) {
    addAmounts(
      centralBankSavings,
      centralBankHeldSavings(character.savings, character.savingsHolder)
    );
    addAmounts(locWrittenOff, lineOfCreditOutstanding(character.lineOfCredit));
  }
  for (const npp of source.npps) {
    addAmounts(centralBankSavings, centralBankHeldSavings(npp.savings, undefined));
    addAmounts(locWrittenOff, lineOfCreditOutstanding(npp.lineOfCredit));
  }

  // --- Central banks -----------------------------------------------------
  for (const bank of source.centralBanks)
    if (bank.pendingLocReserveCredit) blockers.push(`pending-loc-reserve-credit:${bank.bankId}`);
  const central = centralBankAdjustments({
    banks: source.centralBanks,
    bankIdByCurrency: source.bankIdByCurrency,
    centralBankSavings,
    locWrittenOff,
  });
  blockers.push(...central.blockers);

  // --- Sovereign debt ----------------------------------------------------
  const sovereignBonds: SovereignBondRehome[] = [];
  for (const bond of byId(source.sovereignBonds)) {
    const result = rehomeSovereignBond(bond);
    blockers.push(...result.blockers);
    if (result.rehome) sovereignBonds.push(result.rehome);
  }
  const couponClaims: CouponClaimPatch[] = [];
  for (const claim of byId(source.couponClaims)) {
    if (claim.pendingProjection) blockers.push(`coupon-claim-settling:${claim.id}`);
    const patch = trimCouponClaim(claim);
    if (patch) couponClaims.push(patch);
  }
  const legacyCouponClaims: LegacyCouponClaimPatch[] = [];
  for (const budget of [...source.legacyCouponClaims].sort((a, b) =>
    a.budgetId.localeCompare(b.budgetId)
  )) {
    const changed = byId(budget.claims)
      .map((claim) => ({ claim, patch: trimCouponClaim({ ...claim, currency: "" }) }))
      .filter((row) => row.patch !== null);
    if (changed.length === 0) continue;
    legacyCouponClaims.push({
      budgetId: budget.budgetId,
      claimIds: changed.map((row) => row.claim.id),
      removedClaimIds: changed
        .filter((row) => row.patch!.action === "delete")
        .map((row) => row.claim.id),
      amountLocalRemoved: roundAmount(
        changed.reduce(
          (sum, row) => sum + row.patch!.amountLocalBefore - row.patch!.amountLocalAfter,
          0
        )
      ),
    });
  }

  // --- Treasury side -----------------------------------------------------
  blockers.push(...currencyTopologyBlockers(source.budgets, source.preset));
  for (const budget of source.budgets)
    if (!(source.anchorRates[budget.currencyCode] > 0))
      warnings.push(`treasury-without-live-rate:${budget.countryId}:${budget.currencyCode}`);
  const sweeps = publicBuyerSweeps({
    wallets: source.publicBuyerWallets,
    budgets: source.budgets,
    anchorRates: source.anchorRates,
  });
  blockers.push(...sweeps.blockers);
  const defence = defenceReleases({
    contracts: source.openDefenceContracts,
    encumberedByCountry: Object.fromEntries(
      source.budgets.map((budget) => [budget.countryId, budget.defenseEncumbered])
    ),
  });

  // --- In-flight money ---------------------------------------------------
  if (source.openMoneyFlowReceipts > 0)
    blockers.push(`open-money-flow-receipts:${source.openMoneyFlowReceipts}`);
  if (source.partialBankMoneyMoves > 0)
    blockers.push(`partial-bank-money-moves:${source.partialBankMoneyMoves}`);
  if (source.incomeTax.collected > 0)
    blockers.push(`collected-income-tax-in-flight:${source.incomeTax.collected}`);

  // --- Money census ------------------------------------------------------
  const destroyedByKind: Record<string, Record<string, CurrencyTotals>> = {};
  for (const [account, anchor] of Object.entries(source.openingBalances)) {
    const kind = accountKind(account);
    if (!DESTROYED_ACCOUNT_KINDS.includes(kind)) continue;
    const currency = accountCurrency(account);
    const rate = source.anchorRates[currency];
    const totals = ((destroyedByKind[kind] ??= {})[currency] ??= { native: 0, anchor: 0 });
    totals.anchor += anchor;
    totals.native += rate > 0 ? anchor * rate : anchor;
  }
  const corporateBondFaceByCurrency: Record<string, number> = {};
  for (const bond of source.corporateBonds)
    corporateBondFaceByCurrency[bond.currency] =
      (corporateBondFaceByCurrency[bond.currency] ?? 0) + (bond.totalIssued ?? 0);

  const round = (value: number) => roundAmount(value);
  return {
    version: ECONOMY_RESET_PLAN_VERSION,
    worldEpochId: source.worldEpochId,
    currentTurn: source.currentTurn,
    ledgerTurn: source.currentTurn + 1,
    preset: source.preset,
    approvalReference: source.approvalReference,
    commandEconomyEnabled: source.config.commandEconomyEnabled,
    ledgerShadow: source.config.ledgerShadow,
    treasuryCashLedgerEnabled: source.config.treasuryCashLedgerEnabled,
    wipe: Object.keys(source.wipeCounts)
      .sort()
      .map((collection) => ({ collection, count: source.wipeCounts[collection] })),
    partialWipe: Object.keys(source.partialWipeCounts)
      .sort()
      .map((collection) => ({ collection, count: source.partialWipeCounts[collection] })),
    characters,
    imperialCharacterIds: [...source.imperialCharacterIds].sort(),
    nppIdsWithMoney: source.npps
      .filter((npp) => npp.hasMoney)
      .map((npp) => npp.id)
      .sort(),
    sovereignBonds,
    corporateBondIds: source.corporateBonds.map((bond) => bond.id).sort(),
    couponClaims: couponClaims.map((claim) => ({
      ...claim,
      amountLocalBefore: round(claim.amountLocalBefore),
      amountLocalAfter: round(claim.amountLocalAfter),
    })),
    legacyCouponClaims,
    centralBanks: central.adjustments.map((row) => ({
      ...row,
      centralBankSavingsDestroyed: round(row.centralBankSavingsDestroyed),
      locWrittenOff: round(row.locWrittenOff),
      reserveBalanceBefore: round(row.reserveBalanceBefore),
      reserveBalanceAfter: round(row.reserveBalanceAfter),
      unabsorbed: round(row.unabsorbed),
    })),
    publicBuyerSweeps: sweeps.sweeps.map((row) => ({
      ...row,
      walletCash: round(row.walletCash),
      treasuryCredit: round(row.treasuryCredit),
    })),
    defenceReleases: defence,
    pensionConversions: pensionConversions(source.pensionSchemes).map((row) => ({
      ...row,
      assetsAnchorBefore: round(row.assetsAnchorBefore),
      investedValueAnchor: round(row.investedValueAnchor),
    })),
    incomeTaxAssessmentsVoided: source.incomeTax.open,
    money: {
      destroyedByKind: sortedRecord(destroyedByKind, (byCurrency) =>
        sortedRecord(byCurrency, (totals) => ({
          native: round(totals.native),
          anchor: round(totals.anchor),
        }))
      ),
      endowmentsByCurrency: sortedRecord(endowmentsByCurrency, round),
      corporateBondFaceByCurrency: sortedRecord(corporateBondFaceByCurrency, round),
      bankLoanCount: source.bankLoanCount,
    },
    openingBalances: sortedRecord(source.openingBalances, round),
    warnings: [...new Set(warnings)].sort(),
    blockers: [...new Set(blockers)].sort(),
  };
}
