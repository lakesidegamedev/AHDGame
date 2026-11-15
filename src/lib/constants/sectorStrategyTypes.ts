import type { CommodityType } from "./commodities";
import type { MediaOperatingModelId } from "@/lib/mediaOperatingModels/catalog";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Number of turns for the linear transition between strategies */
export const STRATEGY_TRANSITION_TURNS = 12;

/** Cooldown turns from initiation before another strategy change is allowed */
export const STRATEGY_COOLDOWN_TURNS = 24;

/**
 * Turns, from initiation, that a strategy chosen by a controlling parent's CEO
 * is shielded from the subsidiary's AI manager: twice the cooldown, so the AI
 * leaves it alone for a further 24 turns after the parent could change it again.
 */
export const PARENT_DIRECTED_STRATEGY_PROTECTION_TURNS = STRATEGY_COOLDOWN_TURNS * 2;

/** Fraction of daily revenue charged when initiating a strategy change */
export const STRATEGY_RETOOL_COST_FRACTION = 0.25;

/** Margin penalty (percentage points) applied while a transition is in progress */
export const STRATEGY_TRANSITION_MARGIN_PENALTY = -5;

/** Fraction of daily revenue charged when cancelling a transition mid-flight (scales with progress) */
export const CANCEL_COST_FRACTION = 0.1;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SectorStrategy {
  id: string;
  name: string;
  description: string;
  supply: Partial<Record<CommodityType, number>>;
  demand: Partial<Record<CommodityType, number>>;
  /**
   * Sector tech-tree gating (v2). When the tech-trees feature is on:
   *  - `minDecade`: the world must have reached this decade (id, e.g. "2009").
   *  - `requiresTechUnlock`: the corp must have unlocked this strategy via a
   *    tech node carrying `unlockStrategy: <this id>`.
   * Both may apply. Absent ⇒ always available (legacy / baseline methods).
   * See lib/constants/techTree/strategyAvailability.
   */
  minDecade?: string;
  requiresTechUnlock?: boolean;
  /**
   * Turns to commission a site of this method (48 turns is one game year).
   * Required on every method opened by a 2039 or later tier; see the
   * "no method is free" test.
   */
  buildTurns?: number;
  /** The cost the method carries beyond its inputs, in plain words. Required with `buildTurns`. */
  downside?: string;
  /**
   * Breakthrough gate: cumulative world frontier research in this method's
   * sector (rdScore spent on late-tier research by every corporation in the
   * sector, see techTree/breakthrough) must reach this before the method
   * opens, on top of `minDecade`. A sector nobody researches never gets it.
   */
  researchThreshold?: number;
  /**
   * Cross-sector prerequisites: each listed sector's cumulative world frontier
   * research must reach its figure before the method opens, so a method can
   * depend on another industry's progress (orbital mining on launch services).
   */
  requiresLaneResearch?: ReadonlyArray<{ lane: string; threshold: number }>;
  /**
   * Tier id from which this method is retired: closed to new sites and
   * retools, existing sites pay a rising operating penalty, and a retool to
   * one of `successorIds` gets a conversion discount. See techTree/sunset.
   */
  sunsetDecade?: string;
  /** Named successors a sunset method converts to at the discount. */
  successorIds?: string[];
  /** Present on virtual strategy definitions backed by the media model catalog. */
  mediaOperatingModelId?: MediaOperatingModelId;
}

export interface EffectiveStrategyRates {
  supply: Partial<Record<CommodityType, number>>;
  demand: Partial<Record<CommodityType, number>>;
  /** True when a transition is actively in progress (−5% margin penalty applies) */
  isTransitioning: boolean;
}
