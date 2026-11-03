import { NextResponse } from "next/server";
import type { ObjectId, Db } from "mongodb";
import { forbidden } from "@/lib/api/errors";
import { getDb } from "@/lib/mongodb";
import type { CountryId } from "@/lib/constants/countries";
import {
  FOREIGN_AFFAIRS_POSITION_BY_COUNTRY,
  TRADE_MINISTER_POSITION_BY_COUNTRY,
} from "@/lib/constants/internationalOrganizations";
import { getCabinetMembersCollection } from "@/lib/db/collections/cabinetMembers";

export type MinisterAuth = {
  countryId: CountryId;
  /** Cabinet seat ID, or "admin" for a trade override. */
  positionId: string;
  characterId: ObjectId;
  characterName: string;
};
export type MinisterResult =
  { ok: true; auth: MinisterAuth } | { ok: false; response: NextResponse };

/**
 * Resolve the seated (or acting) holder of one of the shared ministry seats.
 *
 * Only that holder may act. The head of government has no substitution over a
 * cabinet seat: a vacant or NPP-held seat authorizes nobody until a minister is
 * appointed.
 */
export async function requireMinister(
  ministry: "foreign" | "trade",
  countryId: CountryId,
  actorCharacterId: ObjectId,
  actorCharacterName: string,
  db?: Db,
  isAdmin = false
): Promise<MinisterResult> {
  const database = db ?? (await getDb());
  const positions =
    ministry === "foreign"
      ? FOREIGN_AFFAIRS_POSITION_BY_COUNTRY
      : TRADE_MINISTER_POSITION_BY_COUNTRY;
  const positionId = positions[countryId] ?? null;
  const authorize = (positionId: string): MinisterResult => ({
    ok: true,
    auth: {
      countryId,
      positionId,
      characterId: actorCharacterId,
      characterName: actorCharacterName,
    },
  });
  const deny = (): MinisterResult => ({
    ok: false,
    response: NextResponse.json(
      forbidden(`Only the ${countryId} ${ministry} minister may perform this action.`).toJson(),
      { status: 403 }
    ),
  });

  // Trade overrides still acquire the database, but do not read any office holders.
  if (ministry === "trade" && isAdmin) return authorize("admin");
  if (!positionId) return deny();
  // Retain the trade guard's existing async boundary before reading the seat.
  const cabinetCol =
    ministry === "trade"
      ? await getCabinetMembersCollection(database)
      : getCabinetMembersCollection(database);
  const member = await cabinetCol.findOne({ countryId, positionId });
  const holderCharacterId = member?.characterId ?? null;
  return holderCharacterId && holderCharacterId.toString() === actorCharacterId.toString()
    ? authorize(positionId)
    : deny();
}
