/**
 * Shadow measurement for price-gap trade routing.
 *
 * Plain data in, plain data out: no clock, rng or ambient state. Results are
 * persisted on the trade snapshot for evaluation, never fed back into the turn.
 *
 * Trade today is allocated by a gravity fit on fixed affinities; price is not
 * an input. Price-gap routing would change outcomes if:
 *
 * - **Stranded units**: surplus uncleared in one country while a reachable
 *   country has unmet demand at a higher price net of import cost. Greedy fill
 *   over pairs ranked by gap, each side used once.
 * - **Wrong-way units**: volume shipped to a market priced below the exporter's
 *   price net of import cost.
 */
import type { CountryId } from "@/lib/constants/countries";
import type { CommodityType } from "@/lib/constants/commodities";
import type { ClearingResult } from "../types";

export interface ArbitrageShadowEntry {
  /** Uncleared surplus that could reach a higher-priced unmet deficit (units). */
  strandedUnits: number;
  /** Shipped units that went to a lower-priced market than their origin. */
  wrongWayUnits: number;
  /** Largest importer/exporter price ratio among stranded pairs (1 = none). */
  maxStrandedGapRatio: number;
}

export function computeArbitrageShadow(args: {
  countries: readonly CountryId[];
  clearing: ReadonlyMap<CommodityType, ClearingResult>;
  priceOf: (commodity: CommodityType, country: string) => number | undefined;
  laneOpen: (commodity: CommodityType, exporter: CountryId, importer: CountryId) => boolean;
  /** Tariff-inclusive cost multiplier for a route, 1 when absent. */
  importCostMultiplier?: (
    commodity: CommodityType,
    exporter: CountryId,
    importer: CountryId
  ) => number | undefined;
}): Partial<Record<CommodityType, ArbitrageShadowEntry>> {
  const out: Partial<Record<CommodityType, ArbitrageShadowEntry>> = {};
  for (const [commodity, result] of args.clearing) {
    const cost = (e: CountryId, i: CountryId) => {
      const m = args.importCostMultiplier?.(commodity, e, i);
      return typeof m === "number" && Number.isFinite(m) && m > 0 ? m : 1;
    };
    const price = (c: string) => {
      const p = args.priceOf(commodity, c);
      return typeof p === "number" && Number.isFinite(p) && p > 0 ? p : null;
    };
    const surplus = new Map<CountryId, number>();
    const deficit = new Map<CountryId, number>();
    for (const c of args.countries) {
      const u = result.perCountry[c]?.uncleared ?? 0;
      if (u > 0) surplus.set(c, u);
      else if (u < 0) deficit.set(c, -u);
    }
    const pairs: { e: CountryId; i: CountryId; gap: number; ratio: number }[] = [];
    for (const [e] of surplus) {
      const pe = price(e);
      if (pe == null) continue;
      for (const [i] of deficit) {
        if (e === i || !args.laneOpen(commodity, e, i)) continue;
        const pi = price(i);
        if (pi == null) continue;
        const landed = pe * cost(e, i);
        if (pi > landed) pairs.push({ e, i, gap: pi - landed, ratio: pi / landed });
      }
    }
    pairs.sort((a, b) => b.gap - a.gap);
    let stranded = 0;
    let maxRatio = 1;
    for (const p of pairs) {
      const s = surplus.get(p.e) ?? 0;
      const d = deficit.get(p.i) ?? 0;
      const q = Math.min(s, d);
      if (!(q > 0)) continue;
      surplus.set(p.e, s - q);
      deficit.set(p.i, d - q);
      stranded += q;
      if (p.ratio > maxRatio) maxRatio = p.ratio;
    }
    let wrongWay = 0;
    for (const e of Object.keys(result.flow) as CountryId[]) {
      const pe = price(e);
      if (pe == null) continue;
      for (const [i, units] of Object.entries(result.flow[e] ?? {})) {
        const pi = price(i);
        if (pi == null || !(units > 0)) continue;
        if (pi < pe * cost(e, i as CountryId)) wrongWay += units;
      }
    }
    if (stranded > 0 || wrongWay > 0) {
      out[commodity] = {
        strandedUnits: stranded,
        wrongWayUnits: wrongWay,
        maxStrandedGapRatio: maxRatio,
      };
    }
  }
  return out;
}
