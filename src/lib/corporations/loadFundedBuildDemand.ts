/**
 * Funded build advice reads the latest compact settlement summary in the current
 * world. loadFundedBuildDemand exposes its source turn and scoped buyer demand.
 */
import { getGameStateCollection } from "@/lib/db/collections/gameState";
import type { Db } from "mongodb";
import type { GameState } from "@/lib/db/types";
import type {
  FundedCountryBookRow,
  FundedRegionalBookRow,
} from "@/lib/market/producerMarket/fundedBookRules";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import { fundedBuildDemand } from "./rules/fundedBuildDemand";
import { producerMarketOutcomesCollection } from "@/lib/db/repositories/producerMarketOutcomes";

/** One small indexed summary read, never decode full producer receipts on a page. */
export async function loadFundedBuildDemand(
  db: Db,
  observed?: Pick<GameState, "currentTurn" | "worldEpochId"> | null
) {
  const state =
    observed ??
    (await (
      await getGameStateCollection(db)
    ).findOne({ _id: "current" }, { projection: { currentTurn: 1, worldEpochId: 1 } }));
  if (!state?.worldEpochId) return null;
  const doc = await producerMarketOutcomesCollection<{
    _id: string;
    turn: number;
    books?: FundedCountryBookRow[];
    regionalBuildBooks?: FundedRegionalBookRow[];
  }>(db).findOne(
    {
      _id: {
        $in: [
          `${state.worldEpochId}:${state.currentTurn}`,
          `${state.worldEpochId}:${state.currentTurn - 1}`,
        ],
      },
    },
    { sort: { turn: -1 }, projection: { turn: 1, books: 1, regionalBuildBooks: 1 } }
  );
  if (!doc) return null;
  return {
    turn: doc.turn,
    rows: (
      supply: Parameters<typeof fundedBuildDemand>[0]["supply"],
      stateId: string,
      countryId: string
    ) =>
      fundedBuildDemand({
        supply,
        stateId,
        countryId,
        countries: doc.books ?? [],
        regions: doc.regionalBuildBooks,
        regionalUnitScale: TURNS_PER_DAY,
      }),
  };
}
