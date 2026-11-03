/**
 * Per-turn upkeep for the bond market pools.
 *
 * 1. Re-size each pool's target to a share of its currency's latest broad
 *    money, so the pool scales with the economy it sits in.
 * 2. Sweep cash back out to depositors when the pool has hoarded far past
 *    the target. There is no inflow toward the target: it used to credit 2%
 *    of the shortfall every turn with no payer, and that new money funded
 *    about a quarter of all sovereign underwriting. A pool now holds only what
 *    it took in (purchases, coupons, maturities, QE), the same finite book as
 *    the equity pools. A sovereign issue the pool cannot afford stays unsold
 *    and places later, or an autonomous central bank monetizes part of it on
 *    its own counted balance sheet (`primaryMarket.ts`).
 * 3. Refresh the pool's appetite for each sovereign issuer in its currency
 *    from the sovereign-default demand model, so quotes on a CCC sovereign at
 *    four times GDP are thinner than on an AAA one.
 *
 * Runs at the top of the bond turn, before any coupon or trade.
 */

import { calibratedPoolTarget, poolLiquidityAllocation } from "@/lib/moneySupply/rules/poolTarget";
import type { Db } from "mongodb";
import type { BondMarketPool } from "@/lib/db/types";
import { BOND_MARKET_POOLS_COLLECTION } from "@/lib/db/types/bondMarketPool";
import { COUNTRY_CURRENCY_MAP, type CurrencyCode } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";
import { BOND_POOL_M2_SHARE, debitBondPoolGated } from "@/lib/bonds/marketPool";
import { loadCountrySovereignSnapshots } from "@/lib/sovereignDefault/snapshotLoader";
import { computeMarketDemand } from "@/lib/sovereignDefault/marketDemand";
import {
  loadBondPoolLedgerContext,
  withBondPoolLedgerBatch,
  type BondPoolLedgerContext,
} from "./marketPoolLedger";
import { SOVEREIGN_ISSUANCE_INTERVAL_TURNS } from "@/lib/bonds/sovereign";

/** Cash above this multiple of target triggers a sweep... */
export const BOND_POOL_SWEEP_TRIGGER_MULTIPLE = 2;
/** ...down to this multiple. */
export const BOND_POOL_SWEEP_TO_MULTIPLE = 1.5;

export interface BondMarketPoolTurnResult {
  poolsProcessed: number;
  sweptLocalByCurrency: Record<string, number>;
  appetitesRefreshed: number;
}

/** Per-turn cash move for a bond market pool: sweep only, never an inflow. */
export function planPoolCashMoves(input: { cashLocal: number; targetCashLocal: number }): {
  sweep: number;
} {
  const target =
    Number.isFinite(input.targetCashLocal) && input.targetCashLocal > 0 ? input.targetCashLocal : 0;
  const cash = Number.isFinite(input.cashLocal) && input.cashLocal > 0 ? input.cashLocal : 0;
  if (target <= 0 || cash <= target * BOND_POOL_SWEEP_TRIGGER_MULTIPLE) return { sweep: 0 };
  return { sweep: Math.round((cash - target * BOND_POOL_SWEEP_TO_MULTIPLE) * 100) / 100 };
}

export function countriesForCurrency(currency: CurrencyCode): CountryId[] {
  return (Object.entries(COUNTRY_CURRENCY_MAP) as Array<[CountryId, CurrencyCode]>)
    .filter(([, code]) => code === currency)
    .map(([countryId]) => countryId);
}

/** Face of live sovereign paper in `currency` maturing within the next issuance interval. */
export async function sovereignFaceMaturingSoon(
  db: Db,
  currency: CurrencyCode,
  turn: number
): Promise<number> {
  const rows = await db
    .collection<{ totalIssued?: number }>("bonds")
    .find(
      {
        issuerType: "sovereign",
        currencyCode: currency,
        matured: false,
        defaulted: false,
        maturityTurn: { $gte: turn, $lt: turn + SOVEREIGN_ISSUANCE_INTERVAL_TURNS },
      },
      { projection: { totalIssued: 1 } }
    )
    .toArray();
  return rows.reduce((sum, row) => sum + Math.max(0, row.totalIssued ?? 0), 0);
}

/** The same live-face sum for every currency in one pass, keyed by currency. */
export async function sovereignFaceMaturingSoonByCurrency(
  db: Db,
  turn: number
): Promise<Map<string, number>> {
  const rows = await db
    .collection<{ currencyCode?: string; totalIssued?: number }>("bonds")
    .aggregate<{ _id: string | null; face: number }>([
      {
        $match: {
          issuerType: "sovereign",
          matured: false,
          defaulted: false,
          maturityTurn: { $gte: turn, $lt: turn + SOVEREIGN_ISSUANCE_INTERVAL_TURNS },
        },
      },
      {
        $group: {
          _id: "$currencyCode",
          face: {
            $sum: {
              $cond: [
                { $gt: [{ $ifNull: ["$totalIssued", 0] }, 0] },
                { $ifNull: ["$totalIssued", 0] },
                0,
              ],
            },
          },
        },
      },
    ])
    .toArray();
  const faces = new Map<string, number>();
  for (const row of rows) if (row._id) faces.set(row._id, row.face);
  return faces;
}

/**
 * The latest snapshot for every requested currency in one read instead of one
 * sorted probe per pool.
 */
export async function latestMoneySupplyByCurrency(
  db: Db,
  currencies: readonly CurrencyCode[]
): Promise<Map<string, { m2?: number; turn: number; accountingVersion?: number }>> {
  if (currencies.length === 0) return new Map();
  const rows = await db
    .collection<{
      currencyCode: string;
      m2?: number;
      turn: number;
      accountingVersion?: number;
    }>("moneySupplySnapshots")
    .aggregate<{ _id: string; m2?: number; turn: number; accountingVersion?: number }>([
      { $match: { currencyCode: { $in: [...new Set(currencies)] } } },
      { $sort: { currencyCode: 1, turn: -1 } },
      {
        $group: {
          _id: "$currencyCode",
          m2: { $first: "$m2" },
          turn: { $first: "$turn" },
          accountingVersion: { $first: "$accountingVersion" },
        },
      },
    ])
    .toArray();
  return new Map(rows.map((row) => [row._id, row]));
}

export async function processBondMarketPoolTurn(
  db: Db,
  turn: number,
  now: Date,
  ledgerContext?: BondPoolLedgerContext | null
): Promise<BondMarketPoolTurnResult> {
  const pools = await db
    .collection<BondMarketPool>(BOND_MARKET_POOLS_COLLECTION)
    .find({})
    .toArray();
  const result: BondMarketPoolTurnResult = {
    poolsProcessed: 0,
    sweptLocalByCurrency: {},
    appetitesRefreshed: 0,
  };
  if (pools.length === 0) return result;
  const context =
    ledgerContext === undefined ? await loadBondPoolLedgerContext(db, turn) : ledgerContext;

  // Every read the pass needs, for every pool, up front: none of them touch the
  // bond pools the loop below writes. The per-currency money-supply probe, the
  // maturing-face sum and the sovereign snapshots are each one batched read for
  // the whole pass instead of a query per pool, and assemble to the same values
  // the single-pool loaders give.
  const countriesByPool = pools.map((pool) => countriesForCurrency(pool._id));
  const [latestByCurrency, rolloverByCurrency, snapshotByCountry] = await Promise.all([
    latestMoneySupplyByCurrency(
      db,
      pools.map((pool) => pool._id)
    ),
    sovereignFaceMaturingSoonByCurrency(db, turn),
    loadCountrySovereignSnapshots(db, countriesByPool.flat(), turn),
  ]);

  return withBondPoolLedgerBatch(db, context, async (batch) => {
    for (const [index, pool] of pools.entries()) {
      const currency = pool._id;
      const latest = latestByCurrency.get(currency);
      const rolloverLocal = rolloverByCurrency.get(currency) ?? 0;
      const m2 = latest?.m2;
      const calibration = calibratedPoolTarget({
        previousLiquidityTarget: poolLiquidityAllocation({
          calibratedTarget: pool.liquidityTargetLocal,
          m2Local: pool.m2Local,
          share: BOND_POOL_M2_SHARE,
          fallback: pool.targetCashLocal,
        }),
        previousM2: pool.m2Local,
        previousVersion: pool.poolAccountingVersion,
        latestM2: m2,
        latestVersion: latest?.accountingVersion,
        share: BOND_POOL_M2_SHARE,
      });
      const liquidityTarget = calibration.liquidityTargetLocal;
      const targetCashLocal = Math.round(Math.max(liquidityTarget, rolloverLocal) * 100) / 100;

      const moves = planPoolCashMoves({ cashLocal: pool.cashLocal, targetCashLocal });
      if (moves.sweep > 0) {
        const debit = await debitBondPoolGated(db, currency, moves.sweep, "sweepOut", now, {
          ledgerContext: batch,
        });
        if (debit.ok) result.sweptLocalByCurrency[currency] = moves.sweep;
      }

      const appetiteByCountry: Partial<Record<CountryId, number>> = {};
      for (const countryId of countriesByPool[index]!) {
        const snapshot = snapshotByCountry.get(countryId);
        if (!snapshot) continue;
        const demand = computeMarketDemand(snapshot);
        if (Number.isFinite(demand.demandRatio)) {
          appetiteByCountry[countryId] = Math.round(demand.demandRatio * 1000) / 1000;
          result.appetitesRefreshed++;
        }
      }

      await db.collection<BondMarketPool>(BOND_MARKET_POOLS_COLLECTION).updateOne(
        { _id: currency },
        {
          $set: {
            targetCashLocal,
            liquidityTargetLocal: liquidityTarget,
            appetiteByCountry,
            lastTurn: turn,
            updatedAt: now,
            ...(calibration.m2Local !== undefined
              ? {
                  m2Local: calibration.m2Local,
                  poolAccountingVersion: calibration.poolAccountingVersion,
                }
              : {}),
          },
        }
      );
      result.poolsProcessed++;
    }
    return result;
  });
}
