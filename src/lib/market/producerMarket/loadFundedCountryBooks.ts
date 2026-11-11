/**
 * The funded country book a turn published, for country market views.
 *
 * Read by the turn engine's own id, `${worldEpoch}:${turn}` (see
 * fundedProducerTurn), never by sorting on `turn`: the collection has no
 * `turn` index. `turn` is the commodity price rows' turn, so the book always
 * belongs to the prices it is shown beside. Null when the world has no epoch,
 * the turn settled no funded market, or the book stage was off.
 */
import type { Db } from "mongodb";
import type { GameState } from "@/lib/db/types";
import { PRODUCER_MARKET_OUTCOMES } from "./fundedLedgerRules";
import type { FundedCountryBookRow } from "./fundedBookRules";
import {
  overlayFundedNationalBalances,
  fundedCountryMarketsByCommodity,
  priceRowsTurn,
  type FundedBooksForTurn,
  type WithNationalBalanceSource,
} from "./fundedCountryViewRules";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

export async function loadFundedCountryBooks(
  db: Db,
  turn: number | null | undefined,
  worldEpochId?: string | null
): Promise<FundedBooksForTurn | null> {
  if (typeof turn !== "number" || !Number.isFinite(turn)) return null;
  const epoch =
    worldEpochId ??
    (await gameStateCollection(db).findOne({ _id: "current" }, { projection: { worldEpochId: 1 } }))
      ?.worldEpochId;
  if (!epoch) return null;
  const doc = await db
    .collection<{ _id: string; books?: FundedCountryBookRow[] }>(PRODUCER_MARKET_OUTCOMES)
    .findOne({ _id: `${epoch}:${turn}` }, { projection: { books: 1 } });
  return doc?.books && doc.books.length > 0 ? { turn, rows: doc.books } : null;
}

/**
 * Price rows with national supply and demand taken from the funded book of
 * their turn when one exists. Each row says which source it carries.
 */
export async function withFundedNationalBalances<
  T extends {
    commodity: string;
    turn?: number;
    nationalSupply?: Record<string, number>;
    nationalDemand?: Record<string, number>;
  },
>(
  db: Db,
  prices: readonly T[],
  worldEpochId?: string | null
): Promise<WithNationalBalanceSource<T>[]> {
  const books = await loadFundedCountryBooks(db, priceRowsTurn(prices), worldEpochId);
  const byCommodity = books ? fundedCountryMarketsByCommodity(books.rows) : new Map();
  return prices.map((p) => overlayFundedNationalBalances(p, books, byCommodity));
}
