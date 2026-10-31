/**
 * Dynamic fiscal scale: the bridge between a country's realistic government
 * books (GDP, revenue, spending, debt, coupons as players see them) and the
 * funded money economy, which restarted small.
 *
 * The scale is real funded output per turn, smoothed, divided by book GDP per
 * turn. Staged behind `gameConfig.fiscalScaleStage` (0 = none):
 *
 * 1. Measure: compute and store the scale every turn. No money moves.
 * 2. Tax and spend: book revenue and book primary spending per turn, times the
 *    scale, move as real money between funded payers, the treasury and the
 *    public buyers.
 * 3. Debt service split: synthetic bond holders settle at book times the scale,
 *    player holders at full face, first.
 *
 * Plain data in, plain data out. The turn shell loads the inputs and writes
 * the result.
 */
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";

export const FISCAL_SCALE_STAGE = {
  MEASURE: 1,
  TAX_AND_SPEND: 2,
  DEBT_SERVICE_SPLIT: 3,
} as const;

export const FISCAL_SCALE_STAGE_MAX = FISCAL_SCALE_STAGE.DEBT_SERVICE_SPLIT;

/** Normalise a raw config value to an integer stage in [0, MAX]. */
export function normalizeFiscalScaleStage(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(FISCAL_SCALE_STAGE_MAX, Math.trunc(raw)));
}

export function fiscalScaleStageActive(stage: unknown, atLeast: number): boolean {
  return normalizeFiscalScaleStage(stage) >= atLeast;
}

/** Turns of smoothing on funded output: an exponential average with weight 1/N. */
export const FISCAL_SCALE_SMOOTHING_TURNS = 12;
/** Largest relative move of the scale in one turn, up or down. */
export const FISCAL_SCALE_MAX_MOVE = 0.1;
/** The scale never exceeds the books: funded money is at most book scale. */
export const FISCAL_SCALE_CEILING = 1;
/** Turns of scale history kept on the budget. */
export const FISCAL_SCALE_HISTORY_TURNS = 48;
/** A stored state older than this restarts the smoothing (a reset world). */
export const FISCAL_SCALE_STALE_TURNS = 48;

export interface FiscalScaleHistoryEntry {
  turn: number;
  scale: number;
}

export interface FiscalScaleState {
  turn: number;
  /** Real money per unit of book money for this country. */
  scale: number;
  /** Uncapped smoothed output over book GDP per turn. */
  rawScale: number;
  /** True when the move cap held the scale back this turn. */
  capped: boolean;
  /**
   * "observed": this turn's funded output fed the average. "carried": it was
   * missing, so the last value holds. "median": the country has never had
   * funded output, so it borrows the median scale of the countries that do.
   */
  source: "observed" | "carried" | "median";
  /** Funded value added this turn in local currency; null when none was settled. */
  fundedOutputLocal: number | null;
  smoothedFundedOutputLocal: number;
  bookGdpPerTurnLocal: number;
  history: FiscalScaleHistoryEntry[];
}

export interface FiscalScaleInput {
  turn: number;
  /** This turn's funded value added in local currency, or null when none settled. */
  fundedOutputLocal: number | null;
  /** Book GDP, annual, local currency. */
  bookGdpAnnualLocal: number;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function capMove(prior: number, target: number): { scale: number; capped: boolean } {
  if (!(prior > 0)) return { scale: target, capped: false };
  const hi = prior * (1 + FISCAL_SCALE_MAX_MOVE);
  const lo = prior / (1 + FISCAL_SCALE_MAX_MOVE);
  if (target > hi) return { scale: hi, capped: true };
  if (target < lo) return { scale: lo, capped: true };
  return { scale: target, capped: false };
}

/**
 * The next stored scale for one country. Returns the prior state unchanged when
 * it already covers this turn, and null when there has never been anything to
 * measure (no funded output and no book GDP).
 */
export function nextFiscalScale(
  prior: FiscalScaleState | null | undefined,
  input: FiscalScaleInput
): FiscalScaleState | null {
  const usable =
    prior &&
    Number.isFinite(prior.turn) &&
    prior.turn <= input.turn &&
    input.turn - prior.turn <= FISCAL_SCALE_STALE_TURNS &&
    Number.isFinite(prior.scale) &&
    Number.isFinite(prior.smoothedFundedOutputLocal)
      ? prior
      : null;
  if (usable && usable.turn === input.turn) return usable;
  // A borrowed median carries no funded history to smooth from.
  const smoothingBase = usable && usable.source !== "median" ? usable : null;

  const observed =
    typeof input.fundedOutputLocal === "number" && Number.isFinite(input.fundedOutputLocal)
      ? Math.max(0, input.fundedOutputLocal)
      : null;
  const bookGdpPerTurnLocal = finitePositive(input.bookGdpAnnualLocal)
    ? input.bookGdpAnnualLocal / TURNS_PER_YEAR
    : 0;

  // Nothing new to learn: keep the last value, stamped for this turn. A
  // country that only ever borrowed the median gets it again from the caller.
  if (observed === null || bookGdpPerTurnLocal <= 0) {
    if (!smoothingBase) return null;
    return {
      ...smoothingBase,
      turn: input.turn,
      capped: false,
      source: "carried",
      fundedOutputLocal: observed,
      history: appendHistory(smoothingBase.history, input.turn, smoothingBase.scale),
    };
  }

  const smoothed = smoothingBase
    ? smoothingBase.smoothedFundedOutputLocal +
      (observed - smoothingBase.smoothedFundedOutputLocal) / FISCAL_SCALE_SMOOTHING_TURNS
    : observed;
  const rawScale = Math.min(FISCAL_SCALE_CEILING, Math.max(0, smoothed / bookGdpPerTurnLocal));
  const { scale, capped } = usable
    ? capMove(usable.scale, rawScale)
    : { scale: rawScale, capped: false };
  return {
    turn: input.turn,
    scale,
    rawScale,
    capped,
    source: "observed",
    fundedOutputLocal: observed,
    smoothedFundedOutputLocal: smoothed,
    bookGdpPerTurnLocal,
    history: appendHistory(usable?.history, input.turn, scale),
  };
}

/**
 * Median of the scales measured from a country's own funded output this turn
 * (observed or carried, never a borrowed median). Null when there are none.
 */
export function medianFiscalScale(states: Iterable<FiscalScaleState>): number | null {
  const scales = [...states]
    .filter((state) => state.source !== "median" && finitePositive(state.scale))
    .map((state) => state.scale)
    .sort((a, b) => a - b);
  if (scales.length === 0) return null;
  const mid = Math.floor(scales.length / 2);
  return scales.length % 2 === 1 ? scales[mid] : (scales[mid - 1] + scales[mid]) / 2;
}

/**
 * The stored state of a country with no funded output of its own: it borrows
 * the world median scale for debt service and placement. It has no funded
 * payers, so the tax stage collects nothing from it. Once the country settles
 * funded output, `nextFiscalScale` starts its own average and the move cap
 * walks the scale away from the median.
 */
export function medianFallbackFiscalScale(
  prior: FiscalScaleState | null | undefined,
  input: { turn: number; median: number; bookGdpAnnualLocal: number }
): FiscalScaleState | null {
  if (!finitePositive(input.median)) return null;
  if (prior && prior.turn === input.turn) return prior;
  const scale = Math.min(FISCAL_SCALE_CEILING, input.median);
  return {
    turn: input.turn,
    scale,
    rawScale: scale,
    capped: false,
    source: "median",
    fundedOutputLocal: null,
    smoothedFundedOutputLocal: 0,
    bookGdpPerTurnLocal: finitePositive(input.bookGdpAnnualLocal)
      ? input.bookGdpAnnualLocal / TURNS_PER_YEAR
      : 0,
    history: appendHistory(
      prior && prior.turn < input.turn ? prior.history : undefined,
      input.turn,
      scale
    ),
  };
}

function appendHistory(
  history: readonly FiscalScaleHistoryEntry[] | undefined,
  turn: number,
  scale: number
): FiscalScaleHistoryEntry[] {
  const kept = (history ?? []).filter((entry) => entry.turn < turn);
  kept.push({ turn, scale });
  return kept.slice(-FISCAL_SCALE_HISTORY_TURNS);
}

/** Funded value added from one sector's settlement, in anchor currency, never negative. */
export function settlementValueAddedAnchor(settlement: {
  revenue?: number;
  inputsConsumed?: number;
}): number {
  const va = (settlement.revenue ?? 0) - (settlement.inputsConsumed ?? 0);
  return Number.isFinite(va) ? Math.max(0, va) : 0;
}

/** Book money scaled to real money for one country; zero without a usable scale. */
export function scaledAmount(bookAmount: number, scale: number | null | undefined): number {
  if (!Number.isFinite(bookAmount) || bookAmount <= 0) return 0;
  if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) return 0;
  return bookAmount * Math.min(FISCAL_SCALE_CEILING, scale);
}

/** One-line digest of a turn's scales for the turn log. */
export function fiscalScaleLogLine(
  turn: number,
  stage: number,
  states: ReadonlyArray<{ countryId: string; state: FiscalScaleState }>
): string {
  const parts = [...states]
    .sort((a, b) => a.countryId.localeCompare(b.countryId))
    .map(
      ({ countryId, state }) =>
        `${countryId}=${state.scale.toExponential(2)}${state.capped ? "^" : ""}${
          state.source === "carried" ? "~" : state.source === "median" ? "*" : ""
        }`
    );
  return `[fiscalScale] t${turn} stage=${stage} n=${states.length} ${parts.join(" ")}`;
}

// Stage 3: debt service split.

/** Holders paid in the same real money players hold: always at full face. */
const PLAYER_COUPON_HOLDER_KINDS: ReadonlySet<string> = new Set([
  "character",
  "imperial",
  "corporation",
]);

interface ScalableCouponHolder {
  kind: string;
  amountLocal: number;
  amountAnchor: number;
}

interface ScalableCouponClaim<H extends ScalableCouponHolder> {
  amountLocal: number;
  dueTurn: number;
  holders: H[];
}

export function couponClaimHasPlayerHolder(claim: {
  holders: ReadonlyArray<{ kind: string }>;
}): boolean {
  return claim.holders.some((holder) => PLAYER_COUPON_HOLDER_KINDS.has(holder.kind));
}

function usableScale(scale: number | null | undefined): scale is number {
  return typeof scale === "number" && Number.isFinite(scale) && scale > 0;
}

/**
 * A coupon or principal claim as it settles under the debt service split:
 * synthetic holders (bond pool float, index funds, NPPs) at book times the
 * scale, player holders at full face. Without a usable scale the claim settles
 * at book, as it does today.
 */
export function claimAtFiscalScale<
  H extends ScalableCouponHolder,
  C extends ScalableCouponClaim<H>,
>(claim: C, scale: number | null | undefined): C {
  if (!usableScale(scale)) return claim;
  const s = Math.min(FISCAL_SCALE_CEILING, scale);
  if (s >= FISCAL_SCALE_CEILING) return claim;
  const holders = claim.holders.map((holder) =>
    PLAYER_COUPON_HOLDER_KINDS.has(holder.kind)
      ? holder
      : { ...holder, amountLocal: holder.amountLocal * s, amountAnchor: holder.amountAnchor * s }
  );
  return {
    ...claim,
    holders,
    amountLocal: holders.reduce((sum, holder) => sum + holder.amountLocal, 0),
  };
}

/** Settlement order under the split: claims owed to players first, then oldest first. */
export function fiscalScaleCouponOrder<C extends ScalableCouponClaim<ScalableCouponHolder>>(
  claims: readonly C[]
): C[] {
  return [...claims].sort(
    (a, b) =>
      Number(couponClaimHasPlayerHolder(b)) - Number(couponClaimHasPlayerHolder(a)) ||
      a.dueTurn - b.dueTurn
  );
}

/**
 * Book amount bound for loading claims a Treasury holding `cashLocal` could
 * settle under the split. Scaled claims cost at most book, so the bound is a
 * superset; the payout loop and the guarded debit stay the authority.
 */
export function fiscalScaleClaimLoadBound(
  cashLocal: number,
  scale: number | null | undefined
): number {
  if (!Number.isFinite(cashLocal) || cashLocal <= 0) return 0;
  if (!usableScale(scale)) return cashLocal;
  return cashLocal / Math.min(FISCAL_SCALE_CEILING, scale);
}

/**
 * Oldest open claims one budget loads per turn under the split, on top of every
 * claim owed to a player and every claim a receipt already owns. The scaled
 * bound reaches far past the cash a starved Treasury holds, which pulled its
 * whole backlog into the phase every turn; this keeps the load near what the
 * phase reads with the split off, and the backlog drains oldest first. It
 * matches the claims one grouped coupon receipt can hold. A rehearsal at 500
 * pinned every paying budget at the cap and only kept pace with new claims.
 */
export const FISCAL_SCALE_CLAIM_LOAD_LIMIT = 2000;

/** Holder kinds paid at full face under the split, for a server-side filter. */
export const FISCAL_SCALE_PLAYER_HOLDER_KINDS: readonly string[] = [...PLAYER_COUPON_HOLDER_KINDS];

// Stage 2: tax and spend in real money.

/**
 * Largest share of a country's household cash the Treasury collects in one
 * turn. Book revenue times the scale is the target; this keeps one turn of tax
 * from emptying the wallets that buy the economy's output. A rehearsal at 0.2
 * bound most countries and cut household cash by 15 to 45% a turn.
 */
export const FISCAL_TAX_MAX_HOUSEHOLD_SHARE = 0.05;

/** Book revenue a turn, less the corporate tax the corporate phase already collects in real money. */
export function bookNonCorporateRevenuePerTurn(
  revenue:
    | {
        total?: number;
        domesticCorporateTax?: number;
        foreignCorporateTax?: number;
      }
    | null
    | undefined
): number {
  const total = revenue?.total ?? 0;
  const corporate = (revenue?.domesticCorporateTax ?? 0) + (revenue?.foreignCorporateTax ?? 0);
  const annual = total - Math.max(0, Number.isFinite(corporate) ? corporate : 0);
  return Number.isFinite(annual) && annual > 0 ? annual / TURNS_PER_YEAR : 0;
}

/** Book primary spending a turn: total spending less debt interest. */
export function bookPrimarySpendingPerTurn(
  spending:
    | {
        total?: number;
        debtInterest?: number;
      }
    | null
    | undefined
): number {
  const annual = (spending?.total ?? 0) - (spending?.debtInterest ?? 0);
  return Number.isFinite(annual) && annual > 0 ? annual / TURNS_PER_YEAR : 0;
}

export interface FiscalTaxPayer {
  id: string;
  cash: number;
}

/**
 * Real tax due this turn from a country's household wallets, shared by cash
 * held. Book non-corporate revenue times the scale, capped at
 * FISCAL_TAX_MAX_HOUSEHOLD_SHARE of the cash they hold. Each wallet pays at
 * most its own cash. Without a usable scale nothing is due.
 */
export function fiscalTaxCollection(input: {
  bookRevenuePerTurn: number;
  scale: number | null | undefined;
  payers: readonly FiscalTaxPayer[];
}): { dueLocal: number; collectedLocal: number; byPayer: { id: string; amount: number }[] } {
  const dueLocal = scaledAmount(input.bookRevenuePerTurn, input.scale);
  const payers = [...input.payers]
    .filter((p) => Number.isFinite(p.cash) && p.cash > 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const held = payers.reduce((sum, p) => sum + p.cash, 0);
  const collect = Math.min(dueLocal, held * FISCAL_TAX_MAX_HOUSEHOLD_SHARE);
  if (!(collect > 0) || !(held > 0)) return { dueLocal, collectedLocal: 0, byPayer: [] };
  const byPayer = payers
    .map((p) => ({ id: p.id, amount: Math.min(p.cash, (collect * p.cash) / held) }))
    .filter((row) => row.amount > 0);
  return {
    dueLocal,
    collectedLocal: byPayer.reduce((sum, row) => sum + row.amount, 0),
    byPayer,
  };
}

/**
 * Public purchases the Treasury pays for this turn: the funding the public
 * buyer's purchase lines ask for, at most book primary spending times the
 * scale, and at most the cash the Treasury holds.
 */
export function treasuryPublicFunding(input: {
  requestedLocal: number;
  bookPrimarySpendingPerTurn: number;
  scale: number | null | undefined;
  treasuryCashLocal: number;
}): number {
  const requested = Number.isFinite(input.requestedLocal) ? Math.max(0, input.requestedLocal) : 0;
  const cash = Number.isFinite(input.treasuryCashLocal) ? Math.max(0, input.treasuryCashLocal) : 0;
  return Math.min(requested, scaledAmount(input.bookPrimarySpendingPerTurn, input.scale), cash);
}
