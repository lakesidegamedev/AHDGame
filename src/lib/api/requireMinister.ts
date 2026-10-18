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
import { getHeadOfGovernmentCharacterId } from "@/lib/api/headOfGovernment";

export type MinisterAuth = {
  countryId: CountryId;
  /** Cabinet seat ID, "head_of_government", or "admin" for a trade override. */
  positionId: string;
  characterId: ObjectId;
  characterName: string;
};
export type MinisterResult =
  { ok: true; auth: MinisterAuth } | { ok: false; response: NextResponse };

/** Resolve the player-held ministry, then the head of government for a vacant/NPP seat. */
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
  const deny = (fallback = false): MinisterResult => ({
    ok: false,
    response: NextResponse.json(
      forbidden(
        `Only the ${countryId} ${ministry} minister${fallback ? " or head of government" : ""} may perform this action.`
      ).toJson(),
      { status: 403 }
    ),
  });

  // Trade overrides still acquire the database, but do not read any office holders.
  if (ministry === "trade" && isAdmin) return authorize("admin");
  if (positionId) {
    // Retain the trade guard's existing async boundary before reading the seat.
    const cabinetCol =
      ministry === "trade"
        ? await getCabinetMembersCollection(database)
        : getCabinetMembersCollection(database);
    const member = await cabinetCol.findOne({ countryId, positionId });
    const holderCharacterId = member?.characterId ?? null;
    if (holderCharacterId) {
      return holderCharacterId.toString() === actorCharacterId.toString()
        ? authorize(positionId)
        : deny();
    }
  }
  // Canonical lookup handles presidential, parliamentary, and legacy government records.
  const hogCharId = await getHeadOfGovernmentCharacterId(database, countryId);
  return hogCharId && hogCharId.toString() === actorCharacterId.toString()
    ? authorize("head_of_government")
    : deny(true);
}
