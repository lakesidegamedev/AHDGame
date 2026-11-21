import type { CommodityType } from "@/lib/constants/commodities";

export interface BuildDemandCapGap {
  byState: Record<string, number>;
  byCountry: Record<string, number>;
}

type Balance = { supply: number; demand: number };
type ScopedBalances = ReadonlyMap<string, ReadonlyMap<CommodityType, Balance>>;

/** Approximate how much of the cap's removed demand would exceed available supply. */
export function buildDemandCapGaps(input: {
  global: ReadonlyMap<CommodityType, Balance>;
  states: ScopedBalances;
  countries: ScopedBalances;
  removed: ReadonlyMap<CommodityType, number>;
}): Map<CommodityType, BuildDemandCapGap> {
  const result = new Map<CommodityType, BuildDemandCapGap>();
  for (const [commodity, removed] of input.removed) {
    const total = input.global.get(commodity)?.demand ?? 0;
    if (!(removed > 0 && total > 0)) continue;

    const gaps = (scopes: ScopedBalances) =>
      Object.fromEntries(
        [...scopes].flatMap(([id, ledger]) => {
          const balance = ledger.get(commodity);
          if (!balance || !(balance.demand > 0)) return [];
          const attributed = removed * Math.min(1, balance.demand / total);
          const uncovered = balance.demand + attributed - Math.max(balance.demand, balance.supply);
          return uncovered > 0 ? [[id, uncovered]] : [];
        })
      );
    const byState = gaps(input.states);
    const byCountry = gaps(input.countries);
    if (Object.keys(byState).length || Object.keys(byCountry).length) {
      result.set(commodity, { byState, byCountry });
    }
  }
  return result;
}
