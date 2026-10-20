/**
 * Construction work as funded demand (funded-market cutover, demand side).
 *
 * A capacity build order is paid in full when it is placed, and today that cash
 * leaves the economy with no recipient. In the funded market it becomes the
 * destination it should have had: the construction work on each outstanding
 * order is bought from producers as the order progresses, spread over the
 * order's build window on its delivery schedule (`deliveredFraction`): linear
 * for smooth orders, all at landing for all-at-once orders.
 *
 * Using the delivery schedule keeps money closed: a cancellation refunds a
 * share of the undelivered cost only, a shortage speed-up preserves the
 * delivered fraction, so work bought plus any refund never exceeds what the
 * order paid. Unbought work stays in the existing sink.
 *
 * Pure: build orders in, per-country purchase lines out.
 */
import type { CommodityType } from "@/lib/constants/commodities";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import type { SectorBuildOrder } from "@/lib/db/types";
import { deliveredFraction } from "@/lib/corporations/buildDelivery";
import type { PublicPurchaseLine } from "./publicBuyerRules";

/**
 * What building capacity buys: structures (construction services and building
 * materials), equipment (steel, electronics, vehicles) and software. Weights sum
 * to 1. Tunable.
 */
export const CAPITAL_GOODS_BASKET: Readonly<Partial<Record<CommodityType, number>>> = {
  construction_services: 0.4,
  building_materials: 0.15,
  steel: 0.1,
  electronics: 0.15,
  vehicles: 0.1,
  software: 0.1,
};

export type BuildOrderWork = Pick<
  SectorBuildOrder,
  "costPaidAnchor" | "startTurn" | "onlineTurn" | "smooth"
>;

/** Anchor value of the construction work done on an order during `turn`. */
export function buildWorkThisTurn(order: BuildOrderWork, turn: number): number {
  const cost = order.costPaidAnchor;
  if (
    !Number.isFinite(cost) ||
    !(cost > 0) ||
    !Number.isFinite(order.startTurn) ||
    !Number.isFinite(order.onlineTurn)
  )
    return 0;
  const delivered = (t: number) => deliveredFraction(order as SectorBuildOrder, t);
  const work = cost * (delivered(turn) - delivered(turn - 1));
  return work > 0 ? Math.min(work, cost) : 0;
}

export interface BuildingSector {
  countryId: string;
  stateId: string;
  buildQueue: readonly BuildOrderWork[];
}

/** Construction buyers per country: this turn's build work across the capital-goods basket. */
export function investmentBuyerFunding(
  sectors: readonly BuildingSector[],
  turn: number
): { countryId: string; fundingLocal: number; lines: PublicPurchaseLine[] }[] {
  const byCountry = new Map<string, Map<string, PublicPurchaseLine>>();
  for (const s of sectors) {
    if (!s.countryId) continue;
    const work = s.buildQueue.reduce((sum, o) => sum + buildWorkThisTurn(o, turn), 0);
    if (!(work > 0)) continue;
    const lines = byCountry.get(s.countryId) ?? new Map<string, PublicPurchaseLine>();
    for (const [commodity, weight] of Object.entries(CAPITAL_GOODS_BASKET) as [
      CommodityType,
      number,
    ][]) {
      if (!(weight > 0)) continue;
      const local = isStateScopedCommodity(commodity);
      if (local && !s.stateId) continue; // nowhere to deliver a local service
      const book = local ? `state:${s.stateId}` : "world";
      const key = `${commodity}|${book}`;
      const line = lines.get(key) ?? { commodity, book, amountLocal: 0 };
      line.amountLocal += work * weight;
      lines.set(key, line);
    }
    byCountry.set(s.countryId, lines);
  }
  return [...byCountry]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([countryId, lines]) => {
      const sorted = [...lines].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, line]) => line);
      return {
        countryId,
        fundingLocal: sorted.reduce((sum, l) => sum + l.amountLocal, 0),
        lines: sorted,
      };
    });
}
