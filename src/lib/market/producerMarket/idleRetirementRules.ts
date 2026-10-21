/**
 * Retirement of capacity that persistently sells nothing, for the funded
 * producer market (gameConfig.producerIdleRetireStage >= 1).
 *
 * The legacy retirement rule writes to the legacy capacity stock, which the
 * funded capacity generation owns and overwrites, so on funded turns capacity
 * the market will not buy never leaves and keeps paying its standing bills.
 * This is the same rule on the funded stock: once a plant has sold nothing for
 * more than the grace period, it retires a fixed share of the capacity above
 * what its last sales justify, as extra physical depreciation applied to
 * owned units and their paid basis together. The write-off pays no cash, so no
 * money is created. Mothballed plants are the owner's explicit choice to hold
 * capacity and never retire. A probe share is always kept so a plant can see
 * demand return.
 *
 * Pure: last receipt and streak in, share of capacity to retire this turn out.
 */

/** Consecutive zero-sales turns a plant may run before any capacity retires. */
export const IDLE_RETIRE_GRACE_TURNS = 6;
/** Share of the unjustified capacity retired each turn. */
export const IDLE_RETIRE_RATE = 0.04;
/** Room above last sales that is kept. */
export const IDLE_RETIRE_HEADROOM = 0.2;
/** Share of active capacity always kept as a probe run. */
export const IDLE_RETIRE_PROBE_SHARE = 0.1;

export function idleRetireFraction(input: {
  mothballed: boolean;
  /** Consecutive settled turns with no sales, before this turn. */
  zeroSalesTurns: number | undefined;
  /** Units sold last turn. */
  soldUnits: number;
  /** Units the plant could run at last turn (capacity x active share). */
  activeUnits: number;
}): number {
  if (input.mothballed) return 0;
  const streak = input.zeroSalesTurns ?? 0;
  if (!(streak > IDLE_RETIRE_GRACE_TURNS)) return 0;
  if (!(input.activeUnits > 0)) return 0;
  const sold = Number.isFinite(input.soldUnits) ? Math.max(0, input.soldUnits) : 0;
  const justified = Math.min(
    1,
    Math.max(IDLE_RETIRE_PROBE_SHARE, (sold * (1 + IDLE_RETIRE_HEADROOM)) / input.activeUnits)
  );
  return IDLE_RETIRE_RATE * (1 - justified);
}
