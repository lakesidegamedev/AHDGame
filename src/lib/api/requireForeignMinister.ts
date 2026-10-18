import type { ObjectId, Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { requireMinister, type MinisterAuth, type MinisterResult } from "./requireMinister";

export type ForeignMinisterAuth = MinisterAuth;
export type ForeignMinisterResult = MinisterResult;

/**
 * Authorize the foreign minister, or the head of government when the seat is vacant/NPP-held.
 * A seated player minister has exclusive authority, including over the head of government.
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
