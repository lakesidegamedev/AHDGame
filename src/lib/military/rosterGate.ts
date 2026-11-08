import type { Db } from "mongodb";
import type { ConflictDoc } from "@/lib/db/types/conflict";
import { getConflict } from "@/lib/db/collections/conflicts";
import { RESERVE_THEATER_ID } from "@/lib/military/theaters";

/**
 * May this country place forces or command at this conflict?
 *
 * For a `cold_war` conflict: only if it is ALREADY on a roster. Rosters are reached
 * only via `joinSide`, which for a proxy war is reached only from a passed Join
 * Conflict bill. Without this gate, `sideOf`'s bloc fallback lets any bloc member
 * post a general and be enrolled with no vote and no bill.
 *
 * Other conflict types are unchanged: the backer fallback is how allies join an
 * ongoing interstate war, shipped behaviour outside this design's scope.
 */
export function canEnterTheatre(
  country: string,
  conflict: Pick<ConflictDoc, "type" | "sideA" | "sideB">
): boolean {
  if (conflict.type !== "cold_war") return true;
  return (
    (conflict.sideA.countries as string[]).includes(country) ||
    (conflict.sideB.countries as string[]).includes(country)
  );
}

/** Why a posting was refused, so each door can keep its own copy. */
export type PostingVerdict = "ok" | "unknown-theatre" | "not-a-belligerent";

/**
 * The posting doors' single check: the theatre must exist AND, for a proxy war, this
 * country must already be a belligerent.
 *
 * One helper rather than the condition copied into each route — the doors are the
 * kind of thing that gets added to, and a gate that lives in three places is a gate
 * with three chances to be forgotten.
 */
export async function verifyPosting(
  db: Db,
  country: string,
  theaterId: string
): Promise<PostingVerdict> {
  if (theaterId === RESERVE_THEATER_ID) return "ok";
  const conflict = await getConflict(db, theaterId);
  if (!conflict) return "unknown-theatre";
  return canEnterTheatre(country, conflict) ? "ok" : "not-a-belligerent";
}
