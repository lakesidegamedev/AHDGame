import type { CountryId } from "@/lib/constants/countries";
import type { LegacyComponents, LegacyExitReason } from "@/lib/government/rules/leaderLegacy";

/**
 * One departed head of government's legacy (`leaderLegacies`). Written once,
 * when the sitting head changes; the effect it gives their party decays from
 * `endTurn` and is read through `src/lib/government/leaderLegacy.ts`.
 */
export interface LeaderLegacy {
  /** `${countryId}:${leaderKey}:${startTurn ?? "unknown"}`, so a retried turn writes it once. */
  _id: string;
  countryId: CountryId;
  /** Character id, or `npp:<id>` for an autonomous leader. */
  leaderKey: string;
  leaderName: string;
  /** Sequential id of the leader's party, as a string; null when they had none. */
  partyId: string | null;
  startTurn: number | null;
  endTurn: number;
  reason: LegacyExitReason;
  /** -100..100. */
  score: number;
  components: LegacyComponents;
  /** Inputs the score was computed from, kept so the page can explain it. */
  inputs: {
    tenureTurns: number;
    exitApproval: number | null;
    lawsEnacted: number;
    crisisPoints: number;
    scarMagnitude: number;
  };
  /** Party vote-share shift at departure, percent. */
  votePct: number;
  /** Governing-party approval shift at departure, points. */
  approvalPoints: number;
  createdAt: Date;
}
