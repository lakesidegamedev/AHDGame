/** Timer recalibration reads completed lower-chamber terms without moving Canadian snap clocks. */
import type { Db } from "mongodb";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { canadianRecalibrationAnchor } from "@/lib/countries/ca/rules/electionTimerRepair";
import { MS_PER_TURN } from "@/lib/constants/turnTime";

export async function loadRecalibrationHistory(db: Db, ref: Date, currentTurn: number) {
  const records = await electionsCollection(db)
    .find(
      {
        electionType: {
          $in: [
            "commons",
            "snap_commons",
            "shugiin",
            "snap_shugiin",
            "caCommons",
            "snap_caCommons",
          ],
        },
        status: { $in: ["completed", "resolved"] },
      },
      {
        projection: {
          countryId: 1,
          electionType: 1,
          state: 1,
          endTime: 1,
          endTurn: 1,
          shiftedScheduleEndTurn: 1,
          imposedSnap: 1,
        },
      }
    )
    .sort({ endTime: -1 })
    .toArray();
  const out = new Map<string, number>();
  const seen = new Set<string>();
  for (const e of records) {
    if (!e.endTime || !e.state || !e.countryId) continue;
    const type = e.electionType.replace(/^snap_/, "");
    const key = `${e.countryId}:${type}:${e.state}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const turnFromTime = (time: Date) =>
      currentTurn - Math.round((ref.getTime() - new Date(time).getTime()) / MS_PER_TURN);
    const owned = canadianRecalibrationAnchor(e, turnFromTime);
    const prior = owned === undefined ? turnFromTime(e.endTime) : owned;
    if (prior != null) out.set(key, prior);
  }
  return out;
}
