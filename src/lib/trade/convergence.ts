import type { CountryId } from "@/lib/constants/countries";
import type { CommodityType } from "@/lib/constants/commodities";
import type { ClearingResult } from "./types";
import type { ByCountryBalances } from "./snapshot";
import {
  TRADE_CONVERGENCE_RAMP_TURNS,
  TRADE_PRICE_CONVERGENCE_K,
  TRADE_PRICE_CONVERGENCE_K_FULL,
} from "./constants";

/**
 * Convergence factor for a turn. Before `startTurn` (or with none stamped) it is
 * the legacy TRADE_PRICE_CONVERGENCE_K; from `startTurn` it ramps linearly to
 * TRADE_PRICE_CONVERGENCE_K_FULL over TRADE_CONVERGENCE_RAMP_TURNS, so the
 * price moves that follow are spread over a day of turns and announced ahead
 * (gameConfig.tradeConvergenceFullStartTurn is stamped by an operator).
 */
export function tradeConvergenceK(
  startTurn: number | null | undefined,
  turn: number | null | undefined
): number {
  if (typeof startTurn !== "number" || !Number.isFinite(startTurn))
    return TRADE_PRICE_CONVERGENCE_K;
  if (typeof turn !== "number" || !Number.isFinite(turn)) return TRADE_PRICE_CONVERGENCE_K;
  const progress = Math.max(0, Math.min(1, (turn - startTurn) / TRADE_CONVERGENCE_RAMP_TURNS));
  return (
    TRADE_PRICE_CONVERGENCE_K +
    progress * (TRADE_PRICE_CONVERGENCE_K_FULL - TRADE_PRICE_CONVERGENCE_K)
  );
}

/**
 * Dampened trade convergence (whole-market). Mutates `byCountry` in place so
 * each country's EFFECTIVE supply/demand moves toward balance by a fraction `k`
 * of the trade it actually did: an exporter's local supply is reduced by
 * `k × exports` (its glut is partly absorbed abroad) and an importer's local
 * demand is reduced by `k × imports` (its shortage is partly met by imports).
 *
 * The mutation propagates to every consumer of the national balances — price,
 * sector margins, inflation cost-push, and stored values — so trade relief is
 * felt market-wide, not only in price.
 *
 * `k = 0` is a no-op (exact regression guard). Effective supply/demand are
 * clamped at 0 so an oversized `k` can never produce a negative balance.
 *
 * Clearing must have been computed on the ORIGINAL (pre-dampening) balances.
 */
export function applyTradeConvergence(
  countries: CountryId[],
  byCountry: ByCountryBalances,
  clearing: Map<CommodityType, ClearingResult>,
  k: number
): void {
  if (k === 0) return;
  for (const [commodity, result] of clearing) {
    for (const c of countries) {
      const pc = result.perCountry[c];
      if (!pc) continue;
      const bal = byCountry.get(c)?.get(commodity);
      if (!bal) continue;
      if (pc.exports > 0) bal.supply = Math.max(0, bal.supply - k * pc.exports);
      if (pc.imports > 0) bal.demand = Math.max(0, bal.demand - k * pc.imports);
    }
  }
}

/** The slice of the sourcing pass result that says what actually crossed a border. */
export interface SourcedTrade {
  /** One entry per commodity the sourcing pass settled this turn. */
  summaries: ReadonlyArray<{ commodity: CommodityType }>;
  /** Country-pair delivered trade; `exporter === importer` is domestic haulage. */
  pairAggregates: ReadonlyArray<{
    commodity: CommodityType;
    exporter: string;
    importer: string;
    dispatchedUnits: number;
    deliveredUnits: number;
  }>;
}

/**
 * Clearing credits trade by a price-blind affinity split, but goods only leave
 * a country when the price-ranked sourcing pass ships them. Convergence and the
 * reachable books must not relieve a glut that never sailed (an exporter priced
 * out abroad would sit at balance forever), so cap each country's exports at
 * the units it dispatched abroad and its imports at the units that arrived.
 * Returns a copy; the clearing result itself is persisted unchanged. Missing
 * sourcing, or a commodity the pass did not settle, keeps the clearing figures.
 */
export function capClearingToSourcedTrade(
  clearing: Map<CommodityType, ClearingResult>,
  sourcing: SourcedTrade | null | undefined
): Map<CommodityType, ClearingResult> {
  if (!sourcing) return clearing;
  const settled = new Set(sourcing.summaries.map((s) => s.commodity));
  const exported = new Map<string, number>();
  const imported = new Map<string, number>();
  for (const p of sourcing.pairAggregates) {
    if (p.exporter === p.importer) continue;
    const out = `${p.commodity}|${p.exporter}`;
    const into = `${p.commodity}|${p.importer}`;
    exported.set(out, (exported.get(out) ?? 0) + p.dispatchedUnits);
    imported.set(into, (imported.get(into) ?? 0) + p.deliveredUnits);
  }
  const capped = new Map(clearing);
  for (const [commodity, result] of clearing) {
    if (!settled.has(commodity)) continue;
    const perCountry: ClearingResult["perCountry"] = {};
    for (const [c, pc] of Object.entries(result.perCountry)) {
      const exports = Math.min(pc.exports, exported.get(`${commodity}|${c}`) ?? 0);
      const imports = Math.min(pc.imports, imported.get(`${commodity}|${c}`) ?? 0);
      perCountry[c] = {
        exports,
        imports,
        net: exports - imports,
        // Unshipped exports stay as surplus; undelivered imports stay unmet.
        uncleared: pc.uncleared + (pc.exports - exports) - (pc.imports - imports),
      };
    }
    capped.set(commodity, { ...result, perCountry });
  }
  return capped;
}
