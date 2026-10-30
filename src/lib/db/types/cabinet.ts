import type { ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { WhippedFromVoteMap } from "./legislation";
import type { IterationStampFields } from "./gameState";

export type CabinetNominationStatus =
  "proposed" | "active" | "awaiting_choice" | "confirmed" | "rejected" | "withdrawn";

/**
 * Why a nomination failed. A nominee who won the vote can still lose the seat
 * to a conflict of office, and that has to be distinguishable from a defeat at
 * the ballot so the player and the record can say which happened.
 */
export type CabinetNominationRejectionReason = "senate_vote" | "incompatible_bank_office";

export interface CabinetMember extends IterationStampFields {
  _id: ObjectId;
  countryId: CountryId;
  positionId: string;
  /**
   * Character holder. `null` when the seat is held by a confirmed NPP nominee
   * (see `isNPP` / `nppId`), mirroring {@link UnifiedCabinetMember}.
   */
  characterId: ObjectId | null;
  characterName: string;
  party?: string;
  /** True when this seat is held by an NPP rather than a character. */
  isNPP?: boolean;
  /** The seated NPP's id when `isNPP` is true. */
  nppId?: ObjectId;
  /**
   * @deprecated Legacy name, written only by the US confirmation path. The
   * collection's canonical field is `appointedByCharacterId` on
   * {@link UnifiedCabinetMember}, which the UK, NPP and acting paths all write
   * and which `caretakerMinister` queries. Write both until the two types are
   * unified.
   */
  appointedByPresidentId: ObjectId;
  /** Canonical appointer field, mirroring {@link UnifiedCabinetMember}. */
  appointedByCharacterId?: ObjectId | null;
  /** When the seat was filled, mirroring {@link UnifiedCabinetMember}. */
  appointedAt?: Date;
  /** True when appointed directly by the executive without legislative confirmation. */
  acting?: boolean;
  /** Turn the acting appointment was seated. Absent on confirmed holders. */
  actingSinceTurn?: number;
  /** Turn the acting appointment lapses: `actingSinceTurn + ACTING_TENURE_TURNS`. */
  actingExpiresOnTurn?: number;
  confirmedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CabinetNomination extends IterationStampFields {
  _id: ObjectId;
  countryId: CountryId;
  positionId: string;
  /** Player nominee. Null for NPP nominees (see nomineeMode). */
  nomineeCharacterId: ObjectId | null;
  /** NPP nominee. Set only when nomineeMode is "npp". */
  nomineeNppId?: ObjectId | null;
  /**
   * Discriminator replacing the old player-only nominee. Follows the SCOTUS
   * pattern. Optional so legacy docs and the character-only VP path keep
   * compiling; absent means "character".
   */
  nomineeMode?: "character" | "npp";
  nomineeCharacterName: string;
  nomineeParty?: string;
  proposedByPresidentId: ObjectId;
  proposedByPresidentName: string;
  status: CabinetNominationStatus;
  /** Senate votes (cabinet nominations + VP nominations). */
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  votes: Record<string, "for" | "against" | "abstain">;
  /** House votes (VP nominations only — 25th Amendment requires both chambers). */
  houseVotesFor?: number;
  houseVotesAgainst?: number;
  houseVotesAbstain?: number;
  houseVotes?: Record<string, "for" | "against" | "abstain">;
  whippedFromVote?: WhippedFromVoteMap;
  votingStartedAt?: Date;
  votingEndsAt?: Date;
  /** Game-clock turn on which voting closes. Server resolution uses this. */
  votingEndsOnTurn?: number;
  confirmedAt?: Date;
  rejectedAt?: Date;
  /** Set on rejection; absent on legacy and non-rejected docs. */
  rejectionReason?: CabinetNominationRejectionReason;
  /** When the nominee was offered a seat blocked by a central bank office. */
  choiceOfferedAt?: Date;
  /** Turn on which an unanswered seat offer lapses. */
  choiceExpiresOnTurn?: number;
  proposedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
