import type { ObjectId, Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { requireMinister, type MinisterAuth, type MinisterResult } from "./requireMinister";

export type ForeignMinisterAuth = MinisterAuth;
export type ForeignMinisterResult = MinisterResult;

/**
 * Authorize the seated (or acting) foreign minister. A seated player minister has
 * exclusive authority; the head of government has no substitution over the seat.
 * Returns the existing 403 response on failure.
 */
export async function requireForeignMinister(
  countryId: CountryId,
  actorCharacterId: ObjectId,
  actorCharacterName: string,
  db?: Db
): Promise<ForeignMinisterResult> {
  return requireMinister("foreign", countryId, actorCharacterId, actorCharacterName, db);
}
