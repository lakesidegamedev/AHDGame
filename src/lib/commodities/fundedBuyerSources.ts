/**
 * Non-company buyers of a commodity in a funded world, read from the settled
 * funded market of the price row's turn.
 *
 * In a funded world the formula rows (base economic demand, retail and
 * construction formulas, the government budget estimate) are not buyers: no
 * money moves through them. The real non-company buyers are households,
 * governments, construction and investment, and economy-only countries, and
 * the turn records what each ordered and received.
 */
import type { Db } from "mongodb";
import { governmentBudgetLinesText } from "@/lib/market/governmentCommodityDemand";
import { producerMarketOutcomesCollection } from "@/lib/db/repositories/producerMarketOutcomes";
import {
  FUNDED_BUYER_LABELS,
  type FundedBuyerDemandRow,
} from "@/lib/market/producerMarket/fundedBuyerDemandRules";

function describeBuyer(kind: FundedBuyerDemandRow["kind"], commodity: string): string {
  const base = FUNDED_BUYER_LABELS[kind].description;
  if (kind !== "publicBuyer") return base;
  const lines = governmentBudgetLinesText(commodity);
  return lines ? `${base} ${lines}` : base;
}

export interface FundedBuyerSource {
  name: string;
  type: "system";
  /** Units ordered per day. */
  units: number;
  /** Units received per day. */
  receivedUnits: number;
  description: string;
}

/**
 * Null when the turn settled no funded market (a formula world keeps its
 * formula rows). An empty list when it did but recorded no buyer breakdown,
 * so formula rows are never shown for a funded turn.
 */
export async function loadFundedBuyerSources(
  db: Db,
  commodity: string,
  turn: number | null | undefined,
  worldEpochId: string | null | undefined
): Promise<FundedBuyerSource[] | null> {
  if (!worldEpochId || typeof turn !== "number" || !Number.isFinite(turn)) return null;
  const doc = await producerMarketOutcomesCollection<{
    _id: string;
    buyerDemand?: FundedBuyerDemandRow[];
  }>(db).findOne({ _id: `${worldEpochId}:${turn}` }, { projection: { buyerDemand: 1 } });
  if (!doc) return null;
  return fundedBuyerSourceRows(doc.buyerDemand ?? [], commodity);
}

export function fundedBuyerSourceRows(
  rows: readonly FundedBuyerDemandRow[],
  commodity: string
): FundedBuyerSource[] {
  return rows
    .filter((r) => r.commodity === commodity && r.requested > 0)
    .sort((a, b) => b.requested - a.requested)
    .map((r) => ({
      name: FUNDED_BUYER_LABELS[r.kind].name,
      type: "system" as const,
      units: Math.round(r.requested * 100) / 100,
      receivedUnits: Math.round(r.delivered * 100) / 100,
      description: describeBuyer(r.kind, commodity),
    }));
}
