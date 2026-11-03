/**
 * Equity cashout limits (gameConfig.equityCashoutLimitsStage).
 *
 * A share price can sit well above what the company actually owns or earns.
 * Two paths turned that paper value into cash: selling new shares to the
 * system equity pool at the quote, and borrowing against your own company's
 * shares on a personal line of credit. These rules bound both.
 *
 * Plain data in, plain data out. Money is in one currency per call; the shell
 * converts before calling.
 */

/** Stage at which both limits apply. 0 or absent = off. */
export const EQUITY_CASHOUT_LIMITS_STAGE = 1;

/** The pool pays at most this multiple of trailing realized annual earnings per share. */
export const PRIMARY_EARNINGS_MULTIPLE = 15;
/** Rolling window, in turns, for one company's cumulative placements to the pool. */
export const PRIMARY_PLACEMENT_WINDOW_TURNS = 48;
/** Placements in the window may total at most this multiple of the company's equity. */
export const PRIMARY_PLACEMENT_WINDOW_EQUITY_MULTIPLE = 1;

/** A holder above this share of a company's shares controls it for credit purposes. */
export const CONTROL_STAKE_FRACTION = 0.2;
/** Controlled shares count at no more than this share of the quote. */
export const CONTROLLED_SHARE_QUOTE_FRACTION = 0.5;
/** Controlled shares bought this recently, while borrowing, count at zero. */
export const LEVERED_PURCHASE_LOOKBACK_TURNS = 24;

function finite(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export interface TangibleBookInput {
  cash: number;
  /** Paid capacity basis x BOOK_DEPRECIATION_FACTOR. */
  paidCapacity: number;
  constructionInProgress: number;
  /** Bond debt + construction loans + operating and tax arrears. */
  debt: number;
}

/** Cash + paid capacity + construction in progress - debt. May be negative. */
export function tangibleBook(input: TangibleBookInput): number {
  return (
    finite(input.cash) +
    Math.max(0, finite(input.paidCapacity)) +
    Math.max(0, finite(input.constructionInProgress)) -
    Math.max(0, finite(input.debt))
  );
}

/** Mean of the earnings history (annualized), floored at 0. */
export function trailingAnnualEarnings(history: readonly number[] | null | undefined): number {
  const rows = (history ?? []).filter((v) => Number.isFinite(v));
  if (rows.length === 0) return 0;
  return Math.max(0, rows.reduce((sum, v) => sum + v, 0) / rows.length);
}

export interface PrimaryPriceCapInput {
  /** Last computed fundamental price; absent on a company that has not run a turn. */
  fundamentalPrice?: number | null;
  bookPerShare: number;
  annualEarningsPerShare: number;
}

/**
 * Highest price per share the pool pays for new shares:
 * min(fundamental, max(book per share, 15 x trailing earnings per share)), never below 0.
 */
export function primaryPlacementPriceCap(input: PrimaryPriceCapInput): number {
  const backing = Math.max(
    0,
    finite(input.bookPerShare),
    PRIMARY_EARNINGS_MULTIPLE * Math.max(0, finite(input.annualEarningsPerShare))
  );
  const fundamental = input.fundamentalPrice;
  if (typeof fundamental !== "number" || !Number.isFinite(fundamental)) return backing;
  return Math.max(0, Math.min(fundamental, backing));
}

export interface PrimaryPlacementEntry {
  turn: number;
  paidLocal: number;
}

/** Entries still inside the rolling window ending at `turn`. */
export function placementsInWindow(
  entries: readonly PrimaryPlacementEntry[] | null | undefined,
  turn: number
): PrimaryPlacementEntry[] {
  const start = turn - PRIMARY_PLACEMENT_WINDOW_TURNS;
  return (entries ?? []).filter((e) => Number.isFinite(e.turn) && e.turn > start);
}

/** Sum paid by the pool inside the window. */
export function placedInWindow(
  entries: readonly PrimaryPlacementEntry[] | null | undefined,
  turn: number
): number {
  return placementsInWindow(entries, turn).reduce(
    (sum, e) => sum + Math.max(0, finite(e.paidLocal)),
    0
  );
}

/**
 * Cash the pool may still pay this company inside the window.
 *
 * Paid-in capital plus retained earnings is the company's book equity (assets
 * minus liabilities), so the measure is tangible book. Placements already in
 * the window raised that book, so they are taken back out to find the equity
 * the window started from; otherwise each placement would raise its own limit.
 */
export function primaryWindowBudget(input: { bookEquity: number; placedInWindow: number }): number {
  const placed = Math.max(0, finite(input.placedInWindow));
  const startingEquity = Math.max(0, finite(input.bookEquity) - placed);
  return Math.max(0, PRIMARY_PLACEMENT_WINDOW_EQUITY_MULTIPLE * startingEquity - placed);
}

export interface PrimaryPlacementLimits {
  askingPrice: number;
  capPrice: number;
  /** Price the pool pays: min(asking, cap). */
  price: number;
  priceCapped: boolean;
  windowBudget: number;
  /** Most whole shares the window budget buys at `price`. */
  maxShares: number;
}

export function resolvePrimaryPlacementLimits(input: {
  askingPrice: number;
  capPrice: number;
  windowBudget: number;
}): PrimaryPlacementLimits {
  const asking = Math.max(0, finite(input.askingPrice));
  const cap = Math.max(0, finite(input.capPrice));
  const price = Math.min(asking, cap);
  const windowBudget = Math.max(0, finite(input.windowBudget));
  return {
    askingPrice: asking,
    capPrice: cap,
    price,
    priceCapped: price < asking,
    windowBudget,
    maxShares: price > 0 ? Math.floor(windowBudget / price) : 0,
  };
}

/** CEO, or holds more than CONTROL_STAKE_FRACTION of the shares. */
export function isControllingHolder(input: {
  isCeo: boolean;
  shares: number;
  totalShares: number;
}): boolean {
  if (input.isCeo) return true;
  const total = finite(input.totalShares);
  return total > 0 && finite(input.shares) / total > CONTROL_STAKE_FRACTION;
}

/**
 * Credit value of a controlled holding: each share at the lower of book per
 * share and half the quote, and shares bought recently with borrowed money at 0.
 */
export function controlledHoldingCollateral(input: {
  shares: number;
  quote: number;
  bookPerShare: number;
  /** Shares bought in the lookback while the borrower was drawing credit. */
  leveredShares: number;
}): number {
  const shares = Math.max(0, finite(input.shares));
  const counted = Math.max(0, shares - Math.max(0, finite(input.leveredShares)));
  const perShare = Math.max(
    0,
    Math.min(finite(input.bookPerShare), CONTROLLED_SHARE_QUOTE_FRACTION * finite(input.quote))
  );
  return counted * perShare;
}
