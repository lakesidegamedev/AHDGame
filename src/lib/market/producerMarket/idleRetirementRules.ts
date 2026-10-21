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
 * money is created. Capacity that has sat mothballed past the same grace
 * retires too, because holding it costs nothing and parking must not become
 * free hoarding. A probe share is always kept so a plant can see demand return.
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
  const streak = input.zeroSalesTurns ?? 0;
  if (!(streak > IDLE_RETIRE_GRACE_TURNS)) return 0;
  // A mothballed plant runs nothing and sells nothing: only the probe share is kept.
  if (input.mothballed) return IDLE_RETIRE_RATE * (1 - IDLE_RETIRE_PROBE_SHARE);
  if (!(input.activeUnits > 0)) return 0;
  const sold = Number.isFinite(input.soldUnits) ? Math.max(0, input.soldUnits) : 0;
  const justified = Math.min(
    1,
    Math.max(IDLE_RETIRE_PROBE_SHARE, (sold * (1 + IDLE_RETIRE_HEADROOM)) / input.activeUnits)
  );
  return IDLE_RETIRE_RATE * (1 - justified);
}

/** Share of the retired book value paid back as a decommissioning grant when the knob is unset. */
export const DECOMMISSION_GRANT_DEFAULT_SHARE = 0.5;
/** Share of a fully claimed pool held back so float error never overdraws it. */
const POOL_FLOAT_MARGIN = 1e-9;

/** Whether retirement runs this turn: the stage is on and the transition window has closed. */
export function idleRetireActive(
  stage: number | undefined,
  turn: number,
  firstFundedTurn: number | undefined,
  inWindow: (turn: number, first: number) => boolean
): boolean {
  return (stage ?? 0) >= 1 && firstFundedTurn != null && !inWindow(turn, firstFundedTurn);
}

/** Retirement share for one sector from its prior settled receipt; 0 without one. */
export function idleRetireSectorShare(
  sector: {
    mothballed?: boolean;
    producerZeroSalesTurns?: number;
    producerSettlement?: { turn: number; soldUnits: number; activeUnits: number } | null;
  },
  currentTurn: number
): number {
  const receipt = sector.producerSettlement;
  if (!receipt || receipt.turn !== currentTurn - 1) return 0;
  return idleRetireFraction({
    mothballed: sector.mothballed === true,
    zeroSalesTurns: sector.producerZeroSalesTurns,
    soldUnits: receipt.soldUnits,
    activeUnits: receipt.activeUnits,
  });
}

export interface DecommissionClaim {
  sectorId: string;
  countryId: string;
  /** Grant owed before the pool limit, in anchor units. */
  claim: number;
}

/**
 * Decommissioning grant: a share of the book value retired this turn, paid to
 * the owner only from the country's unspent public funding. Claims in a
 * country are scaled by the same factor when the pool cannot cover them, so
 * nothing is minted and nothing is paid from an empty pool.
 *
 * Pure: claims and each country's remaining pool in, payments out.
 */
export function decommissionGrant(input: {
  claims: readonly DecommissionClaim[];
  poolByCountry: ReadonlyMap<string, number>;
}): { payments: DecommissionClaim[]; coverageByCountry: Map<string, number> } {
  const totals = new Map<string, number>();
  for (const c of input.claims) {
    if (!(c.claim > 0) || !Number.isFinite(c.claim)) continue;
    totals.set(c.countryId, (totals.get(c.countryId) ?? 0) + c.claim);
  }
  const coverageByCountry = new Map<string, number>();
  for (const [country, total] of totals) {
    const pool = Math.max(0, input.poolByCountry.get(country) ?? 0);
    coverageByCountry.set(country, pool < total ? (pool / total) * (1 - POOL_FLOAT_MARGIN) : 1);
  }
  const payments = input.claims
    .map((c) => ({ ...c, claim: c.claim * (coverageByCountry.get(c.countryId) ?? 0) }))
    .filter((c) => c.claim > 0)
    .sort((a, b) => (a.sectorId < b.sectorId ? -1 : a.sectorId > b.sectorId ? 1 : 0));
  return { payments, coverageByCountry };
}
