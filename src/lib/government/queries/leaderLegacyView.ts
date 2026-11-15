import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { getGameStateCollection } from "@/lib/db/collections";
import { getLeaderLegaciesCollection } from "@/lib/db/collections/leaderLegacies";
import { buildLegacyViewRow, type LeaderLegacyViewRow } from "@/lib/government/rules/leaderLegacy";

const MAX_ROWS = 6;

/** The most recent departed leaders' legacies for a country, optionally one party's only. */
export async function loadLeaderLegacyView(
  db: Db,
  countryId: CountryId,
  options: { partyId?: string | null } = {}
): Promise<LeaderLegacyViewRow[]> {
  const [rows, game] = await Promise.all([
    getLeaderLegaciesCollection(db)
      .find(options.partyId ? { countryId, partyId: options.partyId } : { countryId })
      .sort({ endTurn: -1 })
      .limit(MAX_ROWS)
      .toArray(),
    getGameStateCollection(db).then((games) =>
      games.findOne({ _id: "current" }, { projection: { currentTurn: 1 } })
    ),
  ]);
  const turn = game?.currentTurn ?? 0;
  return rows.map((row) => buildLegacyViewRow(row, turn));
}
