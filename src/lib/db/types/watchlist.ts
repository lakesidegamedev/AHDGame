import type { ObjectId } from "mongodb";

/**
 * `watchlist` - moderator/admin-pinned accounts. Deliberately tiny: a
 * bookmark, not a detector. Detection already runs continuously in
 * `actionAuditLog` and `altLinks`; watchlisting gives staff a standing
 * shortlist and a "what changed since I last looked" baseline.
 *
 * Read side: `src/lib/audit/watchlist.ts` (`buildWatchlistEntryView`,
 * `buildWatchlistViews`).
 */
export interface WatchlistEntry {
  _id: ObjectId;
  /** The watched account. Unique — an account can only be pinned once. */
  userId: ObjectId;
  /** Staff member (moderator or admin) who pinned it. */
  addedBy: ObjectId;
  /** Free-text note on why this account is being watched. */
  reason?: string;
  createdAt: Date;
  /**
   * The turn as of which this entry was last "reviewed" — the baseline the
   * alert computation compares `actionAuditLog`/`altLinks` `turn`s against
   * to decide what counts as new. Absent until something advances it (a
   * future digest/acknowledge feature; out of scope for this vertical — see
   * `src/lib/audit/watchlist.ts`). Nothing in the watchlist API mutates
   * this field today; `GET` only reads it.
   */
  lastNotifiedTurn?: number;
}
