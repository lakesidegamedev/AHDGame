import type { CountryId } from "../../constants/countries";

/**
 * Per-region (state) government-approval rating with turn history.
 *
 * One document per state, written each turn by `snapshotApprovalHistory`
 * alongside the national `governmentApprovals` snapshot. Mirrors
 * {@link import("./governmentApproval").GovernmentApproval} at region scope so
 * the regional metrics tab can chart approval over time.
 *
 * The `history` array keeps the last 20 turns for charting.
 */
export interface StateApprovalHistory {
  /** Country-qualified key; legacy unqualified keys are rekeyed by the next snapshot. */
  _id: string;
  stateId: string;
  countryId: CountryId;
  /** 0–100: this region's approval at the latest snapshot */
  approvalRating: number;
  /** Unclamped score keeps compensating decisions reversible at 0 and 100. */
  approvalRawRating?: number;
  baseApproval?: number;
  activeModifiers?: import("@/lib/approval/activeModifier").ActiveModifier[];
  /** Durable additive decisions, kept separate from recomputed performance. */
  approvalAdjustment?: number;
  /** Atomic country snapshot receipt; repeat runs do not advance smoothing. */
  lastSnapshotTurn?: number;
  /** Crisis approval writes already applied here, so a repeated write is a no-op. */
  appliedCrisisEffects?: string[];
  /** Turn-by-turn history (most recent last, capped at 20 entries) */
  history: Array<{
    turn: number;
    approval: number;
    net: number;
  }>;
  updatedAt: Date;
}
