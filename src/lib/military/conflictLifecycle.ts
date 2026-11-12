import type { ConflictDoc, ConflictStatus } from "@/lib/db/types/conflict";

/** Statuses whose belligerents are still fighting and receive combat effects. */
export const FIGHTING_CONFLICT_STATUSES = [
  "active",
  "escalating",
  "winding_down",
] as const satisfies readonly ConflictStatus[];

/*
 * Is the FIGHTING over at this conflict?
 *
 * True for a resolved war and for one in `terms_pending`: the front has reached
 * a pole, every belligerent has stood down, and only the victor's term choice is
 * outstanding. `terms_pending` is deliberately not `"resolved"` so "still on the
 * books" readers keep counting it, but "still actionable" readers must say no.
 */
export function isConflictConcluded(status: ConflictStatus | undefined): boolean {
  return status === "resolved" || status === "terms_pending";
}

/**
 * How long after a war resolves its fog of war stays down.
 *
 * Ten game years at 48 turns a year. A resolved war is a historical record, but
 * the day it ends its order of battle is still a live intelligence picture of a
 * nation that may fight again next season. The delay lets the record open for
 * history once nothing in it could still be acted on.
 */
export const CONFLICT_ARCHIVE_DELAY_TURNS = 480;

/**
 * The turn a resolved war's full record opens to everyone, or null when it has no
 * such turn: the war has not resolved, or it resolved before `endTurn` was stamped.
 *
 * The legacy case is deliberately null rather than "never": a resolved war with no
 * `endTurn` has been an open record since it ended, and `isArchiveOpen` keeps it so.
 * Dating its fog from nothing would take back what was already public.
 */
export function archiveOpensTurn(
  c: Pick<ConflictDoc, "status"> & { endTurn?: number }
): number | null {
  if (c.status !== "resolved" || c.endTurn == null) return null;
  return c.endTurn + CONFLICT_ARCHIVE_DELAY_TURNS;
}

/** Whether a resolved war's record has opened to everyone as of `currentTurn`. */
export function isArchiveOpen(
  c: Pick<ConflictDoc, "status"> & { endTurn?: number },
  currentTurn: number
): boolean {
  if (c.status !== "resolved") return false;
  const opens = archiveOpensTurn(c);
  return opens === null || currentTurn >= opens;
}
