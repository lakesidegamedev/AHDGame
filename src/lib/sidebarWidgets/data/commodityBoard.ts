import type { Db } from "mongodb";
import type { CommodityPrice } from "@/lib/db/types/commodityPrice";
import type { CommodityPriceHistory } from "@/lib/db/types/commodityPriceHistory";
import { COMMODITY_LABELS, type CommodityType } from "@/lib/constants/commoditiesCore";

/** Headline goods most players trade or build with, in display order. */
export const BOARD_COMMODITIES: readonly CommodityType[] = [
  "oil",
  "natural_gas",
  "coal",
  "iron",
  "steel",
  "food",
  "electronics",
  "energy",
];

export interface CommodityBoardRow {
  commodity: CommodityType;
  label: string;
  /** Global price in anchor units. */
  price: number;
  /** Percent change against the previous recorded turn; null without history. */
  change: number | null;
  /** Oldest first, up to 12 recorded turns, ending at the current price. */
  series: number[];
}

export interface CommodityBoardWidgetData {
  turn: number;
  rows: CommodityBoardRow[];
}

const SERIES_TURNS = 12;

/**
 * Global prices and recent history for the board's commodities: one read of
 * the live prices (unique on commodity) and one of the history (commodity,
 * turn index) with a turn floor, the same history the commodity pages chart.
 */
export async function loadCommodityBoard(db: Db): Promise<CommodityBoardWidgetData | null> {
  const prices = await db
    .collection<CommodityPrice>("commodityPrices")
    .find(
      { commodity: { $in: [...BOARD_COMMODITIES] } },
      { projection: { _id: 0, commodity: 1, globalPrice: 1, turn: 1 } }
    )
    .toArray();
  if (prices.length === 0) return null;
  const turn = Math.max(...prices.map((row) => row.turn ?? 0));
  const history = await db
    .collection<CommodityPriceHistory>("commodityPriceHistory")
    .find(
      {
        commodity: { $in: prices.map((row) => row.commodity) },
        turn: { $gt: turn - SERIES_TURNS, $lt: turn },
      },
      { projection: { _id: 0, commodity: 1, turn: 1, globalPrice: 1 } }
    )
    .toArray();
  const byCommodity = new Map<string, { turn: number; price: number }[]>();
  for (const row of history) {
    if (!Number.isFinite(row.globalPrice)) continue;
    const list = byCommodity.get(row.commodity) ?? [];
    list.push({ turn: row.turn, price: row.globalPrice });
    byCommodity.set(row.commodity, list);
  }
  const live = new Map(prices.map((row) => [row.commodity, row.globalPrice]));
  const rows: CommodityBoardRow[] = [];
  for (const commodity of BOARD_COMMODITIES) {
    const price = live.get(commodity);
    if (price === undefined || !Number.isFinite(price)) continue;
    const past = (byCommodity.get(commodity) ?? []).sort((a, b) => a.turn - b.turn);
    const previous = past.at(-1)?.price;
    rows.push({
      commodity,
      label: COMMODITY_LABELS[commodity],
      price,
      change: previous && previous > 0 ? ((price - previous) / previous) * 100 : null,
      series: [...past.map((point) => point.price), price],
    });
  }
  return { turn, rows };
}
