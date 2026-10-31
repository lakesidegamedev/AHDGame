import { ObjectId, type Db } from "mongodb";
import type { User } from "@/lib/db/types/user";
import type { Corporation } from "@/lib/db/types/corporation";
import type { CorporationHistory } from "@/lib/db/types/corporationHistory";
import type { CommodityPrice, CommodityPriceHistory } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencyCodes";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencyCodes";
import { COMMODITY_LABELS, type CommodityType } from "@/lib/constants/commoditiesCore";
import { getGameStateCore } from "@/lib/gameState";
import { widgetWatchlist, type WatchKind } from "../watchlist";

export interface WatchlistRow {
  kind: WatchKind;
  id: string;
  /** Null when the item no longer exists, e.g. a dissolved company. */
  name: string | null;
  ticker: string | null;
  /** Share price or global commodity price; null for private companies. */
  value: number | null;
  /** Null means the global price, shown in the market's base currency. */
  currencyCode: CurrencyCode | null;
  /** Percent change against the previous turn; null without a record. */
  change: number | null;
}

export interface WatchlistWidgetData {
  rows: WatchlistRow[];
}

function percentChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * The viewer's starred items with current values and the change since the
 * previous turn, in saved order. Indexed reads only: corporations by
 * sequentialId, commodity prices by commodity, and both histories by id and turn.
 */
export async function loadWatchlist(db: Db, userId: string): Promise<WatchlistWidgetData> {
  const user = await db
    .collection<User>("users")
    .findOne({ _id: new ObjectId(userId) }, { projection: { widgetWatchlist: 1 } });
  const items = widgetWatchlist(user?.widgetWatchlist);
  if (items.length === 0) return { rows: [] };

  const corpIds = items.filter((i) => i.kind === "corporation").map((i) => Number(i.id));
  const commodities = items.filter((i) => i.kind === "commodity").map((i) => i.id);

  const [state, corps, prices] = await Promise.all([
    getGameStateCore(db),
    corpIds.length
      ? db
          .collection<Corporation>("corporations")
          .find(
            { sequentialId: { $in: corpIds } },
            {
              projection: {
                sequentialId: 1,
                name: 1,
                tickerSymbol: 1,
                sharePrice: 1,
                liquidCurrencyCode: 1,
                countryId: 1,
                isPrivate: 1,
              },
            }
          )
          .toArray()
      : [],
    commodities.length
      ? db
          .collection<CommodityPrice>("commodityPrices")
          .find(
            { commodity: { $in: commodities as CommodityType[] } },
            { projection: { commodity: 1, globalPrice: 1, basePrice: 1 } }
          )
          .toArray()
      : [],
  ]);
  const previousTurn = (state?.currentTurn ?? 1) - 1;

  const [corpHistory, priceHistory] = await Promise.all([
    corps.length && previousTurn > 0
      ? db
          .collection<CorporationHistory>("corporationHistory")
          .find(
            { corporationId: { $in: corps.map((corp) => corp._id) }, turn: previousTurn },
            { projection: { corporationId: 1, sharePrice: 1 } }
          )
          .toArray()
      : [],
    prices.length && previousTurn > 0
      ? db
          .collection<CommodityPriceHistory>("commodityPriceHistory")
          .find(
            { commodity: { $in: prices.map((p) => p.commodity) }, turn: previousTurn },
            { projection: { commodity: 1, globalPrice: 1 } }
          )
          .toArray()
      : [],
  ]);

  const corpBySeq = new Map(corps.map((corp) => [String(corp.sequentialId), corp]));
  const corpBefore = new Map(corpHistory.map((r) => [r.corporationId.toString(), r.sharePrice]));
  const priceByCommodity = new Map<string, CommodityPrice>(prices.map((p) => [p.commodity, p]));
  const priceBefore = new Map<string, number>(
    priceHistory.map((r) => [r.commodity, r.globalPrice])
  );

  const rows = items.map((item): WatchlistRow => {
    if (item.kind === "corporation") {
      const corp = corpBySeq.get(item.id);
      if (!corp)
        return { ...item, name: null, ticker: null, value: null, currencyCode: null, change: null };
      const listed = corp.isPrivate !== true;
      const sharePrice = corp.sharePrice ?? 0;
      return {
        ...item,
        name: corp.name,
        ticker: corp.tickerSymbol ?? null,
        value: listed ? sharePrice : null,
        currencyCode:
          corp.liquidCurrencyCode ??
          (corp.countryId ? (COUNTRY_CURRENCY_MAP[corp.countryId] ?? null) : null),
        change: listed ? percentChange(sharePrice, corpBefore.get(corp._id.toString())) : null,
      };
    }
    const price = priceByCommodity.get(item.id);
    const value = price?.globalPrice ?? price?.basePrice ?? null;
    return {
      ...item,
      name: COMMODITY_LABELS[item.id as CommodityType] ?? null,
      ticker: null,
      value,
      currencyCode: null,
      change: value === null ? null : percentChange(value, priceBefore.get(item.id)),
    };
  });
  return { rows };
}
