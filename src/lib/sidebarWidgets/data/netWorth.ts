import { ObjectId, type Db } from "mongodb";
import type { User } from "@/lib/db/types/user";
import type { Character } from "@/lib/db/types/character";
import type { PortfolioHistory } from "@/lib/db/types/portfolioHistory";
import { COUNTRY_CURRENCY_MAP, type CurrencyCode } from "@/lib/constants/currencyCodes";

export interface NetWorthPoint {
  turn: number;
  /** Net worth in anchor units (assets less credit-line and income tax debt). */
  value: number;
  /** Home-currency rate (local per 1 anchor) when this point was recorded. */
  rate: number | null;
}

export interface NetWorthWidgetData {
  currencyCode: CurrencyCode | null;
  /** Oldest first, up to 12 recorded turns. */
  points: NetWorthPoint[];
}

const NET_WORTH_TURNS = 12;

/**
 * The player's net worth over recent turns, from the per-turn portfolio
 * snapshot the turn writes for every character. Only the home currency rate
 * of each point is kept, so the client can convert at the rate of the time.
 */
export async function loadNetWorth(db: Db, userId: string): Promise<NetWorthWidgetData | null> {
  const user = await db
    .collection<User>("users")
    .findOne({ _id: new ObjectId(userId) }, { projection: { activeCharacterId: 1 } });
  if (!user?.activeCharacterId) return null;
  const [character, history] = await Promise.all([
    db
      .collection<Character>("characters")
      .findOne({ _id: user.activeCharacterId }, { projection: { countryId: 1 } }),
    db
      .collection<PortfolioHistory>("portfolioHistory")
      .find({ characterId: user.activeCharacterId })
      .sort({ turn: -1 })
      .limit(NET_WORTH_TURNS)
      .project<
        Pick<PortfolioHistory, "turn" | "totalValue" | "netValue" | "exchangeRatesSnapshot">
      >({
        _id: 0,
        turn: 1,
        totalValue: 1,
        netValue: 1,
        exchangeRatesSnapshot: 1,
      })
      .toArray(),
  ]);
  if (history.length === 0) return null;
  const currencyCode = character?.countryId
    ? (COUNTRY_CURRENCY_MAP[character.countryId] ?? null)
    : null;
  return {
    currencyCode,
    points: [...history].reverse().map((row) => ({
      turn: row.turn,
      value: row.netValue ?? row.totalValue,
      rate: (currencyCode && row.exchangeRatesSnapshot?.[currencyCode]) || null,
    })),
  };
}
