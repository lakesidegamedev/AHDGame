import type { EquityMarketPool } from "@/lib/db/types/equityMarketPool";

/**
 * Money an equity market pool holds beyond what it was given or earned, in
 * local currency.
 *
 *     residual = cashLocal
 *              - (seedLocal + purchasesIn + dividendsIn
 *                 - salesOut - issuanceOut - sweepOut)
 *
 * A conserving pool returns ~0. A POSITIVE residual is money the pool created
 * with no counterparty; this module exists to keep that from regressing.
 *
 * `inflowIn` is deliberately NOT a term. It IS the minting leg, so counting it
 * as an inflow would make the identity hold by definition and assert nothing.
 * Leaving it out means a pool that minted in the past reads with a residual
 * equal to what it minted, which is the honest number.
 *
 * `seedLocal` is required rather than defaulted. Pools were inserted at
 * `m2 x EQUITY_POOL_M2_SHARE` with no ledger counter, so a pool that has not
 * been backfilled cannot distinguish its opening balance from created money.
 * Returning `NaN` for those says "cannot evaluate" instead of reporting a
 * confidently wrong figure; callers must check `Number.isFinite`.
 */
export function poolConservationResidual(pool: EquityMarketPool): number {
  const seed = pool.seedLocal;
  if (typeof seed !== "number" || !Number.isFinite(seed)) return Number.NaN;
  const l = pool.lifetime ?? {};
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const entitled =
    seed + n(l.purchasesIn) + n(l.dividendsIn) - n(l.salesOut) - n(l.issuanceOut) - n(l.sweepOut);
  return pool.cashLocal - entitled;
}
