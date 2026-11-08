/**
 * Acting-chair authority helpers.
 *
 * When `chairId` is null and `viceChairId` is set, the vice-chair inherits
 * all chair AUTHORITY (Chair Office access, parliamentary PM proposal,
 * coalition actions, etc.) until a new chair is elected or appointed. The
 * vice-chair does not become the chair: `chairId` stays null and their role
 * is unchanged; only acting authority expands.
 *
 * Use for AUTHORIZATION checks. For IDENTITY display, read `party.chairId`.
 */

import type { ObjectId } from "mongodb";
import type { PoliticalParty } from "@/lib/db/types";

/**
 * Returns the character ID that currently holds chair AUTHORITY for the
 * party. When the chair slot is filled, returns that. When chair is
 * vacant but the vice-chair slot is filled, returns the vice-chair
 * (acting as chair). Otherwise null.
 *
 * Use in authorization paths. Do NOT use for identity display.
 */
export function getActingChairId(
  party: Pick<PoliticalParty, "chairId" | "viceChairId">
): ObjectId | null {
  if (party.chairId) return party.chairId;
  if (party.viceChairId) return party.viceChairId;
  return null;
}

/**
 * True when `characterId` currently holds chair authority for `party` —
 * either as the seated chair or as the vice-chair acting in the chair's
 * absence. Returns false when the chair slot is filled by someone else,
 * when both slots are vacant, or when `characterId` is null.
 */
export function canActAsChair(
  party: Pick<PoliticalParty, "chairId" | "viceChairId">,
  characterId: ObjectId
): boolean {
  const acting = getActingChairId(party);
  return acting != null && acting.equals(characterId);
}

/**
 * True when the vice-chair is currently ACTING as chair (i.e. chair
 * slot is vacant AND vice-chair slot is filled). Useful for UI
 * affordances that should warn the player they're operating in an
 * acting capacity (e.g. "Chair Office (acting)" tab label).
 */
export function isViceChairActing(party: Pick<PoliticalParty, "chairId" | "viceChairId">): boolean {
  return party.chairId == null && party.viceChairId != null;
}
