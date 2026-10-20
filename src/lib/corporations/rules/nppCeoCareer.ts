/**
 * NPP CEO careers and pay demands.
 *
 * Pure rules: track records, personality numbers and economy inputs in,
 * levels and pay numbers out. No database, no clock, no randomness. Callers
 * load the NPP document, keep the salary on the corporation, and write the
 * decision back themselves.
 */

/** Highest CEO level a track record can reach. */
export const CEO_MAX_LEVEL = 10;

/** Turns between one pay review and the next. */
export const CEO_PAY_REVIEW_TURNS = 24;

/** Largest share of trailing profit a CEO contract may demand. */
export const CEO_PROFIT_SHARE_CAP = 0.1;

/** Extra overhead discount earned per CEO level above the first. */
export const CEO_OVERHEAD_DISCOUNT_PER_LEVEL = 0.1;

/** Hard ceiling, in margin points, on the CEO overhead discount. */
export const CEO_OVERHEAD_DISCOUNT_CAP_PP = 2;

/**
 * Clamp a value into a range. A non-finite value falls back to the lower
 * bound so callers never propagate NaN into a price or a level.
 */
function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, value));
}

/** Finite number or the supplied fallback. */
function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * CEO level from a single sector lane record, 1 to 10. Experience comes from
 * turns served (480 turns is a full ten experience points) and performance
 * from average margin against peers, worth up to five points either way. A
 * missing record, a record with no turns, or non-finite numbers give level 1.
 */
export function ceoLevel(record: { turns: number; relMarginPp: number } | undefined): number {
  if (!record) return 1;
  const turns = finiteOr(record.turns, 0);
  if (turns <= 0) return 1;
  const relMarginPp = finiteOr(record.relMarginPp, 0);
  const experience = Math.min(turns, 480) / 48;
  const performance = clamp(relMarginPp, -10, 10) / 2;
  return clamp(Math.round(1 + experience * 0.6 + performance * 0.8), 1, CEO_MAX_LEVEL);
}

/**
 * Margin points removed from a corporation's management overhead by its CEO.
 * The discount grows with level, is capped in margin points, and can never
 * remove more overhead than the corporation actually pays. Zero or bad
 * overhead returns zero.
 */
export function ceoOverheadDiscountPp(level: number, overheadPp: number): number {
  if (!Number.isFinite(overheadPp) || overheadPp <= 0) return 0;
  const safeLevel = clamp(level, 1, CEO_MAX_LEVEL);
  const fraction = Math.min(1, (safeLevel - 1) * CEO_OVERHEAD_DISCOUNT_PER_LEVEL);
  const discount = overheadPp * fraction;
  return Math.min(discount, CEO_OVERHEAD_DISCOUNT_CAP_PP, overheadPp);
}

/**
 * Base annual salary for a CEO level, in whole currency units of the era's
 * salary scale. A level one CEO costs half a salary unit and each further
 * level adds a quarter. A non-finite or non-positive salary unit gives zero.
 */
export function ceoBaseSalary(level: number, eraSalaryUnit: number): number {
  if (!Number.isFinite(eraSalaryUnit) || eraSalaryUnit <= 0) return 0;
  const safeLevel = clamp(level, 1, CEO_MAX_LEVEL);
  return eraSalaryUnit * (0.5 + 0.25 * (safeLevel - 1));
}

/** Inputs for one CEO pay review. */
export interface PayDemandInput {
  /** CEO level, 1 to 10. */
  level: number;
  /** Profit over the trailing window. A loss or zero means no profit share. */
  trailingProfit: number;
  /** Plants the corporation runs, used as a size proxy. */
  plantCount: number;
  /** Trailing profit growth as a fraction, so 0.1 means ten percent. */
  growthRate: number;
  /** CEO ambition, 0 to 100. */
  ambition: number;
  /** CEO loyalty, 0 to 100. */
  loyalty: number;
  /** Salary unit for the era. */
  eraSalaryUnit: number;
  /** Salary the CEO is paid today. */
  currentSalary: number;
}

/**
 * The salary a CEO demands at a pay review. The ask is the base salary for the
 * level plus a share of trailing profit, never less than the current salary,
 * and never more than the base plus the profit share cap. Losses produce no
 * profit share, so the ask cannot rise above the base salary. The result is a
 * whole number and never negative.
 */
export function ceoPayDemand(input: PayDemandInput): number {
  const level = clamp(input.level, 1, CEO_MAX_LEVEL);
  const trailingProfit = finiteOr(input.trailingProfit, 0);
  const currentSalary = Math.max(0, finiteOr(input.currentSalary, 0));
  const base = ceoBaseSalary(level, input.eraSalaryUnit);
  const ceiling = base + CEO_PROFIT_SHARE_CAP * Math.max(0, trailingProfit);
  if (trailingProfit <= 0) {
    return Math.min(Math.round(Math.max(currentSalary, base)), Math.floor(ceiling));
  }
  const plantCount = Math.max(1, finiteOr(input.plantCount, 1));
  const sizeFactor = clamp(Math.log2(plantCount / 300 + 1), 0.25, 2);
  const growthFactor = clamp(1 + finiteOr(input.growthRate, 0), 0.75, 1.5);
  const ambition = finiteOr(input.ambition, 50);
  const loyalty = finiteOr(input.loyalty, 50);
  const temperament = clamp(1 + (ambition - 50) / 100 - (loyalty - 50) / 200, 0.5, 1.5);
  const levelFactor = level / CEO_MAX_LEVEL;
  const share = Math.min(
    CEO_PROFIT_SHARE_CAP,
    0.04 * levelFactor * sizeFactor * growthFactor * temperament
  );
  const raw = Math.max(currentSalary, base + share * trailingProfit);
  const clamped = Math.min(raw, ceiling);
  return Math.min(Math.round(clamped), Math.floor(ceiling));
}

/**
 * Whether a CEO accepts a counter offer. The threshold is a fraction of the
 * demand that rises with stubbornness, so a stubborn CEO holds out for more.
 * A counter at or above the threshold is accepted.
 */
export function counterAccepted(demand: number, counter: number, stubbornness: number): boolean {
  if (!Number.isFinite(demand) || !Number.isFinite(counter)) return false;
  const factor = clamp(0.75 + finiteOr(stubbornness, 0) / 400, 0.75, 1);
  const threshold = demand * factor;
  return counter >= threshold;
}

/** What the corporation does with a pay demand when nobody intervenes. */
export type DefaultPayAction = "accept" | "replace";

/**
 * The standing decision on a pay demand. A demand that costs no more than the
 * configured fraction of trailing profit is accepted automatically, as is a
 * demand of zero. Anything else replaces the CEO.
 */
export function defaultPayAction(
  demand: number,
  trailingProfit: number,
  autoAcceptProfitShare: number
): DefaultPayAction {
  if (!Number.isFinite(demand)) return "replace";
  if (demand <= 0) return "accept";
  const profit = finiteOr(trailingProfit, 0);
  if (profit <= 0) return "replace";
  const share = Math.max(0, finiteOr(autoAcceptProfitShare, 0));
  return demand <= share * profit ? "accept" : "replace";
}

/**
 * The next pay review turn. Reviews fall every twenty four turns from the
 * appointment turn. The result is the first review turn after the current
 * turn and at or after the earliest allowed turn. Bad inputs are read as zero.
 */
export function nextPayReviewTurn(
  appointedTurn: number,
  currentTurn: number,
  earliestTurn: number
): number {
  const appointed = finiteOr(appointedTurn, 0);
  const current = finiteOr(currentTurn, 0);
  const earliest = finiteOr(earliestTurn, 0);
  const start = appointed + CEO_PAY_REVIEW_TURNS;
  let reviewsAhead = Math.floor((current - start) / CEO_PAY_REVIEW_TURNS) + 1;
  reviewsAhead = Math.max(reviewsAhead, Math.ceil((earliest - start) / CEO_PAY_REVIEW_TURNS));
  reviewsAhead = Math.max(0, reviewsAhead);
  return start + CEO_PAY_REVIEW_TURNS * reviewsAhead;
}

/** Turns a pay demand stays open before the standing policy decides it. */
export const CEO_PAY_DEMAND_OPEN_TURNS = 12;

/**
 * A CEO salary unit is this share of the company's trailing daily revenue, so
 * base pay scales with the size of the business in its own currency.
 */
export const CEO_SALARY_UNIT_REVENUE_SHARE = 0.005;

/** Standing policy when the owner sets none: accept a raise up to 3% of profit. */
export const DEFAULT_CEO_PAY_AUTO_ACCEPT_SHARE = 0.03;

/** Salary unit for a company from its trailing daily revenue. */
export function ceoSalaryUnit(trailingDailyRevenue: number): number {
  return Number.isFinite(trailingDailyRevenue) && trailingDailyRevenue > 0
    ? trailingDailyRevenue * CEO_SALARY_UNIT_REVENUE_SHARE
    : 0;
}

/** Owner responses to an open pay demand. */
export type CeoPayResponse =
  { action: "accept" } | { action: "counter"; amount: number } | { action: "replace" };

/** Outcome of a response: the salary to set, or a replacement. */
export type CeoPayOutcome =
  | { kind: "salary"; salary: number; accepted: "demand" | "counter" }
  | { kind: "replace"; reason: "owner" | "refusedCounter" };

/**
 * Resolve an owner response to an open demand. A refused counter means the
 * CEO walks out and the company appoints a new one.
 */
export function resolveCeoPayResponse(
  demand: number,
  response: CeoPayResponse,
  stubbornness: number
): CeoPayOutcome {
  if (response.action === "accept") {
    return { kind: "salary", salary: Math.max(0, Math.round(demand)), accepted: "demand" };
  }
  if (response.action === "replace") return { kind: "replace", reason: "owner" };
  const counter = Math.max(0, Math.round(finiteOr(response.amount, 0)));
  return counterAccepted(demand, counter, stubbornness)
    ? { kind: "salary", salary: counter, accepted: "counter" }
    : { kind: "replace", reason: "refusedCounter" };
}
