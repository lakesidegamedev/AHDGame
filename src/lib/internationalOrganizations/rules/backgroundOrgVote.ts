/**
 * Scripted organisation votes for background countries (#5702).
 *
 * A background country has no NPP government to plan its foreign policy and no
 * trade minister to cast a ballot, but it keeps its seats in the EU, NATO, the
 * UN and the rest. This script gives it a vote. Four things decide it:
 *
 * - alignment: how close the voter stands to the proposer, the sanctions or
 *   statement target, the aid recipient or the chair candidate, measured as the
 *   overlap of their bloc shares;
 * - ideology: the economic stance of the ruling party, when the national
 *   politics model has one (right of centre favours free trade and is cooler on
 *   aid);
 * - economic interest: trade exposure prices sanctions and free trade, fiscal
 *   capacity prices aid and dues;
 * - bloc pressure: the balance of the votes already cast, so a member follows
 *   a bloc that has made up its mind.
 *
 * A country never votes to sanction or condemn itself, and always takes aid or
 * an endorsement aimed at it. The vote is deterministic: the only noise is a
 * small hash of the ballot and the voter.
 *
 * Pure: plain data in, plain data out.
 */
import type { OrgBallotKind } from "@/lib/internationalOrganizations/resolutionRules";
import { ballotIsPlayerOnly } from "@/lib/internationalOrganizations/resolutionRules";
import type { ProposalVote } from "@/lib/db/types/internationalOrganization";

/** Score at or above which the voter says yes; at or below its negative, no. */
export const BACKGROUND_VOTE_THRESHOLD = 0.1;
/** Baseline willingness to go along with ordinary bloc business. */
export const BACKGROUND_COOPERATION = 0.1;
/** Weight of the cast-vote balance. */
export const BLOC_PRESSURE_WEIGHT = 0.3;
/** Weight of the voter's alignment with the proposer. */
export const PROPOSER_AFFINITY_WEIGHT = 0.2;
/** Largest deterministic swing either way. */
export const BACKGROUND_VOTE_JITTER = 0.05;

/** Bloc shares (0-100) plus the non-aligned remainder. */
export interface AlignmentShares {
  shares: Partial<Record<string, number>>;
  nonAligned: number;
}

export interface BackgroundVoterProfile {
  countryId: string;
  /** 0-1 share of the economy exposed to world trade. */
  tradeExposure: number;
  /** 0-1 fiscal extractive capacity. */
  fiscalCapacity: number;
  /** Ruling party's economic position, -5 (left) to +5 (right); null when unknown. */
  rulingEconomic: number | null;
}

export interface BackgroundBallot {
  /** Stable ballot id, used for the deterministic swing. */
  id: string;
  kind: OrgBallotKind;
  proposerId: string | null;
  /** Sanctions target or joint statement subject. */
  subjectId?: string | null;
  stance?: "endorse" | "condemn" | null;
  /** Sanctions on every commodity rather than one. */
  sanctionsAll?: boolean;
  aidDonorId?: string | null;
  aidRecipientId?: string | null;
  /** Leadership election candidate's country. */
  candidateCountryId?: string | null;
  votes: readonly { countryId: string; vote: ProposalVote }[];
}

export interface BackgroundVoteBreakdown {
  cooperation: number;
  bloc: number;
  alignment: number;
  ideology: number;
  economic: number;
  jitter: number;
}

export interface BackgroundVoteDecision {
  vote: ProposalVote;
  score: number;
  breakdown: BackgroundVoteBreakdown;
}

const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

const finite = (value: number | null | undefined, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Whether background members are seated on, and script a vote for, this ballot. */
export function backgroundVotesOn(kind: OrgBallotKind): boolean {
  return !ballotIsPlayerOnly(kind);
}

/**
 * Overlap of two alignment distributions, 0 (opposite blocs) to 1 (identical).
 * Unknown on either side reads as 0.5, neither friend nor rival.
 */
export function alignmentAffinity(
  a: AlignmentShares | null | undefined,
  b: AlignmentShares | null | undefined
): number {
  if (!a || !b) return 0.5;
  const keys = new Set([...Object.keys(a.shares), ...Object.keys(b.shares)]);
  let overlap = Math.min(finite(a.nonAligned), finite(b.nonAligned));
  for (const key of keys) overlap += Math.min(finite(a.shares[key]), finite(b.shares[key]));
  return clamp(overlap / 100, 0, 1);
}

/** Deterministic 0-1 value from a string (FNV-1a). */
export function stableUnit(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0xffffffff;
}

function voteFromScore(score: number): ProposalVote {
  if (score >= BACKGROUND_VOTE_THRESHOLD) return "yes";
  if (score <= -BACKGROUND_VOTE_THRESHOLD) return "no";
  return "abstain";
}

function fixed(vote: ProposalVote): BackgroundVoteDecision {
  const score = vote === "yes" ? 1 : vote === "no" ? -1 : 0;
  return {
    vote,
    score,
    breakdown: { cooperation: 0, bloc: 0, alignment: 0, ideology: 0, economic: 0, jitter: 0 },
  };
}

/**
 * The scripted vote of one background member on one ballot, or null when the
 * ballot is one background members do not sit on.
 */
export function scriptBackgroundOrgVote(
  voter: BackgroundVoterProfile,
  ballot: BackgroundBallot,
  alignmentOf: (entityId: string) => AlignmentShares | null
): BackgroundVoteDecision | null {
  if (!backgroundVotesOn(ballot.kind)) return null;
  const self = voter.countryId;
  const own = alignmentOf(self);
  const affinity = (other: string | null | undefined): number =>
    other ? alignmentAffinity(own, alignmentOf(other)) : 0.5;

  // A country's answer to business aimed at itself is not a calculation.
  if (ballot.subjectId === self) {
    if (ballot.kind === "sanctions") return fixed("no");
    if (ballot.kind === "joint_statement") {
      return fixed(ballot.stance === "endorse" ? "yes" : "no");
    }
  }
  if (ballot.kind === "aid_package" && ballot.aidRecipientId === self) return fixed("yes");
  if (ballot.kind === "leadership_election" && ballot.candidateCountryId === self) {
    return fixed("yes");
  }

  let yes = 0;
  let no = 0;
  for (const cast of ballot.votes) {
    if (cast.countryId === self) continue;
    if (cast.vote === "yes") yes++;
    else if (cast.vote === "no") no++;
  }
  const bloc =
    BLOC_PRESSURE_WEIGHT * ((yes - no) / Math.max(1, yes + no)) +
    PROPOSER_AFFINITY_WEIGHT * (affinity(ballot.proposerId) - 0.5);

  const exposure = clamp(finite(voter.tradeExposure), 0, 1);
  const fiscal = clamp(finite(voter.fiscalCapacity), 0, 1);
  const right = voter.rulingEconomic == null ? 0 : clamp(voter.rulingEconomic / 5, -1, 1);

  let alignment = 0;
  let ideology = 0;
  let economic = 0;
  switch (ballot.kind) {
    case "sanctions":
      // Rivals get sanctioned, friends do not; the cost is the trade given up.
      alignment = 0.8 * (0.5 - affinity(ballot.subjectId));
      economic = -exposure * (ballot.sanctionsAll ? 0.5 : 0.2);
      break;
    case "joint_statement":
      alignment =
        ballot.stance === "endorse"
          ? 0.8 * (affinity(ballot.subjectId) - 0.5)
          : 0.8 * (0.5 - affinity(ballot.subjectId));
      break;
    case "free_trade_agreement":
      economic = 0.6 * exposure - 0.1;
      ideology = 0.15 * right;
      break;
    case "aid_package":
      if (ballot.aidDonorId === self) {
        economic = 1.2 * (fiscal - 0.35) - 0.2;
      } else {
        alignment = 0.4 * (affinity(ballot.aidRecipientId) - 0.5);
      }
      ideology = -0.1 * right;
      break;
    case "set_dues":
      economic = -0.15 * (1 - fiscal);
      break;
    case "leadership_election":
      alignment = 0.8 * (affinity(ballot.candidateCountryId) - 0.5);
      break;
    default:
      // Directives, posture and agency funding: ordinary bloc business.
      break;
  }

  const jitter = BACKGROUND_VOTE_JITTER * (2 * stableUnit(`${ballot.id}|${self}`) - 1);
  const score = BACKGROUND_COOPERATION + bloc + alignment + ideology + economic + jitter;
  return {
    vote: voteFromScore(score),
    score,
    breakdown: { cooperation: BACKGROUND_COOPERATION, bloc, alignment, ideology, economic, jitter },
  };
}
