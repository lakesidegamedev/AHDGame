import { ObjectId, type Db } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencyCodes";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencyCodes";
import { EXCHANGE_API_KEYS } from "@/lib/constants/exchangeRegistry";
import { getAltClustersCollection } from "@/lib/db/collections";
import type { StockExchangeSnapshot } from "@/lib/db/types";
import { parseWidgetKey, TICKER_HOME_SCOPE } from "./widgetCatalog";
import { loadWatchlist } from "./data/watchlist";
import { loadKeirPet } from "./keirPet";
import { loadRecommendationsForUser } from "@/lib/actions/loadRecommendations";
import { loadDueSoon } from "./dueSoon";
import { loadChamberFloor } from "./data/chamberFloor";
import { loadMyRace } from "./data/myRace";
import { loadOfficeDashboard } from "./data/officeDashboard";
import { loadSinceAway } from "./data/sinceAway";
import { loadSectorHeatmap } from "./data/sectorHeatmap";
import { loadNetWorth } from "./data/netWorth";
import { loadCommodityBoard } from "./data/commodityBoard";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { usersCollection } from "@/lib/db/repositories/users";
import { corporationHistoryCollection } from "@/lib/db/repositories/corporationHistory";
import { wikiPagesCollection } from "@/lib/db/repositories/wikiPages";
import type { Document } from "mongodb";
import { stockExchangeSnapshotsCollection } from "@/lib/db/repositories/stockExchangeSnapshots";
import { playerContentReportsCollection } from "@/lib/db/repositories/playerContentReports";

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
  /** Income per recorded turn, oldest first; may be negative. */
  incomeSeries: number[];
  isPrivate: boolean;
}

export interface TickerRow {
  sequentialId: number;
  name: string;
  ticker: string | null;
  sharePrice: number;
  currencyCode: CurrencyCode | null;
  change: number | null;
  /** Share price over recent recorded turns, oldest first, ending at the current price. */
  series: number[];
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
  const user = await usersCollection(db).findOne(
    { _id: new ObjectId(viewer.userId) },
    { projection: { activeCharacterId: 1, activeCharacterType: 1, activeImperialCharacterId: 1 } }
  );
  const ceoId =
    user?.activeCharacterType === "imperial"
      ? user.activeImperialCharacterId
      : user?.activeCharacterId;
  if (!ceoId) return null;
  const corp = await corporationsCollection(db).findOne(
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
  const history = await corporationHistoryCollection(db)
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
    // A private corporation has no market, so no quote leaves the server.
    sharePrice: corp.isPrivate === true ? 0 : (corp.sharePrice ?? 0),
    sharePriceChange:
      corp.isPrivate === true ? null : percentChange(corp.sharePrice ?? 0, history[1]?.sharePrice),
    revenue: latest?.revenue ?? null,
    income: latest?.income ?? null,
    sharePriceSeries: corp.isPrivate === true ? [] : oldestFirst.map((row) => row.sharePrice),
    cashSeries: oldestFirst.map((row) => row.liquidCapital),
    incomeSeries: oldestFirst.map((row) => row.income ?? 0),
    isPrivate: corp.isPrivate === true,
  };
}

type TickerHistory = Map<string, { turn: number; sharePrice: number }[]>;

async function loadTickerData(db: Db, exchanges: Set<string>) {
  const snapshots = await stockExchangeSnapshotsCollection(db)
    .find(
      { _id: { $in: [...exchanges] } },
      { projection: { exchangeName: 1, turn: 1, listings: { $slice: TICKER_ROWS } } }
    )
    .toArray();
  const snapshotsByExchange = new Map(snapshots.map((snapshot) => [snapshot._id, snapshot]));
  const idsByTurn = new Map<number, Map<string, ObjectId>>();
  for (const { turn, listings } of snapshots) {
    if (!listings?.length) continue;
    const ids = idsByTurn.get(turn) ?? new Map<string, ObjectId>();
    for (const { _id } of listings) ids.set(_id.toString(), _id);
    idsByTurn.set(turn, ids);
  }

  const past: TickerHistory = new Map();
  if (idsByTurn.size > 0) {
    const filters = Array.from(idsByTurn, ([turn, ids]) => ({
      corporationId: { $in: [...ids.values()] },
      turn: { $gt: turn - SERIES_TURNS, $lt: turn },
    }));
    const history = await corporationHistoryCollection(db)
      .find(filters[0] && filters.length === 1 ? filters[0] : { $or: filters }, {
        projection: { _id: 0, corporationId: 1, turn: 1, sharePrice: 1 },
      })
      .toArray();
    for (const row of history) {
      if (!Number.isFinite(row.sharePrice)) continue;
      const key = row.corporationId.toString();
      const points = past.get(key) ?? [];
      points.push(row);
      past.set(key, points);
    }
    for (const points of past.values()) points.sort((a, b) => a.turn - b.turn);
  }
  return { snapshotsByExchange, past };
}

function renderTicker(snapshot: StockExchangeSnapshot, past: TickerHistory): StockTickerWidgetData {
  return {
    exchange: snapshot._id,
    exchangeName: snapshot.exchangeName,
    turn: snapshot.turn,
    rows: (snapshot.listings ?? []).map((row) => {
      // The same listing can appear in exchanges with different snapshot turns.
      const points = (past.get(row._id.toString()) ?? []).filter(
        (point) => point.turn > snapshot.turn - SERIES_TURNS && point.turn < snapshot.turn
      );
      const previous = points.at(-1);
      return {
        sequentialId: row.sequentialId,
        name: row.name,
        ticker: row.tickerSymbol ?? null,
        sharePrice: row.sharePrice,
        currencyCode: row.liquidCurrencyCode ?? null,
        change:
          previous?.turn === snapshot.turn - 1
            ? percentChange(row.sharePrice, previous.sharePrice)
            : null,
        series: [...points.map((point) => point.sharePrice), row.sharePrice],
      };
    }),
  };
}

async function loadStaffQueues(
  db: Db,
  viewer: WidgetViewer
): Promise<StaffQueuesWidgetData | null> {
  if (!viewer.isAdmin && !viewer.isModerator) return null;
  const [wikiReview, altClusters, playerReports] = await Promise.all([
    wikiPagesCollection<Document>(db).countDocuments({ status: "pending_review" }),
    getAltClustersCollection(db).then((clusters) => clusters.countDocuments({ status: "open" })),
    playerContentReportsCollection<Document>(db).countDocuments({ status: "pending" }),
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
  const parsedKeys = keys.map((key) => ({ key, parsed: parseWidgetKey(key) }));
  const tickerExchanges = new Set<string>();
  for (const { parsed } of parsedKeys) {
    if (
      parsed?.id === "stockTicker" &&
      parsed.param &&
      parsed.param !== TICKER_HOME_SCOPE &&
      EXCHANGE_API_KEYS.has(parsed.param)
    ) {
      tickerExchanges.add(parsed.param);
    }
  }
  let tickerData: ReturnType<typeof loadTickerData> | undefined;

  const entries = await Promise.all(
    parsedKeys.map(async ({ key, parsed }): Promise<[string, unknown]> => {
      if (!parsed) return [key, null];
      try {
        switch (parsed.id) {
          case "keirPet":
            return [key, await loadKeirPet(db, viewer.userId, loadRecommendationsForUser)];
          case "dueSoon":
            return [key, await loadDueSoon(db, viewer.userId)];
          case "myCompany":
            return [key, await loadMyCompany(db, viewer)];
          case "stockTicker": {
            if (!parsed.param || !tickerExchanges.has(parsed.param)) return [key, null];
            const { snapshotsByExchange, past } = await (tickerData ??= loadTickerData(
              db,
              tickerExchanges
            ));
            const snapshot = snapshotsByExchange.get(parsed.param);
            return [key, snapshot ? renderTicker(snapshot, past) : null];
          }
          case "staffQueues":
            return [key, await loadStaffQueues(db, viewer)];
          case "watchlist":
            return [key, await loadWatchlist(db, viewer.userId)];
          case "myRace":
            return [key, await loadMyRace(db, viewer)];
          case "chamberFloor":
            return [key, await loadChamberFloor(db, viewer)];
          case "officeDashboard":
            return [key, await loadOfficeDashboard(db, viewer)];
          case "sinceAway":
            return [key, await loadSinceAway(db, viewer)];
          case "sectorHeatmap":
            return [
              key,
              parsed.param && parsed.param !== TICKER_HOME_SCOPE
                ? await loadSectorHeatmap(db, parsed.param)
                : null,
            ];
          case "netWorth":
            return [key, await loadNetWorth(db, viewer.userId)];
          case "commodityBoard":
            return [key, await loadCommodityBoard(db)];
        }
      } catch {
        return [key, null];
      }
    })
  );
  return Object.fromEntries(entries);
}
