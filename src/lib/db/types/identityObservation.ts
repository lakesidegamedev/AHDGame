import type { ObjectId } from "mongodb";

export const IDENTITY_OBSERVATIONS_COLLECTION = "identityObservations";

/** Evidence older than this no longer groups accounts or renders in the panel.
 * Deliberately separate from IDENTITY_SIGNAL_MAX_AGE_MS (30d), which governs
 * the scalar fields on `users`. Do not "reconcile" these by raising the
 * 30-day constant. */
export const IDENTITY_HISTORY_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export type IdentityTrack = "ip" | "fingerprint";

export type IdentityObservationSource =
  "register" | "login" | "oauth" | "record-fingerprint" | "session" | "backfill";

/** One contiguous run of observations of a single value for a single user.
 * A -> B -> A produces THREE documents, not two: returning to an earlier value
 * opens a new run so the panel can show each stretch with its own dates. */
export interface IdentityObservation {
  _id?: ObjectId;
  userId: ObjectId;
  track: IdentityTrack;
  value: string;
  firstSeen: Date;
  /** Also the TTL anchor, so a run is reaped 90 days after it ENDED. */
  lastSeen: Date;
  observations: number;
  source: IdentityObservationSource;
  /** False only for fingerprintHistory backfill rows, which carry no dates at
   * all. The UI renders those as "date unknown" rather than inventing one. */
  datesKnown: boolean;
}
