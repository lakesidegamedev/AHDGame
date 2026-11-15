/**
 * Wartime seizure of enemy-held companies: the portable rules core. Plain data
 * in and out; the turn number and country codes come from the caller. The shell decides whether a war exists (passing `relation` from the
 * belligerent sides) and reports the enemy's domestic assets. Nothing is keyed
 * to a country or pair: any belligerent may take from any enemy, and an owner
 * on the taker's own side is never an enemy.
 *
 * Where the owner is gone, restitution returns an `unsettled` marker carrying
 * the recorded valuation, not a payable amount: who funds and receives such a
 * settlement, and whether it refunds or restores, is not answered here.
 */
import type { CountryId } from "@/lib/constants/countries";
import {
  EXPROPRIATION_TENSION_BY_TIER,
  WARTIME_POLITICAL_FACTOR,
  type CompensationTier,
} from "../constants";

/**
 * Why an order was refused. `ok` is the only success value.
 *
 * The order matters: these are checked in the sequence documented on
 * {@link evaluateWarSeizure}, so a caller that fixes the first reason sees the
 * next one on a retry rather than a pile of causes at once.
 */
export type WarSeizureRefusal =
  | "ok"
  | "no-government"
  | "same-country"
  | "not-at-war"
  | "not-an-enemy"
  | "cooldown"
  | "already-ordered"
  | "no-domestic-assets";

/**
 * How the named owner stands to the taker in the current war.
 *
 * One field instead of two booleans on purpose: "at war" and "is on the
 * opposing side" can disagree, and a shell that computed them separately could
 * hand in a contradictory pair. Here the state is exactly one of three, and
 * only `enemy` is ever a target.
 */
export type WarSeizureRelation = "enemy" | "co-belligerent" | "not-at-war";

export interface WarSeizureEligibilityInput {
  /** The country whose minister is ordering the seizure. */
  takerCountryId: CountryId;
  /** The country the order names as the enemy. */
  ownerCountryId: CountryId;
  /** False for an economy-only country with no sitting government. */
  takerHasGovernment: boolean;
  /** How the named owner stands to the taker in the current war. */
  relation: WarSeizureRelation;
  /** True when the named enemy holds at least one sector in the taker's country. */
  hasDomesticSectors: boolean;
  /** The one-order-per-turn limit, already resolved by the shell. */
  alreadyOrderedThisTurn: boolean;
  /** First turn a new order is allowed again; null when no cooldown applies. */
  cooldownUntilTurn: number | null;
  currentTurn: number;
}

export interface WarSeizureEligibility {
  eligible: boolean;
  reason: WarSeizureRefusal;
}

/**
 * Can this country seize this enemy's domestic assets right now? The check
 * order is part of the contract, so fixing each reason in turn reaches `ok`:
 * no-government, same-country, not-at-war, not-an-enemy (before the asset and
 * turn limits, so naming an ally reports the real problem), cooldown,
 * already-ordered (one per turn), no-domestic-assets.
 */
export function evaluateWarSeizure(input: WarSeizureEligibilityInput): WarSeizureEligibility {
  if (!input.takerHasGovernment) return { eligible: false, reason: "no-government" };
  if (input.takerCountryId === input.ownerCountryId) {
    return { eligible: false, reason: "same-country" };
  }
  if (input.relation === "not-at-war") return { eligible: false, reason: "not-at-war" };
  // A co-belligerent is not an enemy. This is the one case that looks like a
  // valid war from the outside and must never become a target.
  if (input.relation === "co-belligerent") return { eligible: false, reason: "not-an-enemy" };
  if (input.cooldownUntilTurn != null && input.currentTurn < input.cooldownUntilTurn) {
    return { eligible: false, reason: "cooldown" };
  }
  if (input.alreadyOrderedThisTurn) return { eligible: false, reason: "already-ordered" };
  if (!input.hasDomesticSectors) return { eligible: false, reason: "no-domestic-assets" };
  return { eligible: true, reason: "ok" };
}

/**
 * Tension for a whole order: the tier delta times the assets taken, rounded to
 * the ledger's one-decimal precision.
 *
 * The sum is deliberate. A sector-wide order is a single political act but N
 * expropriations, and reading it as one small event would let a country strip an
 * enemy's entire domestic industry for the price of a single takeover.
 */
export function warSeizureTension(assetCount: number, tier: CompensationTier): number {
  const count = Number.isFinite(assetCount) ? Math.max(0, Math.floor(assetCount)) : 0;
  if (count === 0) return 0;
  return Math.round(count * EXPROPRIATION_TENSION_BY_TIER[tier] * 10) / 10;
}

/**
 * Multiplier on the domestic political cost. Wartime rallies the public behind a
 * government taking an enemy's industry; a peacetime or domestic taking gets no
 * such discount.
 *
 * Takes the same relation the eligibility check takes, not an "at war" boolean.
 * The discount applies to a taking the rules allow, so it follows the same
 * three-state answer and only `enemy` pays less. A shell holding just a war flag
 * would otherwise hand the discount to a co-belligerent it must refuse.
 */
export function wartimePoliticalFactor(relation: WarSeizureRelation): number {
  return relation === "enemy" ? WARTIME_POLITICAL_FACTOR : 1;
}

export interface RestitutionInput {
  /** False when the sector row no longer exists (dissolved, merged, or wiped). */
  sectorStillExists: boolean;
  /** True only while the asset is still held by the taker's National Corporation. */
  heldByTaker: boolean;
  /** False when the former owner corporation was dissolved while the war ran. */
  ownerCorporationExists: boolean;
  /**
   * Net asset value recorded when the asset was taken, in ₳, before the tier
   * multiplier and before any premium. Paid exactly as recorded on compensation.
   */
  valuationAnchor: number;
}

export type RestitutionPlan =
  | { kind: "return" }
  | { kind: "unsettled"; amountAnchor: number }
  | { kind: "skip"; reason: "sector-gone" | "not-held-by-taker" };

/**
 * What a settlement owes one recorded asset.
 * - return: sector, taker's hold and owner all still exist, so hand it back.
 *   This keeps the power reversible and is preferred whenever possible.
 * - unsettled: the owner is gone. Carries the net asset value recorded at the
 *   taking (before tier and premium, never re-priced) under a name no caller
 *   can mistake for an instruction to pay; funding and recipient are undecided.
 * - skip: the sector is gone or the taker no longer holds it.
 * The anchor is never negative or non-finite, so a stale record cannot become a
 * charge against the former owner.
 */
export function restitutionPlan(input: RestitutionInput): RestitutionPlan {
  if (!input.sectorStillExists) return { kind: "skip", reason: "sector-gone" };
  if (!input.heldByTaker) return { kind: "skip", reason: "not-held-by-taker" };
  if (input.ownerCorporationExists) return { kind: "return" };
  const valuation = Number.isFinite(input.valuationAnchor) ? Math.max(0, input.valuationAnchor) : 0;
  return { kind: "unsettled", amountAnchor: valuation };
}
