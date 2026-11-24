/**
 * Corporation commodity-history chart helpers. Physical output is persisted
 * directly from the world supply ledger; global share is derived at read time
 * from `commodityFlows.supplyUnits` for the same turn.
 */
import { bookPerTurn } from "@/lib/commodities/perTurnUnits";

export type CommodityOutputBasis = "revenue-proxy-v1" | "plants-ledger-v1";

/**
 * Production first reached the live history writer on this deployment. The
 * timestamp is used only to label the already-written rows that predate the
 * persisted basis field below. A reset or another world cannot accidentally
 * inherit the marker unless its history actually crosses this instant.
 */
export const COMMODITY_OUTPUT_PLANTS_LEDGER_CUTOVER_AT = new Date("2026-08-24T02:08:22.000Z");

export interface CommodityOutputBasisChange {
  turn: number;
  from: CommodityOutputBasis;
  to: CommodityOutputBasis;
}

interface BasisHistoryRow {
  turn: number;
  createdAt?: Date | string;
  commodityOutputBasis?: CommodityOutputBasis;
}

function inferredBasis(row: BasisHistoryRow): CommodityOutputBasis | null {
  if (row.commodityOutputBasis) return row.commodityOutputBasis;
  if (!row.createdAt) return null;
  const createdAt = new Date(row.createdAt);
  if (!Number.isFinite(createdAt.getTime())) return null;
  return createdAt < COMMODITY_OUTPUT_PLANTS_LEDGER_CUTOVER_AT
    ? "revenue-proxy-v1"
    : "plants-ledger-v1";
}

/** Find a real basis boundary without treating an ordinary output shock as one. */
export function findCommodityOutputBasisChange(
  history: BasisHistoryRow[]
): CommodityOutputBasisChange | null {
  for (let index = 1; index < history.length; index += 1) {
    const previous = inferredBasis(history[index - 1]);
    const current = inferredBasis(history[index]);
    if (previous && current && previous !== current) {
      return { turn: history[index].turn, from: previous, to: current };
    }
  }
  return null;
}

/** Corp output ÷ global supply × 100, capped at 100. */
export function computeCommodityOutputSharePercent(
  outputUnits: number,
  globalSupplyUnits: number
): number {
  if (!(outputUnits > 0) || !(globalSupplyUnits > 0)) return 0;
  return Math.round(Math.min(100, (outputUnits / globalSupplyUnits) * 100) * 100) / 100;
}

/**
 * One point of a company's output history against the world, per turn. The
 * flow ledger stores world supply and stock on the price phase's basis
 * (perTurnUnits); company output is already per turn.
 */
export function commodityOutputPoint(
  turn: number,
  outputUnits: number,
  flow: { supplyUnits?: number | null; stockUnits?: number | null } | undefined
) {
  const globalSupplyUnits = flow?.supplyUnits != null ? bookPerTurn(flow.supplyUnits) : null;
  return {
    turn,
    outputUnits,
    globalSupplyUnits,
    sharePercent:
      globalSupplyUnits != null
        ? computeCommodityOutputSharePercent(outputUnits, globalSupplyUnits)
        : null,
    stockUnits: flow?.stockUnits != null ? bookPerTurn(flow.stockUnits) : null,
  };
}
