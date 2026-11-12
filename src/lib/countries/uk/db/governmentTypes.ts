import type { ObjectId } from "mongodb";
import type { GovernmentConfidencePoint } from "@/lib/db/types/governmentFormation";

/**
 * UK Government document - tracks current PM and ruling party.
 * Single document with _id: "current"
 */
export interface UKGovernment {
  _id: "current";
  /** Character ID of current Prime Minister (null if no PM) */
  pmCharacterId: ObjectId | null;
  /** Party slug of ruling party */
  rulingParty: string;
  /** Active confidence vote ID (if any) */
  confidenceVoteId?: ObjectId;
  /** When current government was formed */
  formedAt?: Date;
  /** Last no-confidence vote timestamp (for cooldown) */
  lastNoConfidenceVoteAt?: Date;
  /**
   * Government confidence gauge, 0..100 (undefined means full). Running stability
   * value fed by lost votes, budget defeat, broken promises and cabinet churn;
   * dissolution fires only when it bottoms out. A new government inherits the
   * prior value plus a modest formation bonus.
   */
  confidenceGauge?: number;
  confidenceGaugeUpdatedAt?: Date;
  /** Bounded snapshots for the public government-confidence trend chart. */
  confidenceGaugeHistory?: UKGovernmentConfidencePoint[];
  updatedAt: Date;
}

/** Backward-compatible alias for the legacy UK singleton snapshot shape. */
type UKGovernmentConfidencePoint = GovernmentConfidencePoint;
