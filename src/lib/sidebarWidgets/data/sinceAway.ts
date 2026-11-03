import type { Db } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencyCodes";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencyCodes";
import type { Notification } from "@/lib/db/types";
import type { PortfolioHistory } from "@/lib/db/types/portfolioHistory";
import { categoryOf, type InboxCategory } from "@/lib/inbox/categories";
import { notificationTypeFilter } from "@/lib/notifications/visibility";
import { loadViewerCharacter, loadViewerUser } from "./viewerContext";

export interface HoldingMove {
  kind: "stocks" | "bonds" | "funds";
  /** Percent change in what the holding is worth. */
  change: number;
}

export interface SinceAwayWidgetData {
  /** Turn of the latest snapshot; the change runs from the one before it. */
  turn: number | null;
  /** Net worth change, converted to the player's home currency. Null without two snapshots. */
  netWorthChange: number | null;
  netWorthChangePct: number | null;
  /** Cash and savings change, same currency. */
  cashChange: number | null;
  currencyCode: CurrencyCode | null;
  holdings: HoldingMove[];
  /** Unread notifications by inbox category, largest first. */
  unread: { category: InboxCategory; count: number }[];
  unreadTotal: number;
  /** True when the backlog was larger than the rows grouped. */
  unreadCapped: boolean;
}

/** Enough unread rows to group; a larger backlog shows as "N+". */
const UNREAD_SCAN = 500;

type Snapshot = Pick<
  PortfolioHistory,
  | "turn"
  | "totalValue"
  | "netValue"
  | "cashValue"
  | "stockValue"
  | "bondValue"
  | "fundValue"
  | "exchangeRatesSnapshot"
>;

function pct(current: number | undefined, previous: number | undefined): number | null {
  if (typeof current !== "number" || typeof previous !== "number" || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * What moved for the viewer over the last turn: wealth and holdings from the
 * two newest portfolio snapshots (taken each turn), plus unread notifications
 * grouped as the inbox groups them. "Since last turn" because no field records
 * a player's previous visit reliably.
 */
export async function loadSinceAway(
  db: Db,
  viewer: { userId: string }
): Promise<SinceAwayWidgetData | null> {
  const [user, character] = await Promise.all([
    loadViewerUser(db, viewer),
    loadViewerCharacter(db, viewer),
  ]);
  if (!user) return null;

  const [snapshots, unreadRows] = await Promise.all([
    character
      ? db
          .collection<PortfolioHistory>("portfolioHistory")
          .find({ characterId: character._id })
          .sort({ turn: -1 })
          .limit(2)
          .project<Snapshot>({
            _id: 0,
            turn: 1,
            totalValue: 1,
            netValue: 1,
            cashValue: 1,
            stockValue: 1,
            bondValue: 1,
            fundValue: 1,
            exchangeRatesSnapshot: 1,
          })
          .toArray()
      : Promise.resolve([] as Snapshot[]),
    db
      .collection<Notification>("notifications")
      .aggregate<{ _id: Notification["type"]; count: number }>([
        {
          $match: {
            userId: user._id,
            read: false,
            ...notificationTypeFilter(user.notificationPreferences, new Date()),
          },
        },
        { $limit: UNREAD_SCAN },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const byCategory = new Map<InboxCategory, number>();
  for (const row of unreadRows) {
    const category = categoryOf(row._id);
    byCategory.set(category, (byCategory.get(category) ?? 0) + row.count);
  }
  const unread = [...byCategory.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const unreadTotal = unread.reduce((sum, row) => sum + row.count, 0);

  const [latest, previous] = snapshots;
  const currencyCode = character ? (COUNTRY_CURRENCY_MAP[character.countryId] ?? null) : null;
  // Snapshots are in anchor units; show them at the rate in effect that turn.
  const rate = (currencyCode ? latest?.exchangeRatesSnapshot?.[currencyCode] : undefined) ?? null;
  const local = (value: number) => (rate ? value * rate : null);
  const worth = (s: Snapshot | undefined) => s?.netValue ?? s?.totalValue;
  const both = latest && previous;

  const holdings: HoldingMove[] = [];
  if (both) {
    for (const kind of ["stocks", "bonds", "funds"] as const) {
      const field = kind === "stocks" ? "stockValue" : kind === "bonds" ? "bondValue" : "fundValue";
      const change = pct(latest[field], previous[field]);
      if (change !== null && Math.abs(change) >= 0.05) holdings.push({ kind, change });
    }
  }

  return {
    turn: latest?.turn ?? null,
    netWorthChange: both ? local((worth(latest) ?? 0) - (worth(previous) ?? 0)) : null,
    netWorthChangePct: both ? pct(worth(latest), worth(previous)) : null,
    cashChange:
      both && latest.cashValue !== undefined && previous.cashValue !== undefined
        ? local(latest.cashValue - previous.cashValue)
        : null,
    currencyCode: rate ? currencyCode : null,
    holdings,
    unread,
    unreadTotal,
    unreadCapped: unreadTotal >= UNREAD_SCAN,
  };
}
