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
  /** "observed": this turn's funded output fed the average. "carried": it was missing. */
  source: "observed" | "carried";
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

  const observed =
    typeof input.fundedOutputLocal === "number" && Number.isFinite(input.fundedOutputLocal)
      ? Math.max(0, input.fundedOutputLocal)
      : null;
  const bookGdpPerTurnLocal = finitePositive(input.bookGdpAnnualLocal)
    ? input.bookGdpAnnualLocal / TURNS_PER_YEAR
    : 0;

  // Nothing new to learn: keep the last value, stamped for this turn.
  if (observed === null || bookGdpPerTurnLocal <= 0) {
    if (!usable) return null;
    return {
      ...usable,
      turn: input.turn,
      capped: false,
      source: "carried",
      fundedOutputLocal: observed,
      history: appendHistory(usable.history, input.turn, usable.scale),
    };
  }

  const smoothed = usable
    ? usable.smoothedFundedOutputLocal +
      (observed - usable.smoothedFundedOutputLocal) / FISCAL_SCALE_SMOOTHING_TURNS
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
          state.source === "carried" ? "~" : ""
        }`
    );
  return `[fiscalScale] t${turn} stage=${stage} n=${states.length} ${parts.join(" ")}`;
}
