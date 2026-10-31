import type { Db } from "mongodb";
import type { Character, Corporation, CentralBank } from "@/lib/db/types";
import type { LoanFundingSource, LocPaymentMode } from "@/lib/db/types/character";
import type { LocLedgerEntry } from "@/lib/db/types/locLedger";
import { getCurrentTurn } from "@/lib/turn/currentTurn";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { getCountryIdForCurrency } from "@/lib/constants/currencies";
import { getBankId } from "@/lib/centralBank/helpers";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { isLineOfCreditEnabled } from "@/lib/lineOfCredit/featureFlag";
import {
  computeLocBorrowerComposite,
  incomeScoreFromPerTurnCurrency,
  netWorthScoreFromInternal,
  spreadPercentPointsFromComposite,
} from "@/lib/lineOfCredit/creditMath";
import {
  maxLocForExchangeInternal,
  availableForExchangeInternal,
  sumObligationInternal,
  toInternalUnits,
  fromInternalUnits,
  computeAutoPaymentInternal,
  computePerPlayerDtiLimitInternal,
  computePerPlayerNetWorthLimitInternal,
} from "@/lib/lineOfCredit/locMath";
import {
  computeBankLoanDebtInternal,
  computePlayerGrossNetLocInternal,
  loadExchangeRatesMap,
} from "@/lib/lineOfCredit/netWorth";
import { estimatePerTurnCurrencyIncomeHomeFace } from "@/lib/lineOfCredit/currencyIncomeEstimate";
import { getHomeCurrency } from "@/lib/currency/characterFunds";
import { getGameState } from "@/lib/gameState";
import { loadCentralBankPricingAdjustment } from "@/lib/monetaryPolicy/centralBankPricing";
import { equityCashoutLimitsOn, loadEquityCashoutLimitsStage } from "@/lib/equities/cashoutLimits";
import {
  computeControlledEquityHaircutInternal,
  controlledEquityCollateralNote,
} from "@/lib/lineOfCredit/controlledEquity";

const DEFAULT_PRIME = 2.5;

export type LocSnapshot = {
  enabled: true;
  composite: number;
  spreadPercentPoints: number;
  /** Cash + stocks + bonds before LOC (internal units). */
  grossAssetsInternal: number;
  /** Principal + arrears for this character (internal units). */
  locDebtInternal: number;
  /** max(0, grossAssetsInternal − locDebtInternal). */
  netWorthInternal: number;
  /**
   * System-wide LOC cap for the home currency exchange (internal units).
   * = 70% × (national savings deposits + bank reserves).
   */
  maxDebtInternal: number;
  /** Currency whose bank sized the lending pool figures (defaults to home). */
  poolCurrency: CurrencyCode;
  /** Remaining pool capacity in `poolCurrency` face units. */
  availableBorrowFace: number;
  /** This character's principal + arrears across all currencies (internal units). */
  outstandingInternal: number;
  /**
   * Remaining system lending capacity for the home currency exchange (internal units).
   * = systemCap − totalOutstandingAcrossAllBorrowers.
   */
  availableBorrowInternal: number;
  balances: Partial<Record<CurrencyCode, number>>;
  arrears: Partial<Record<CurrencyCode, number>>;
  accountsOpened: Partial<Record<CurrencyCode, boolean>>;
  /** Per-currency funding source (deposits / reserves / both). Defaults to "both". */
  fundingSource: Partial<Record<CurrencyCode, LoanFundingSource>>;
  drawFrozen: boolean;
  incomeScore: number;
  netWorthScore: number;
  hasCeoCorp: boolean;
  /** Home-currency jurisdiction prime used for policy stress on composite. */
  homePrimePercent: number;
  /** LOC debt / gross assets (0–1+). */
  debtToAssetsRatio: number;
  /** Effective annual rate = prime + borrower spread + policy adjustment (percent). */
  effectiveRatePercent: number;
  /** Additional central-bank-wide LOC spread currently in phase-in. */
  policySpreadAdjustmentPercentPoints?: number;
  /** Central-bank savings bonus currently in phase-in. */
  policyDepositBonusPercentPoints?: number;
  /** Progress through the shared central-bank pricing phase-in. */
  policyPricingProgress?: number;
  /** Turns remaining until the shared central-bank pricing targets are reached. */
  policyPricingTurnsRemaining?: number;
  /** Whether this world has started the central-bank pricing change. */
  policyPricingActive?: boolean;
  /** Rolling-average recurring income in home currency face over the recent 48-turn window. */
  incomePerTurnFace: number;
  /** Scheduled LOC auto-payment on current obligation (internal units per turn). */
  scheduledDebtServiceInternal: number;
  /** DTI-based credit ceiling from estimated per-turn income. */
  dtiLimitInternal: number;
  /** Equity-based ceiling for total LOC exposure. */
  netWorthLimitInternal: number;
  /**
   * Value of shares in companies the borrower controls left out of the
   * equity cap (internal units). Present only while the equity cashout limits are on.
   */
  controlledEquityHaircutInternal?: number;
  /** Plain explanation of that haircut for the credit limit display. */
  collateralNote?: string;
  /** Final per-player credit ceiling = min(DTI ceiling, net-worth ceiling). */
  perPlayerLimitInternal: number;
  /** Per-player available draw: min(perPlayerLimit - outstanding, system pool remaining). */
  perPlayerAvailableInternal: number;
  /**
   * Rolling average of bond-income garnished per turn (internal units).
   * Derived from the 5 most recent garnishment ledger entries. Undefined if no
   * garnishments have occurred.
   */
  garnishedPerTurnInternal?: number;
  /** Payment mode per currency. Missing entries default to "pi". */
  paymentMode: Partial<Record<CurrencyCode, LocPaymentMode>>;
  /**
   * Turn number when the mode was last changed for this currency. UI uses
   * (currentTurn - changedAtTurn) to render remaining cooldown. Missing = never changed
   * (no cooldown).
   */
  paymentModeChangedAtTurn: Partial<Record<CurrencyCode, number>>;
  /** Snapshot of the global current turn (from gameState) used to render cooldown remaining. */
  currentTurn: number;
};

/**
 * `poolCurrency` selects whose lending pool sizes `availableBorrowInternal`
 * (and therefore `perPlayerAvailableInternal`). It defaults to the borrower's
 * home currency. The personal credit limit stays shared across all banks.
 */
export async function buildLocSnapshot(
  db: Db,
  character: Character,
  poolCurrency?: CurrencyCode
): Promise<LocSnapshot | null> {
  if (!(await isLineOfCreditEnabled())) return null;
  const forexEnabled = await isForexEnabled();
  if (!forexEnabled) return null;

  const rates = await loadExchangeRatesMap(db);
  const [{ grossInternal, locDebtInternal, netInternal: netOfLocInternal }, bankLoanDebtInternal] =
    await Promise.all([
      computePlayerGrossNetLocInternal(db, character, true, rates),
      computeBankLoanDebtInternal(db, character._id, rates),
    ]);
  // Bank loan debt comes off net worth like credit-line debt does: the cash a
  // bank loan paid out is already counted in gross assets.
  const netInternal = Math.max(0, netOfLocInternal - bankLoanDebtInternal);

  const debtToAssetsRatio =
    grossInternal > 0 ? locDebtInternal / grossInternal : locDebtInternal > 0 ? 1 : 0;

  const gameState = await getGameState(db);
  const home = getHomeCurrency(character, gameState?.preset);
  const homeRate = rates[home] ?? 1;
  const pool = poolCurrency ?? home;
  const poolCountryId = getCountryIdForCurrency(pool);
  // Resolve the actual bank document ID — Eurozone countries share `_id: "ECB"`
  // via `sharedBankId`. Without this, `findOne({ _id: "DE" })` returns null and
  // the pool calc reads 0 deposits / 0 reserves, allowing draws regardless of
  // actual ECB capacity.
  const poolBankId = getBankId(poolCountryId);
  const poolRate = rates[pool] ?? 1;
  const homeBankId = getBankId(getCountryIdForCurrency(home));

  const [homeBank, poolBank, locAgg] = await Promise.all([
    db.collection<CentralBank>("centralBanks").findOne({ _id: homeBankId }),
    poolBankId === homeBankId
      ? Promise.resolve(null)
      : db.collection<CentralBank>("centralBanks").findOne({ _id: poolBankId }),
    // Aggregate total outstanding LOC in the pool currency across all borrowers
    db
      .collection<Character>("characters")
      .aggregate<{ totalBalance: number; totalArrears: number }>([
        {
          $match: {
            $or: [
              { [`lineOfCredit.balances.${pool}`]: { $gt: 0 } },
              { [`lineOfCredit.arrears.${pool}`]: { $gt: 0 } },
            ],
          },
        },
        {
          $group: {
            _id: null,
            totalBalance: { $sum: { $ifNull: [`$lineOfCredit.balances.${pool}`, 0] } },
            totalArrears: { $sum: { $ifNull: [`$lineOfCredit.arrears.${pool}`, 0] } },
          },
        },
      ])
      .toArray(),
  ]);

  const homePrimePercent = homeBank?.primeRate ?? DEFAULT_PRIME;

  // System cap in internal units: 70% of (national savings deposits + bank reserves)
  const sizingBank = poolBankId === homeBankId ? homeBank : poolBank;
  const depositsInternal = toInternalUnits(sizingBank?.nationalSavingsBalance ?? 0, poolRate);
  const reservesInternal = toInternalUnits(sizingBank?.reserveBalance ?? 0, poolRate);
  const systemCapInternal = maxLocForExchangeInternal(depositsInternal, reservesInternal);

  const totalOutstandingFace = (locAgg[0]?.totalBalance ?? 0) + (locAgg[0]?.totalArrears ?? 0);
  const totalOutstandingInternal = toInternalUnits(totalOutstandingFace, poolRate);
  const availableInternal = availableForExchangeInternal(
    depositsInternal,
    reservesInternal,
    totalOutstandingInternal
  );

  const incomeGuess = await estimatePerTurnCurrencyIncomeHomeFace(
    db,
    character,
    rates,
    gameState ?? undefined
  );
  const incomeScore = incomeScoreFromPerTurnCurrency(incomeGuess);
  // Scored on the same net worth the turn prices service with, so the quoted
  // spread matches the one charged.
  const nwScore = netWorthScoreFromInternal(netOfLocInternal);

  const corp = await db
    .collection<Corporation>("corporations")
    .findOne(
      { ceoId: character._id, countryId: character.countryId },
      { projection: { creditCompositeSnapshot: 1 } }
    );

  const composite = computeLocBorrowerComposite({
    corpComposite: corp?.creditCompositeSnapshot ?? null,
    incomeScore,
    netWorthScore: nwScore,
    debtToAssetsRatio,
    homePrimePercent,
  });
  const spread = spreadPercentPointsFromComposite(composite);
  const currentTurn = await getCurrentTurn(db);
  const centralBankPricing = await loadCentralBankPricingAdjustment(db, currentTurn);
  const effectiveRatePercent =
    homePrimePercent + spread + centralBankPricing.spreadHikePercentPoints;

  const loc = character.lineOfCredit;
  const balances = loc?.balances ?? {};
  const arrears = loc?.arrears ?? {};
  const outstanding = sumObligationInternal(balances, arrears, rates);
  const scheduledDebtServiceInternal = computeAutoPaymentInternal(outstanding);

  const dtiLimitInternal = computePerPlayerDtiLimitInternal(incomeGuess, homeRate);
  // Equity cashout limits: shares in a company the borrower controls back the
  // equity cap only at a haircut. A lower cap blocks new draws; nothing here
  // forces repayment of what is already borrowed.
  const controlledEquity = equityCashoutLimitsOn(await loadEquityCashoutLimitsStage(db))
    ? await computeControlledEquityHaircutInternal(db, character, rates, currentTurn)
    : null;
  const collateralNote = controlledEquity
    ? controlledEquityCollateralNote(controlledEquity)
    : undefined;
  const netWorthLimitInternal = computePerPlayerNetWorthLimitInternal(
    controlledEquity ? Math.max(0, netInternal - controlledEquity.haircutInternal) : netInternal
  );
  // When the player has no income history (DTI cap = 0), equity alone backs the credit
  // limit. Once income accumulates over the 48-turn window, the stricter of the two caps
  // applies. This prevents equity-rich players from being completely locked out just
  // because their coupons/salary haven't appeared in the rolling average yet.
  const perPlayerLimitInternal =
    dtiLimitInternal > 0
      ? Math.min(dtiLimitInternal, netWorthLimitInternal)
      : netWorthLimitInternal;
  const rawPerPlayerAvail = Math.max(0, perPlayerLimitInternal - outstanding);
  const perPlayerAvailableInternal = Math.min(rawPerPlayerAvail, availableInternal);

  // Only surface a garnishment estimate when the borrower is currently subject
  // to it. Without this gate, historical ledger rows kept driving the banner
  // for paid-off loans (bug #0547).
  const recentGarnishments = loc?.drawFrozen
    ? await db
        .collection<LocLedgerEntry>("locLedger")
        .find({ characterId: character._id, type: "garnishment" }, { projection: { meta: 1 } })
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray()
    : [];

  const garnishedPerTurnInternal =
    recentGarnishments.length > 0
      ? recentGarnishments.reduce((sum, e) => sum + (e.meta?.garnishedInternal ?? 0), 0) /
        recentGarnishments.length
      : undefined;

  const paymentMode: Partial<Record<CurrencyCode, LocPaymentMode>> = {
    ...(loc?.paymentMode ?? {}),
  };
  const paymentModeChangedAtTurn: Partial<Record<CurrencyCode, number>> = {};
  for (const [c, entry] of Object.entries(loc?.paymentModeChangedAt ?? {}) as [
    CurrencyCode,
    { at: Date; turn: number } | undefined,
  ][]) {
    if (entry && typeof entry.turn === "number") {
      paymentModeChangedAtTurn[c] = entry.turn;
    }
  }

  return {
    enabled: true,
    composite,
    spreadPercentPoints: spread,
    grossAssetsInternal: grossInternal,
    locDebtInternal,
    netWorthInternal: netInternal,
    maxDebtInternal: systemCapInternal,
    poolCurrency: pool,
    availableBorrowFace: fromInternalUnits(availableInternal, poolRate),
    outstandingInternal: outstanding,
    availableBorrowInternal: availableInternal,
    balances,
    arrears,
    accountsOpened: loc?.accountsOpened ?? {},
    fundingSource: loc?.fundingSource ?? {},
    drawFrozen: loc?.drawFrozen ?? false,
    incomeScore,
    netWorthScore: nwScore,
    hasCeoCorp: corp != null,
    homePrimePercent,
    debtToAssetsRatio,
    effectiveRatePercent,
    policySpreadAdjustmentPercentPoints: centralBankPricing.spreadHikePercentPoints,
    policyDepositBonusPercentPoints: centralBankPricing.depositBonusPercentPoints,
    policyPricingProgress: centralBankPricing.progress,
    policyPricingTurnsRemaining: centralBankPricing.turnsRemaining,
    policyPricingActive: centralBankPricing.startedTurn !== undefined,
    incomePerTurnFace: incomeGuess,
    scheduledDebtServiceInternal,
    dtiLimitInternal,
    netWorthLimitInternal,
    ...(controlledEquity
      ? { controlledEquityHaircutInternal: controlledEquity.haircutInternal }
      : {}),
    ...(collateralNote ? { collateralNote } : {}),
    perPlayerLimitInternal,
    perPlayerAvailableInternal,
    garnishedPerTurnInternal,
    paymentMode,
    paymentModeChangedAtTurn,
    currentTurn,
  };
}
