import { clamp01 } from "@/lib/numeric/rules";

/**
 * Bloc stress: a 0-1 gauge of strain over a bloc's own members.
 *
 * Inputs:
 *  - contested members (rival poles actively pulling at them)
 *  - members heading for the door (`wantsOutSinceTurn` at the leave threshold)
 *  - recent accessions (a decaying digestion cost, not a permanent tax)
 *
 * Member count is deliberately NOT an input: size alone is not strain, and
 * taxing it would make expansion bad rather than costly. Stress dampens the
 * bloc's own plays and self-corrects as members settle.
 */

/** Weights sum to 1, so stress is a clean 0-1 gauge. */
const CONTESTED_WEIGHT = 0.45;
const WANTS_OUT_WEIGHT = 0.35;
const DIGESTION_WEIGHT = 0.2;

/**
 * A member is contested when a RIVAL pole holds at least this much of it.
 *
 * A rival's share is the honest measure and matches this module's claim that
 * a member nobody is fighting for costs nothing. The threshold reuses
 * `crisis.ts`'s tug-of-war convention: two poles at 4 and 3 are not fighting
 * over a country, they are ignoring it.
 */
const CONTESTED_RIVAL_MIN = 25;

/** Turns an accession keeps counting as digestion. A quarter game-year. */
export const DIGESTION_WINDOW_TURNS = 12;

/**
 * Most a fully-stressed bloc loses from its plays. Not 1: a bloc under maximum
 * strain is impaired, not inert, and a mechanic that can zero a player's action
 * entirely reads as broken rather than as pressure.
 */
export const STRESS_MAX_DAMPING = 0.4;

export interface BlocMemberState {
  entityId: string;
  /** This bloc's share of the member, 0-100. */
  share: number;
  /**
   * The largest share any RIVAL pole holds of this member, 0-100. Absent = no
   * rival is invested, which is the same as uncontested.
   */
  rivalShare?: number;
  /** Set while the member's share sits at the leave threshold. */
  wantsOutSinceTurn?: number | null;
  /** Turn the member acceded. */
  joinedTurn?: number | null;
}

export interface BlocStressBreakdown {
  /** 0-1 overall gauge. */
  stress: number;
  /** Fraction of members the rivals are actively pulling at. */
  contested: number;
  /** Fraction of members at the leave threshold. */
  wantsOut: number;
  /** Fraction of members acceded within the digestion window. */
  digesting: number;
  memberCount: number;
}

/**
 * Stress for one bloc. An empty bloc has none — there is nothing to hold
 * together, and dividing by zero members would otherwise make it maximal.
 */
export function computeBlocStress(
  members: BlocMemberState[],
  currentTurn: number
): BlocStressBreakdown {
  const memberCount = members.length;
  if (memberCount === 0) {
    return { stress: 0, contested: 0, wantsOut: 0, digesting: 0, memberCount: 0 };
  }

  let contestedCount = 0;
  let wantsOutCount = 0;
  let digestingCount = 0;
  for (const m of members) {
    if ((m.rivalShare ?? 0) >= CONTESTED_RIVAL_MIN) contestedCount++;
    if (m.wantsOutSinceTurn != null) wantsOutCount++;
    // `joinedTurn > 0` excludes founding and seeded members, which the seeders
    // stamp with turn 0. Without that guard every world opened with digestion
    // at 1.0 for its first twelve turns — a bloc cannot be busy absorbing the
    // members it was defined as having.
    if (
      m.joinedTurn != null &&
      m.joinedTurn > 0 &&
      currentTurn - m.joinedTurn < DIGESTION_WINDOW_TURNS
    ) {
      digestingCount++;
    }
  }

  const contested = contestedCount / memberCount;
  const wantsOut = wantsOutCount / memberCount;
  const digesting = digestingCount / memberCount;
  const stress = clamp01(
    contested * CONTESTED_WEIGHT + wantsOut * WANTS_OUT_WEIGHT + digesting * DIGESTION_WEIGHT
  );

  return { stress, contested, wantsOut, digesting, memberCount };
}

/**
 * Multiplier on a bloc's plays. 1 when unstressed, `1 - STRESS_MAX_DAMPING` at
 * maximum strain.
 */
export function blocPlayEffectiveness(stress: number): number {
  return 1 - STRESS_MAX_DAMPING * clamp01(stress);
}

/** Player-facing band for the gauge. Stress is shown, not hidden. */
export function blocStressLabel(stress: number): "Settled" | "Strained" | "Overextended" {
  if (stress < 0.25) return "Settled";
  if (stress < 0.6) return "Strained";
  return "Overextended";
}
