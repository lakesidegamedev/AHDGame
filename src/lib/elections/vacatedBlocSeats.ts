import type { Db, ObjectId } from "mongodb";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import type { Document } from "mongodb";
import { ukCommonsVacanciesCollection } from "@/lib/db/repositories/ukCommonsVacancies";

/**
 * Office types elected as multi-seat party blocs: one `electedOfficials` row
 * carries a party's `seatsHeld` in a region. Single-seat offices never carry a
 * seat count on their vacancy tombstones.
 */
export const MULTI_SEAT_BLOC_OFFICE_TYPES = [
  "commons",
  "snap_commons",
  "bundestag",
  "snap_bundestag",
  "seanad",
] as const;

/** Bloc rows held by this character or NPP, read BEFORE the holder is cleared. */
export async function heldBlocRowIds(
  db: Db,
  holder: { characterId: ObjectId } | { nppId: ObjectId }
): Promise<ObjectId[]> {
  const rows = await electedOfficialsCollection<{ _id: ObjectId }>(db)
    .find(
      { ...holder, officeType: { $in: [...MULTI_SEAT_BLOC_OFFICE_TYPES] } },
      { projection: { _id: 1 } }
    )
    .toArray();
  return rows.map((row) => row._id);
}

/**
 * Drop the seat count from bloc rows whose holder was just cleared. Seat
 * tallies skip a row with no party, so a holder-less row that keeps
 * `seatsHeld` silently removes those seats from the chamber.
 *
 * A row a UK Commons vacancy points at is left alone: the by-election is sized
 * from it and seats its winners in new rows. Call this AFTER any vacancy for
 * these rows has been created. Rows that still have a holder are untouched.
 */
export async function releaseVacatedBlocSeats(
  db: Db,
  rowIds: readonly ObjectId[],
  now: Date
): Promise<number> {
  if (rowIds.length === 0) return 0;
  const anchored = await ukCommonsVacanciesCollection<{ officialId?: ObjectId }>(db)
    .find({ officialId: { $in: [...rowIds] } }, { projection: { officialId: 1 } })
    .toArray();
  const anchoredIds = new Set(anchored.map((doc) => String(doc.officialId)));
  const free = rowIds.filter((id) => !anchoredIds.has(String(id)));
  if (free.length === 0) return 0;
  const result = await electedOfficialsCollection<Document>(db).updateMany(
    {
      _id: { $in: free },
      officeType: { $in: [...MULTI_SEAT_BLOC_OFFICE_TYPES] },
      characterId: null,
      nppId: null,
      party: null,
      seatsHeld: { $exists: true },
    },
    { $unset: { seatsHeld: "" }, $set: { updatedAt: now } }
  );
  return result.modifiedCount;
}
