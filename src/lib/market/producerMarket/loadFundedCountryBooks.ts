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
import type { FundedCountryBookRow } from "./fundedBookRules";
import {
  overlayFundedNationalBalances,
  fundedCountryMarketsByCommodity,
  priceRowsTurn,
  type FundedBooksForTurn,
  type WithNationalBalanceSource,
} from "./fundedCountryViewRules";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { producerMarketOutcomesCollection } from "@/lib/db/repositories/producerMarketOutcomes";

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
  const doc = await producerMarketOutcomesCollection<{
    _id: string;
    books?: FundedCountryBookRow[];
  }>(db).findOne({ _id: `${epoch}:${turn}` }, { projection: { books: 1 } });
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

/** World supply and demand of one good on one turn: its country books summed. */
export interface WorldBookTotals {
  supply: number;
  demand: number;
}

/**
 * World supply and demand per good and turn, each the sum of that turn's
 * funded country books (the traded market, background economy included), on
 * the books' daily basis. Keyed `${commodity}:${turn}`; turns without a funded
 * book are absent, so callers keep their stored figure for those.
 */
export async function loadWorldBookTotals(
  db: Db,
  input: {
    commodities: readonly string[];
    fromTurn: number;
    toTurn: number;
    worldEpochId?: string | null;
  }
): Promise<Map<string, WorldBookTotals>> {
  const out = new Map<string, WorldBookTotals>();
  if (input.commodities.length === 0 || !(input.toTurn >= input.fromTurn)) return out;
  const epoch =
    input.worldEpochId ??
    (await gameStateCollection(db).findOne({ _id: "current" }, { projection: { worldEpochId: 1 } }))
      ?.worldEpochId;
  if (!epoch) return out;
  const ids: string[] = [];
  for (let t = input.fromTurn; t <= input.toTurn; t++) ids.push(`${epoch}:${t}`);
  const rows = await producerMarketOutcomesCollection(db)
    .aggregate<{ _id: { turn: number; commodity: string }; supply: number; demand: number }>([
      { $match: { _id: { $in: ids } } },
      {
        $project: {
          turn: 1,
          books: {
            $filter: {
              input: { $ifNull: ["$books", []] },
              as: "b",
              cond: { $in: ["$$b.commodity", [...input.commodities]] },
            },
          },
        },
      },
      { $unwind: "$books" },
      {
        $group: {
          _id: { turn: "$turn", commodity: "$books.commodity" },
          supply: { $sum: "$books.supply" },
          demand: { $sum: "$books.demand" },
        },
      },
    ])
    .toArray();
  for (const r of rows)
    out.set(`${r._id.commodity}:${r._id.turn}`, { supply: r.supply, demand: r.demand });
  return out;
}
