import type { ObjectId } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";

/**
 * Weekly contest definitions. Each kind runs one round at a time; the winner is
 * paid when the round ends and the next starts from a fresh baseline.
 *
 * - corp_growth_small / corp_growth_large: percent market-cap growth of a player-run
 *   private corporation, net of capital injected during the round. Tiers split at the
 *   median opening value.
 * - influence_gain / favorability_gain: points gained by a player character.
 * - approval_gain: country approval gained while a player leads the government, from
 *   when that leader took office.
 * - referrals_weekly: new players a referrer brought in.
 * - legislator_bills: player-sponsored bills enacted during the round.
 * - wealth_growth: percent net-worth growth, net of wires and loans.
 * - party_growth: members gained by a player-chaired party.
 * - rookie_influence: influence gained by characters under two weeks old.
 * - backbench_influence: influence gained by characters who opened the round in the
 *   lower half of the field.
 * - governor_approval: state approval gained under the same player governor.
 * - kingmaker: races won by candidates a player endorsed.
 * - corp_comeback: growth for player corporations whose market cap fell at least 10%
 *   in the week before the round, net of injected capital.
 */
export type ContestKind =
  | "corp_growth_small"
  | "corp_growth_large"
  | "influence_gain"
  | "approval_gain"
  | "referrals_weekly"
  | "legislator_bills"
  | "wealth_growth"
  | "party_growth"
  | "rookie_influence"
  | "backbench_influence"
  | "favorability_gain"
  | "governor_approval"
  | "kingmaker"
  | "corp_comeback";

/**
 * The iteration referral contest is not a weekly round: it runs from one
 * iteration change to the next, and its top three earn Supporter.
 */
export type ContestRecordKind = ContestKind | "referrals_iteration";

export interface ContestBaseline {
  /** Corporation, character, party, country or state id, depending on kind. */
  subjectId: string;
  /** Starting value for this entry: market cap, National Influence, or approval rating. */
  value: number;
  /** Player character this entry belongs to. */
  characterId: string;
  /** Approval entry turn, when it began after the round opened. */
  enteredTurn?: number;
  /** Capital injected into the corporation since the round opened (corp kinds only). */
  injected?: number;
}

export interface ContestStanding {
  /** Account owner captured while the character exists; retained across resets. */
  userId?: string;
  subjectId: string;
  subjectName: string;
  characterId: string;
  characterName: string;
  baseline: number;
  current: number;
  /** Percent growth for corp kinds, absolute gain otherwise. */
  score: number;
}

export interface ContestWinner {
  /** Account owner, independent of the character lifecycle. */
  userId?: string;
  characterId: string;
  characterName: string;
  subjectId: string;
  subjectName: string;
  score: number;
  /** Cash prize in ₳ (weekly kinds). */
  prizeAnchor?: number;
  prizeLocal?: number;
  currencyCode?: CurrencyCode;
  paidAt?: Date;
  /** Referral awards: user already had paid supporter benefits, so nothing changed. */
  alreadySupporter?: boolean;
  rank?: number;
}

export interface ContestRound {
  /** `${kind}:${roundNumber}`. A deterministic id makes a duplicate round start a duplicate-key no-op. */
  _id: string;
  kind: ContestRecordKind;
  roundNumber: number;
  status: "active" | "settled" | "void";
  startedAt: Date;
  endsAt: Date;
  startTurn: number;
  /** `type:number` of the iteration the round ran in; a round from another iteration is voided. */
  iterationKey?: string;
  /** Corp tiers: opening value boundary in ₳ between small and large. */
  tierBoundaryAnchor?: number;
  baselines: ContestBaseline[];
  standings: ContestStanding[];
  standingsTurn?: number;
  refreshedAt?: Date;
  settledAt?: Date;
  settledTurn?: number;
  winners: ContestWinner[];
  /** Referral awards only: who granted them. */
  awardedBy?: string;
  /** Referral awards only: user id of each winner. */
  winnerUserIds?: ObjectId[];
}
