import { ObjectId, type Db } from "mongodb";
import type { User } from "@/lib/db/types/user";
import type { Corporation } from "@/lib/db/types/corporation";
import type { CorporationHistory } from "@/lib/db/types/corporationHistory";
import type { StockExchangeSnapshot } from "@/lib/db/types/stockExchangeSnapshot";
import type { CurrencyCode } from "@/lib/constants/currencyCodes";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencyCodes";
import { EXCHANGE_API_KEYS } from "@/lib/constants/exchangeRegistry";
import { getAltClustersCollection } from "@/lib/db/collections";
import { PLAYER_CONTENT_REPORTS } from "@/lib/safety/playerSafety";
import { parseWidgetKey, TICKER_HOME_SCOPE } from "./widgetCatalog";
import { loadKeirPet } from "./keirPet";
import { loadRecommendationsForUser } from "@/lib/actions/loadRecommendations";

export interface MyCompanyWidgetData {
  sequentialId: number | null;
  name: string;
  ticker: string | null;
  currencyCode: CurrencyCode | null;
  cash: number;
  sharePrice: number;
  /** Percent change against the previous recorded turn; null without history. */
  sharePriceChange: number | null;
  revenue: number | null;
  income: number | null;
  /** Oldest first, up to 12 recorded turns. */
  sharePriceSeries: number[];
  cashSeries: number[];
  isPrivate: boolean;
}

export interface TickerRow {
  sequentialId: number;
  name: string;
  ticker: string | null;
  sharePrice: number;
  currencyCode: CurrencyCode | null;
  change: number | null;
}

export interface StockTickerWidgetData {
  exchange: string;
  exchangeName: string;
  turn: number;
  rows: TickerRow[];
}

export interface StaffQueuesWidgetData {
  admin: boolean;
  wikiReview: number;
  altClusters: number;
  playerReports: number;
}

export interface WidgetViewer {
  userId: string;
  isAdmin: boolean;
  isModerator: boolean;
}

const SERIES_TURNS = 12;
const TICKER_ROWS = 8;

function percentChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

async function loadMyCompany(db: Db, viewer: WidgetViewer): Promise<MyCompanyWidgetData | null> {
  const user = await db
    .collection<User>("users")
    .findOne(
      { _id: new ObjectId(viewer.userId) },
      { projection: { activeCharacterId: 1, activeCharacterType: 1, activeImperialCharacterId: 1 } }
    );
  const ceoId =
    user?.activeCharacterType === "imperial"
      ? user.activeImperialCharacterId
      : user?.activeCharacterId;
  if (!ceoId) return null;
  const corp = await db.collection<Corporation>("corporations").findOne(
    { ceoId, ceoVacant: { $ne: true }, imfInstitution: { $ne: true } },
    {
      projection: {
        name: 1,
        sequentialId: 1,
        tickerSymbol: 1,
        liquidCapital: 1,
        liquidCurrencyCode: 1,
        sharePrice: 1,
        countryId: 1,
        isPrivate: 1,
      },
    }
  );
  if (!corp) return null;
  const history = await db
    .collection<CorporationHistory>("corporationHistory")
    .find(
      { corporationId: corp._id },
      { projection: { turn: 1, sharePrice: 1, liquidCapital: 1, revenue: 1, income: 1 } }
    )
    .sort({ turn: -1 })
    .limit(SERIES_TURNS)
    .toArray();
  const oldestFirst = [...history].reverse();
  const latest = history[0];
  return {
    sequentialId: corp.sequentialId ?? null,
    name: corp.name,
    ticker: corp.tickerSymbol ?? null,
    currencyCode:
      corp.liquidCurrencyCode ??
      (corp.countryId ? (COUNTRY_CURRENCY_MAP[corp.countryId] ?? null) : null),
    cash: corp.liquidCapital ?? 0,
    sharePrice: corp.sharePrice ?? 0,
    sharePriceChange: percentChange(corp.sharePrice ?? 0, history[1]?.sharePrice),
    revenue: latest?.revenue ?? null,
    income: latest?.income ?? null,
    sharePriceSeries: oldestFirst.map((row) => row.sharePrice),
    cashSeries: oldestFirst.map((row) => row.liquidCapital),
    isPrivate: corp.isPrivate === true,
  };
}

async function loadTicker(db: Db, exchange: string): Promise<StockTickerWidgetData | null> {
  if (!EXCHANGE_API_KEYS.has(exchange)) return null;
  const snapshot = await db
    .collection<StockExchangeSnapshot>("stockExchangeSnapshots")
    .findOne(
      { _id: exchange },
      { projection: { exchangeName: 1, turn: 1, listings: { $slice: TICKER_ROWS } } }
    );
  if (!snapshot) return null;
  const listings = snapshot.listings ?? [];
  const previous = await db
    .collection<CorporationHistory>("corporationHistory")
    .find(
      { corporationId: { $in: listings.map((row) => row._id) }, turn: snapshot.turn - 1 },
      { projection: { corporationId: 1, sharePrice: 1 } }
    )
    .toArray();
  const before = new Map(previous.map((row) => [row.corporationId.toString(), row.sharePrice]));
  return {
    exchange,
    exchangeName: snapshot.exchangeName,
    turn: snapshot.turn,
    rows: listings.map((row) => ({
      sequentialId: row.sequentialId,
      name: row.name,
      ticker: row.tickerSymbol ?? null,
      sharePrice: row.sharePrice,
      currencyCode: row.liquidCurrencyCode ?? null,
      change: percentChange(row.sharePrice, before.get(row._id.toString())),
    })),
  };
}

async function loadStaffQueues(
  db: Db,
  viewer: WidgetViewer
): Promise<StaffQueuesWidgetData | null> {
  if (!viewer.isAdmin && !viewer.isModerator) return null;
  const [wikiReview, altClusters, playerReports] = await Promise.all([
    db.collection("wikiPages").countDocuments({ status: "pending_review" }),
    getAltClustersCollection(db).then((clusters) => clusters.countDocuments({ status: "open" })),
    db.collection(PLAYER_CONTENT_REPORTS).countDocuments({ status: "pending" }),
  ]);
  return { admin: viewer.isAdmin, wikiReview, altClusters, playerReports };
}

/**
 * Data for each requested widget key. A key the viewer cannot use, or whose
 * load fails, comes back null so one bad widget never blanks the others.
 */
export async function loadSidebarWidgetData(
  db: Db,
  keys: string[],
  viewer: WidgetViewer
): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    keys.map(async (key): Promise<[string, unknown]> => {
      const parsed = parseWidgetKey(key);
      if (!parsed) return [key, null];
      try {
        switch (parsed.id) {
          case "keirPet":
            return [key, await loadKeirPet(db, viewer.userId, loadRecommendationsForUser)];
          case "myCompany":
            return [key, await loadMyCompany(db, viewer)];
          case "stockTicker":
            // The client resolves the viewed nation to its exchange before asking.
            return [
              key,
              parsed.param && parsed.param !== TICKER_HOME_SCOPE
                ? await loadTicker(db, parsed.param)
                : null,
            ];
          case "staffQueues":
            return [key, await loadStaffQueues(db, viewer)];
        }
      } catch {
        return [key, null];
      }
    })
  );
  return Object.fromEntries(entries);
}
