import type { ObjectId, Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { requireMinister, type MinisterAuth, type MinisterResult } from "./requireMinister";

export type TradeMinisterAuth = MinisterAuth;
export type TradeMinisterResult = MinisterResult;

/**
 * Authorize the seated (or acting) trade minister. The head of government has no
 * substitution over the seat. Admins may act for any trade ministry; routes
 * handle the action-charge exemption. Returns the existing 403 response on failure.
 */
export async function requireTradeMinister(
  countryId: CountryId,
  actorCharacterId: ObjectId,
  actorCharacterName: string,
  db?: Db,
  isAdmin = false
): Promise<TradeMinisterResult> {
  return requireMinister("trade", countryId, actorCharacterId, actorCharacterName, db, isAdmin);
}
