import { ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type {
  OfficeType,
  PolicyPositions,
  CharacterDemographics,
  CareerEvent,
} from "@/lib/db/types/character";
import type { GameIteration } from "@/lib/db/types/gameState";
import type { CharacterRecap } from "@/lib/recap/types";

export interface RetiredCharacterSnapshot {
  name: string;
  /** Harness lives remain excluded from public rankings after retirement. */
  isSynthetic?: boolean;
  countryId: CountryId;
  homeState: string;
  party: string;
  partyName: string;
  currentOffice: OfficeType | null;
  policies: PolicyPositions;
  demographics?: CharacterDemographics;
  stats: {
    politicalInfluence: number;
    nationalInfluence?: number;
    partyInfluence?: number;
    favorability: number;
    infamy: number;
    funds: number;
    cashOnHand?: number;
    /** Savings balance in the character's home currency — used with cashOnHand for net worth. */
    savingsOnHand?: number;
    /**
     * Total value of held shares, bonds, and index funds, pre-converted to anchor units (₳), captured just before `retireCharacter` irreversibly releases them. Absent/0 on older snapshots (net worth undercounts there).
     */
    /** Frozen retirement values avoid repricing historical balances with a later world's FX. */
    cashValueAnchor?: number;
    debtValueAnchor?: number;
    savingsValueAnchor?: number;
    /** Enacted sponsored laws captured before the world resets its bill collections. */
    enactedBills?: number;
    shareValueAnchor?: number;
    bondValueAnchor?: number;
    indexFundValueAnchor?: number;
  };
  avatarUrl?: string;
  profileHeaderImageUrl?: string;
  bio?: string;
  careerHistory?: CareerEvent[];
  /**
   * Label only, frozen at retirement. Do not trust for scoring/ranking: may carry stale incorrect labels. Re-derive live from `careerHistory`/`currentOffice` where correctness matters.
   */
  highestOffice?: string;
  achievementCount: number;
  createdAt: Date;
}

export interface RetiredCharacter {
  _id: ObjectId;
  userId: ObjectId;
  characterId: ObjectId;
  retiredAt: Date;
  reason: "player_deleted" | "game_reset" | "admin_action";
  snapshot: RetiredCharacterSnapshot;
  /** Season this life belonged to (outgoing iteration at retirement). */
  iteration?: GameIteration;
  /** Frozen Season Recap ("Wrapped") payload. */
  recap?: CharacterRecap;
  /**
   * One-time "seen" stamp for the post-reset recap gate. Absent = unviewed
   * (the gate surfaces it on next login); set once the player finishes/dismisses.
   */
  recapViewedAt?: Date;
}
