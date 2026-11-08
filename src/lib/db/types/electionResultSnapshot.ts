import type { ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type {
  NationalResults,
  ResultsCandidate,
  ResultsSummary,
  ResultsUnit,
} from "@/lib/elections/liveResults/types";

/**
 * Schema version of `ElectionResultSnapshot`.
 *
 * Bump when the stored shape changes. The results route serves a snapshot only
 * when its version matches, and otherwise falls back to live computation, so an
 * unreadable snapshot degrades to the pre-snapshot behaviour rather than
 * rendering a shape the build does not understand.
 */
export const ELECTION_RESULT_SNAPSHOT_VERSION = 1 as const;

/**
 * A frozen election-night result, written once when a race resolves. The snapshot
 * is the authority for any finished race: live results rebuild electoral weights
 * from era-gated apportionment and read party names/colours live, so a re-rendered
 * old race would show totals and branding never in force when it was decided.
 *
 * Stores only settled data: per-unit results, candidate roster with party identity
 * as it stood, electoral-college totals, and national aggregation. Per-request or
 * per-viewer fields (`currentTurn`, `finalHour`, `isAdmin`, `lastUpdated`) are
 * deliberately absent and recomputed on every read.
 */
export interface ElectionResultSnapshot {
  _id: ObjectId;
  /** The race this froze. Uniquely indexed — one snapshot per election. */
  electionId: ObjectId;
  countryId: CountryId;
  electionType: string;
  cycle: number;
  /** LARP year of the race, copied from the election doc. Null on legacy rows. */
  electionYear: number | null;
  schemaVersion: typeof ELECTION_RESULT_SNAPSHOT_VERSION;
  capturedAt: Date;
  /** Game turn the capture ran on, for forensics. */
  capturedAtTurn: number;
  /** President only: total electoral votes under the map in force at the time. */
  totalEv?: number;
  /** President only: the majority threshold that actually governed the race. */
  evNeeded?: number;
  totalSeats: number;
  ballotLabel?: string;
  candidates: ResultsCandidate[];
  units: ResultsUnit[];
  national: NationalResults | null;
  summary: ResultsSummary;
}
