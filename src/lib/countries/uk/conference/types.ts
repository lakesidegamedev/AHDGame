import type { ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { RulesetAmendmentPatch } from "@/lib/countries/uk/leadership/rules";

/** Lifecycle of one annual party conference. */
export type ConferenceStatus = "scheduled" | "open" | "completed" | "expired";

export type ConferenceProposalStatus = "voting" | "ratified" | "rejected";

export type ConferenceMotionStatus = "voting" | "passed" | "failed" | "void";

/** How a conference reached its terminal state. */
export type ConferenceOutcomeKind = "ratified" | "closedWithoutRatification" | "missed";

/**
 * The standing-platform proposal before the conference: pledge catalog ids
 * in the SAME shape as an election manifesto (MANIFESTO_PLEDGE_COUNT valid
 * catalog entries, no dupes), voted by party members and, on ratification,
 * written to the party's standing-platform row.
 */
export interface ConferencePlatformProposal {
  pledgeIds: string[];
  proposedByCharacterId: ObjectId;
  proposedByName: string;
  proposedAtTurn: number;
  /** Aye = ratify the platform. */
  votesFor: number;
  /** Nay = reject the platform. */
  votesAgainst: number;
  votes: Record<string, "aye" | "nay">;
  status: ConferenceProposalStatus;
  resolvedAtTurn: number | null;
}

/**
 * Committee business at conference: a leadership-ruleset amendment.
 * Committee proposes, committee votes, safe bounds and cooldown enforced on apply.
 */
export interface ConferenceRulesMotion {
  motionId: string;
  patch: RulesetAmendmentPatch;
  proposedByCharacterId: ObjectId;
  proposedByName: string;
  createdAtTurn: number;
  votesFor: number;
  votesAgainst: number;
  votes: Record<string, "aye" | "nay">;
  status: ConferenceMotionStatus;
  /** Why a motion voided instead of applying (e.g. cooldown active). */
  voidReason: string | null;
  resolvedAtTurn: number | null;
}

export type ConferenceHistoryKind =
  | "scheduled"
  | "opened"
  | "platformProposed"
  | "platformRatified"
  | "platformRejected"
  | "motionProposed"
  | "motionPassed"
  | "motionFailed"
  | "motionVoided"
  | "completed"
  | "expired"
  | "payoffApplied";

export interface ConferenceHistoryEntry {
  turn: number;
  at: Date;
  kind: ConferenceHistoryKind;
  actorCharacterId?: ObjectId;
  actorName?: string;
  detail: string;
}

/**
 * One annual conference for one UK party. One row per
 * `<countryId>:<partySequentialId>:<conferenceYear>`.
 *
 * The standing platform is ratified HERE, between elections; the leader
 * finalises the election manifesto FROM it at dissolution/election call
 * (see manifestoLifecycle). The two are never the same row: ratifying a
 * platform never writes the manifestos collection.
 */
export interface UKPartyConference {
  _id: string;
  countryId: CountryId;
  partyId: string;
  partyName: string;
  /** 1-based game-calendar year index (turns 1-48 = year 1). */
  conferenceYear: number;
  status: ConferenceStatus;
  /** Turn the conference opens for agenda + voting. */
  opensAtTurn: number;
  /** Turn voting closes and the conference resolves. */
  votingClosesTurn: number;
  openedAtTurn: number | null;
  proposal: ConferencePlatformProposal | null;
  motions: ConferenceRulesMotion[];
  /** True once a platform ratified at this conference. */
  ratified: boolean;
  outcome: ConferenceOutcomeKind | null;
  /** True once the completion payoff was attempted (applied or skipped). */
  payoffDue: boolean;
  payoffAppliedTurn: number | null;
  /**
   * Crash-recovery receipts. Standalone Mongo has no multi-document
   * transactions, so resolution and payoff are claim + reconcile protocols:
   *
   * - `status === "completed" && outcome === null` is the durable recovery
   *   state: votes are frozen and any caller may resume the fill; the
   *   outcome-null guard lets exactly one win.
   * - Platform and leadership side effects reconcile against these receipts;
   *   `appliedMotionIds` / `platformAppliedTurn` make replays skip completed
   *   effects instead of double-applying them.
   * - A race-path void is receipt-pending, not terminal, until a revisit
   *   adopts the receipt or confirms the void terminal.
   * - Payoff intent is fixed at claim time so resumes replay the same intent.
   *   `payoffSettledTurn` is the driver gate: payoff is owed while null.
   *
   * All fields optional so older rows read as "no receipts yet".
   */
  /** Motion ids whose leadership-ruleset side effect completed. */
  appliedMotionIds?: string[];
  /** Turn the standing-platform upsert was confirmed durable (null = owed). */
  platformAppliedTurn?: number | null;
  /** Payoff intent: cohesion grant fixed at claim from the claim-time party. */
  payoffCohesionPs?: number | null;
  /**
   * Frozen electorate roll. Standalone Mongo has no cross-collection atomics, so
   * party/member rows read at vote time cannot be rechecked inside the single-document
   * conference write. The conference therefore carries its own roll, frozen once at the
   * first agenda or resolution touch and never rewritten:
   *
   * - `eligibleMemberIds`: player party members at freeze time.
   * - `eligibleCommitteeIds`: committee voter-set ids at freeze time.
   *
   * Casting or changing a vote requires roll AND live membership; leaving purges no
   * recorded ballot. Quorum denominators are frozen roll sizes, so joins and removals
   * cannot move the bar mid-conference. Optional so pre-change rows freeze on first
   * post-change touch; a freeze that cannot persist falls back to live counts.
   */
  eligibleMemberIds?: string[] | null;
  /** Committee roll for motion votes; frozen together with eligibleMemberIds. */
  eligibleCommitteeIds?: string[] | null;
  /** Turn the cohesion credit reconciled (applied or deterministically skipped). */
  payoffCohesionAppliedTurn?: number | null;
  /** Payoff intent: approval groups fixed at claim (empty when gated off). */
  payoffApprovalGroups?: string[];
  /** Turn every payoff side effect verified durable. Null = payoff owed. */
  payoffSettledTurn?: number | null;
  history: ConferenceHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A party's standing platform: the pledge set its last conference ratified.
 * One row per `<countryId>:<partySequentialId>`, upserted on ratification.
 * The election-manifesto handoff seeds a missing leader draft FROM these
 * ids; the leader's own complete draft always wins.
 */
export interface UKPartyPlatform {
  _id: string;
  countryId: CountryId;
  partyId: string;
  pledgeIds: string[];
  ratifiedConferenceId: string;
  ratifiedYear: number;
  ratifiedAtTurn: number;
  createdAt: Date;
  updatedAt: Date;
}
