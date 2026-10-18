/**
 * Funded government purchases (owner decision 2026-10-18: nothing created from
 * nothing). The treasury already pays out each turn's slice of budget spending
 * (treasuryTurn); today that money vanishes and a separate demand leg books the
 * same goods as unfunded demand. Here the commodity share of that outlay is the
 * public buyer's funding: the same budgets, now with a destination.
 *
 * Pure: budgets and weights in, per-country funding and purchase lines out.
 */
import type { CommodityType } from "@/lib/constants/commodities";
import { govtSpendForCategory, GOVT_SPEND_CATEGORY_ALIASES } from "@/lib/constants/commodities";
import { GOVERNMENT_COMMODITY_DEMAND } from "@/lib/market/governmentCommodityDemand";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";

export interface PublicBuyerBudget {
  countryId: string;
  /** Annual spending by category, native currency (federalBudget.spending.byCategory). */
  byCategory: Parameters<typeof govtSpendForCategory>[0];
  plannedEconomy: boolean;
  /** Relative state weights (e.g. GDP) for local-service purchases. */
  stateWeights: ReadonlyMap<string, number>;
}

export interface PublicPurchaseLine {
  commodity: CommodityType;
  /** "world" or "state:<id>". */
  book: string;
  amountLocal: number;
}

export function publicBuyerFunding(
  budgets: readonly PublicBuyerBudget[],
  turnsPerYear: number
): { countryId: string; fundingLocal: number; lines: PublicPurchaseLine[] }[] {
  if (!Number.isFinite(turnsPerYear) || turnsPerYear <= 0)
    throw new Error("Invalid turns per year");
  return [...budgets]
    .sort((a, b) => (a.countryId < b.countryId ? -1 : 1))
    .map((b) => {
      const lines: PublicPurchaseLine[] = [];
      for (const { category, commodity, rate, plannedOnly } of GOVERNMENT_COMMODITY_DEMAND) {
        if (plannedOnly && !b.plannedEconomy) continue;
        const annual = govtSpendForCategory(
          b.byCategory,
          GOVT_SPEND_CATEGORY_ALIASES[category] ?? [category]
        );
        const perTurn = (annual / turnsPerYear) * rate;
        if (!(perTurn > 0)) continue;
        if (!isStateScopedCommodity(commodity)) {
          lines.push({ commodity, book: "world", amountLocal: perTurn });
          continue;
        }
        const weights = [...b.stateWeights].filter(([, w]) => Number.isFinite(w) && w > 0);
        const total = weights.reduce((s, [, w]) => s + w, 0);
        if (!(total > 0)) continue; // no state to deliver a local service in
        for (const [stateId, w] of weights.sort(([a], [c]) => (a < c ? -1 : 1)))
          lines.push({ commodity, book: `state:${stateId}`, amountLocal: (perTurn * w) / total });
      }
      return {
        countryId: b.countryId,
        fundingLocal: lines.reduce((s, l) => s + l.amountLocal, 0),
        lines,
      };
    });
}
