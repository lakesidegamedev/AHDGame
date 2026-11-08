import type { Db, ObjectId } from "mongodb";
import type { Character, User } from "@/lib/db/types";
import {
  OFFICER_SEAT_FIELDS,
  seatedOfficerIds,
  type OfficerSeatIds,
} from "@/lib/parties/rules/bannedOfficerSeats";

/** Which of these characters belong to a banned account. */
export async function loadBannedCharacterIds(
  db: Db,
  characterIds: readonly (ObjectId | null | undefined)[]
): Promise<Set<string>> {
  const ids = [
    ...new Map(characterIds.filter((id): id is ObjectId => !!id).map((id) => [id.toString(), id])),
  ].map(([, id]) => id);
  if (ids.length === 0) return new Set();
  const characters = await db
    .collection<Character>("characters")
    .find({ _id: { $in: ids } }, { projection: { _id: 1, userId: 1 } })
    .toArray();
  if (characters.length === 0) return new Set();
  const banned = await db
    .collection<User>("users")
    .find(
      { _id: { $in: characters.map((c) => c.userId) }, isBanned: true },
      { projection: { _id: 1 } }
    )
    .toArray();
  const bannedUsers = new Set(banned.map((u) => u._id.toString()));
  return new Set(
    characters.filter((c) => bannedUsers.has(c.userId.toString())).map((c) => c._id.toString())
  );
}

/**
 * Blank the seats a banned account still holds on this request's copy of a
 * party or state organisation, so every later check on it sees them vacant.
 * Read-time only: nothing is written back.
 */
export async function vacateBannedOfficerSeats<T extends OfficerSeatIds<ObjectId>>(
  db: Db,
  seats: T | null | undefined
): Promise<T | null | undefined> {
  if (!seats) return seats;
  const banned = await loadBannedCharacterIds(
    db,
    OFFICER_SEAT_FIELDS.map((field) => seats[field])
  );
  if (banned.size === 0) return seats;
  for (const field of OFFICER_SEAT_FIELDS) {
    const id = seats[field];
    if (id && banned.has(id.toString())) (seats as OfficerSeatIds<ObjectId>)[field] = null;
  }
  return seats;
}

/** Distinct officers actually seated, banned holders excluded. */
export async function countSeatedOfficersExcludingBanned(
  db: Db,
  seats: OfficerSeatIds<ObjectId> | null | undefined
): Promise<number> {
  if (!seats) return 0;
  const banned = await loadBannedCharacterIds(
    db,
    OFFICER_SEAT_FIELDS.map((field) => seats[field])
  );
  return seatedOfficerIds(seats, banned).length;
}
