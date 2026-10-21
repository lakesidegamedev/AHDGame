/**
 * Approval cost of a Market Adjustment event (owner decision 2026-10-21).
 *
 * Approval already averages dozens of metrics, each capped at +/-2, so a big
 * unemployment spike barely moves it. This is an explicit, visible driver on
 * top, shaped like the bank failure chip: it is computed from what the economy
 * actually did and nothing else. There is deliberately no credit for pressing a
 * response button; a response helps only by moving the measured losses and
 * unemployment.
 *
 * Pure: plain numbers in, plain numbers out.
 */

/** Loss share above which the loss term starts. Same line the event triggers on. */
export const LOSS_TERM_START = 0.4;
/** Approval points per 1.0 of loss share above the start. */
export const LOSS_TERM_PER_UNIT = 4;
/** Approval points per percentage point of unemployment above its level at the event's start. */
export const UNEMPLOYMENT_TERM_PER_PP = 0.5;
/** Each term is capped here. */
export const TERM_CAP = 2;
/** The whole chip is capped here, per country. */
export const COUNTRY_CAP = 4;
/** Turns the chip fades out over after the event closes. */
export const FADE_TURNS = 12;

const finite = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n);

/** Approval cost of the loss share alone, as a negative number. */
export function lossTerm(lossShare: number | null | undefined): number {
  if (!finite(lossShare)) return 0;
  return -Math.min(TERM_CAP, LOSS_TERM_PER_UNIT * Math.max(0, lossShare - LOSS_TERM_START));
}

/** Approval cost of the unemployment rise alone, as a negative number. */
export function unemploymentTerm(riseInPp: number | null | undefined): number {
  if (!finite(riseInPp)) return 0;
  return -Math.min(TERM_CAP, UNEMPLOYMENT_TERM_PER_PP * Math.max(0, riseInPp));
}

/** Share of the effect still in force `turnsSinceClose` turns after the event ended. */
export function fadeFactor(turnsSinceClose: number): number {
  if (!finite(turnsSinceClose) || turnsSinceClose < 0) return 1;
  return Math.max(0, 1 - turnsSinceClose / FADE_TURNS);
}

export interface MarketAdjustmentApproval {
  /** Negative or zero, rounded to a tenth. */
  approval: number;
  loss: number;
  unemployment: number;
}

/**
 * The chip's value. `turnsSinceClose` is null while the event is open;
 * `unemploymentEnabled` keeps the unemployment term at zero until unemployment
 * is known to follow funded output.
 */
export function marketAdjustmentApproval(args: {
  lossShare: number | null | undefined;
  unemploymentRise: number | null | undefined;
  unemploymentEnabled: boolean;
  turnsSinceClose: number | null;
}): MarketAdjustmentApproval {
  const loss = lossTerm(args.lossShare);
  const unemployment = args.unemploymentEnabled ? unemploymentTerm(args.unemploymentRise) : 0;
  const fade = args.turnsSinceClose == null ? 1 : fadeFactor(args.turnsSinceClose);
  const total = Math.max(-COUNTRY_CAP, loss + unemployment) * fade;
  return {
    approval: Math.round(total * 10) / 10 + 0,
    loss,
    unemployment,
  };
}
