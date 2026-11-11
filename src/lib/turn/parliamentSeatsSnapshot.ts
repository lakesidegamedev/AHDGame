import type { Db } from "mongodb";
import type { ElectedOfficial } from "@/lib/db/types";
import { workerConfig } from "@/lib/config/worker";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { parliamentSeatsHistoryCollection } from "@/lib/db/repositories/parliamentSeatsHistory";
import type { Document } from "mongodb";

/**
 * Turns of seat history retained. 96 (two years at 48 turns/year) is the right
 * window for the live game's trend chart, but it truncates a long sim: a
 * 1000-turn run would keep only its last two years, so "who controlled the
 * legislature across twenty years" is unanswerable. The sim harness raises this
 * via SIM_SEAT_HISTORY_CAP; the live game is untouched by the default.
 */
const HISTORY_CAP = (() => {
  const raw = Number(workerConfig.simSeatHistoryCap());
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 96;
})();

interface ParliamentSeatsSnapshot {
  _id: string;
  countryId: string;
  officeType: string;
  party: string;
  turn: number;
  seats: number;
  createdAt: Date;
  executiveHolder?: string | null;
}

/**
 * Snapshot seat counts by (country, officeType, party) once per turn using
 * the same storage pattern as snapshotPartyHistory: one doc per composite key
 * per turn, bulkWrite upsert, prune past HISTORY_CAP.
 *
 * Covers every country, not just active ones: the sim harness needs full
 * coverage of whatever the backfill populated, including coming-soon countries.
 *
 * Seat count is summed via seatsHeld (falling back to 1 per doc), NOT a raw
 * electedOfficials doc count. Multi-member offices can have one record standing
 * for several seats.
 */
export async function snapshotParliamentSeats(db: Db, turn: number): Promise<number> {
  const rows = await electedOfficialsCollection(db)
    .aggregate<{
      _id: { countryId: string; officeType: string; party: string };
      seats: number;
      executiveHolder?: string | null;
    }>([
      { $match: { $or: [{ characterId: { $ne: null } }, { nppId: { $exists: true } }] } },
      {
        $group: {
          _id: {
            countryId: { $ifNull: ["$countryId", "US"] },
            officeType: "$officeType",
            party: { $ifNull: ["$party", "independent"] },
          },
          seats: { $sum: { $ifNull: ["$seatsHeld", 1] } },
          executiveHolder: {
            $first: {
              $cond: [
                { $in: ["$officeType", ["president", "vicePresident"]] },
                {
                  $cond: [
                    { $ne: [{ $ifNull: ["$characterId", null] }, null] },
                    { $concat: ["player:", { $toString: "$characterId" }] },
                    { $concat: ["npp:", { $toString: "$nppId" }] },
                  ],
                },
                null,
              ],
            },
          },
        },
      },
    ])
    .toArray();

  if (rows.length === 0) return 0;

  const now = new Date();
  const ops = rows.map((row) => {
    const { countryId, officeType, party } = row._id;
    const id = `${countryId}:${officeType}:${party}:${turn}`;
    return {
      updateOne: {
        filter: { _id: id },
        update: {
          $set: {
            _id: id,
            countryId,
            officeType,
            party,
            turn,
            seats: row.seats,
            ...(["president", "vicePresident"].includes(officeType)
              ? { executiveHolder: row.seats === 1 ? (row.executiveHolder ?? null) : null }
              : {}),
            createdAt: now,
          },
        },
        upsert: true,
      },
    };
  });

  await parliamentSeatsHistoryCollection<ParliamentSeatsSnapshot>(db).bulkWrite(ops, {
    ordered: false,
  });

  const minTurn = Math.max(1, turn - HISTORY_CAP + 1);
  await parliamentSeatsHistoryCollection<Document>(db).deleteMany({ turn: { $lt: minTurn } });

  return ops.length;
}
