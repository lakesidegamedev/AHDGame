/**
 * Wartime seizure of enemy-held companies: the portable rules core.
 *
 * Plain data in, plain data out. No database, no wall clock, no randomness, no
 * environment and no async, so the same rules can run in the request path, in a
 * turn phase, or in the headless harness without being rewritten. Country ids
 * arrive as codes and the turn number arrives from the caller; nothing here
 * knows what time it is or which conflict it is looking at.
 *
 * Two things this module deliberately does not do:
 *
 * - It does not decide whether a war exists. The shell resolves the conflict and
 *   passes `relation`, derived from the belligerent sides, which keeps these
 *   rules testable without seeding a war.
 * - It does not read the assets. The shell reports whether the enemy holds any
 *   domestic sectors and how many assets an order would take.
 *
 * Nothing is keyed to a country, a region, or a pair. Any belligerent may take
 * from any enemy in either direction; the only asymmetry the rules encode is
 * that an owner on the taker's own side is not an enemy at all.
 *
 * The restitution plan does not name a payee or a payer, and where the owner is
 * gone it does not return a payable amount at all: it returns an `unsettled`
 * marker carrying the recorded valuation. Whether the settlement is paid out of
 * the taker's treasury or created, who receives it, and whether it refunds what
 * was paid or restores what was lost are policy questions for the owner.
 * Nothing here should be read as having answered them.
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
 * Can this country seize this enemy's domestic assets right now?
 *
 * Checked in this order, and the order is part of the contract:
 *
 * 1. no-government: a country without a government cannot give the order.
 * 2. same-country: a country cannot be its own enemy.
 * 3. not-at-war: there must be an active war with the named owner.
 * 4. not-an-enemy: the owner must be on the opposing side. This is what keeps a
 *    co-belligerent safe, and it is checked before the asset and turn limits so
 *    a minister who names an ally is told the real problem.
 * 5. cooldown: a previous order's cooldown has not elapsed.
 * 6. already-ordered: one order per turn.
 * 7. no-domestic-assets: nothing of the enemy's operates here to take.
 *
 * A caller that fixes each reason in turn eventually reaches `ok`.
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
 *
 * - return: the sector still exists, the taker still holds it, and its owner
 *   still exists, so hand it back. This is the outcome that makes the power
 *   reversible and it must be preferred whenever it is possible.
 * - unsettled: the owner is gone, so the asset cannot go home, and what a
 *   settlement owes is an open owner decision rather than a default. The plan
 *   carries the recorded valuation but names itself `unsettled`, so no caller
 *   can mistake the number for an instruction to pay.
 *
 *   The amount is the net asset value recorded at the taking, before the tier
 *   multiplier and before any premium. A premium applied here would be a second
 *   one, and it is never re-priced: the taker may have grown or run the asset
 *   down since, and a settlement settles the asset that was taken.
 *
 *   Two questions have to be answered before this can become a payment. Who
 *   funds it, the taker's treasury or newly created money, and who receives it
 *   once the former owner's corporation no longer exists. And whether the peace
 *   term refunds only what the owner was actually paid, which is nothing for a
 *   `seizure` tier taking, or restores what it lost. Restoring pays full value
 *   back to an owner that received nothing at the time, which is a real
 *   transfer rather than a refund, so the answer is the owner's to give.
 * - skip: there is nothing to return. A sector that no longer exists cannot be
 *   conjured back, and one the taker no longer holds has already moved on.
 *
 * `unsettled` never carries a negative or non-finite anchor, so a corrupt or
 * stale record cannot become a charge against the former owner.
 */
export function restitutionPlan(input: RestitutionInput): RestitutionPlan {
  if (!input.sectorStillExists) return { kind: "skip", reason: "sector-gone" };
  if (!input.heldByTaker) return { kind: "skip", reason: "not-held-by-taker" };
  if (input.ownerCorporationExists) return { kind: "return" };
  const valuation = Number.isFinite(input.valuationAnchor) ? Math.max(0, input.valuationAnchor) : 0;
  return { kind: "unsettled", amountAnchor: valuation };
}
