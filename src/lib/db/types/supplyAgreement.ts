import type { ObjectId } from "mongodb";
import type { CommodityType } from "@/lib/constants/commodities";
import type { CurrencyCode } from "@/lib/constants/currencies";

/** One revision in a bilateral supply-agreement negotiation. */
export interface SupplyAgreementOffer {
  /** Monotonic within one agreement, starting at 1. */
  revision: number;
  /** Corporation that authored this offer. */
  proposedByCorpId: ObjectId;
  volumeCap: number;
  pricePremium: number;
  exclusive: boolean;
  /** Optional fixed term. Absent means the accepted agreement is open-ended. */
  durationTurns?: number;
  /** Turn at which the offer was made, when the world turn was available. */
  proposedAtTurn?: number;
  proposedAt: Date;
}

/**
 * Private supply agreement (bilateral, both-consent). A supplier corp commits
 * to sell a commodity to a buyer corp off the open market: in clearing, the
 * supplier's contracted output is filled FIRST (before the loyal-slice and
 * cheapest-first passes) and that volume leaves the open market. The supplier's
 * excess flows to the market; if the supplier can't cover the cap, the buyer's
 * shortfall is bought on the market as normal.
 *
 * The agreed price is expressed as a premium/discount vs the prevailing market
 * price, bounded to ±SUPPLY_AGREEMENT_PRICE_BAND so a contract can favour either
 * side but cannot become a disguised gift or a gouge.
 *
 * Gated by gameConfig.supplyAgreementsEnabled.
 */
export interface SupplyAgreement {
  _id?: ObjectId;
  supplierCorpId: ObjectId;
  buyerCorpId: ObjectId;
  commodity: CommodityType;
  /**
   * Host state for a state-scoped commodity (today: freight). Freight is
   * haulage capacity based in one state and clears in that state's book, so a
   * freight contract names the state it is fulfilled from: the supplier's
   * plants there are the capacity, the buyer's plants there are the demand,
   * and the reservation lands in that one state book. Absent on every
   * reachable-commodity contract, which is corporation-wide.
   */
  stateId?: string;
  /** Max units per turn the supplier commits (its output is capped to this for the buyer). */
  volumeCap: number;
  /** Optional fixed term. Existing agreements without this remain open-ended. */
  durationTurns?: number;
  /** Turn on which an accepted fixed-term agreement starts settling. */
  startsAtTurn?: number;
  /** Set when the agreement was formed by taking a standing board listing. */
  listingId?: string;
  /** Turn on which an accepted fixed-term agreement stops settling. */
  expiresAtTurn?: number;
  /**
   * What `volumeCap` was validated against when the contract was signed, and
   * therefore whether the shortfall penalty may be assessed against it.
   *
   * `"scaledCapacity"` means the cap was sized against the supplier's usable
   * output. Absent means it was not (legacy contracts with an unbounded cap),
   * and those are grandfathered out of damages by
   * {@link computeSupplyAgreementSettlements}: assessing them would charge
   * `CONTRACT_SHORTFALL_PENALTY` every turn against a promise no plant was
   * sized to meet. They still settle their price premium, and become
   * damage-eligible once re-signed.
   *
   * Optional so `undefined` keeps meaning "unknown basis"; a writer that
   * forgets to stamp it fails safe.
   */
  volumeCapBasis?: "scaledCapacity";
  /**
   * Agreed price as a fraction offset from market: 0 = at market, +0.2 = 20%
   * above, −0.2 = 20% below. Bounded to ±SUPPLY_AGREEMENT_PRICE_BAND.
   */
  pricePremium: number;
  /** Exclusive = the supplier sells this commodity ONLY to the buyer (no market sales). */
  exclusive: boolean;
  /**
   * `"cancelling"` is the NOTICE state (C6). A live contract cannot be torn up
   * instantly: cancelling it stamps notice ({@link contractCancelEffectiveTurn}) during which the contract still delivers AND still settles, and
   * only then becomes `"cancelled"`. Without it, cancellation was a free option
   * — a supplier watched its own production, cancelled on any turn it was going
   * to miss its volume, and the shortfall penalty only ever hit the players who
   * forgot to click.
   */
  status: "pending" | "active" | "cancelling" | "cancelled";
  /**
   * Turn on which a `"cancelling"` contract stops delivering and settling.
   * Absent on every other status.
   */
  cancelEffectiveTurn?: number;
  proposedByCorpId: ObjectId;
  /** Latest offer, including the accepted offer on active agreements. */
  currentOffer?: SupplyAgreementOffer;
  /** Complete offer history, including the current offer. */
  offers?: SupplyAgreementOffer[];
  /**
   * C5 transfer pricing: cumulative ₳ of profit this contract has shifted out
   * of one country and into another, while both parties were in the same
   * formalized group. Reset to zero when the tax authority assesses. Absent on
   * every arm's-length or single-country contract, which is most of them.
   */
  transferPricingExposureAnchor?: number;
  lastTransferPricingAuditTurn?: number;
  /** Latest turn this agreement was evaluated for physical delivery. */
  lastDeliveryTurn?: number;
  /** Units this agreement delivered to its named buyer on lastDeliveryTurn. */
  lastDeliveredUnits?: number;
  /** Buyer demand used to allocate this agreement's latest delivery. */
  lastBuyerConsumptionUnits?: number;
  /** Delivery turn retained before lastDeliveryTurn was updated. */
  previousDeliveryTurn?: number;
  /** Units delivered on previousDeliveryTurn. */
  previousDeliveredUnits?: number;
  /** Buyer demand used to allocate the previous delivery. */
  previousBuyerConsumptionUnits?: number;
  /**
   * The shortfall this contract was charged for on `lastDeliveryTurn`, and the
   * ceiling that shortfall was measured against.
   *
   * Both exist so the supplier can be told why its cash moved; damages otherwise
   * arrive as an unexplained debit disconnected from a contract signed turns ago.
   *
   * `lastAchievableUnits` below `volumeCap` is the diagnosis in one number: the
   * contract is asking for more than the plants can currently make.
   */
  lastShortfallUnits?: number;
  lastAchievableUnits?: number;
  /** Production credited against the damage ceiling on `lastDeliveryTurn`. */
  lastCreditedProductionUnits?: number;
  /** Damages assessed before premium netting and the payer solvency floor, in anchor currency. */
  lastShortfallPenaltyAnchor?: number;
  /** Exact supplier-side cash movement after premium netting and solvency, in the stored currency. */
  lastSupplierCashDelta?: number;
  lastSupplierCashCurrency?: CurrencyCode;
  /** Exact buyer-side cash movement after premium netting and solvency, in the buyer's currency. */
  lastBuyerCashDelta?: number;
  lastBuyerCashCurrency?: CurrencyCode;
  /** Net settlement amount left unpaid by the solvency floor, in anchor currency. */
  lastUnpaidSettlementAnchor?: number;
  /**
   * Turn the supplier's owner was last told this agreement charged shortfall
   * damages. Damages are a LEVEL condition — an oversized contract charges
   * every turn until it is resized — so the notice is on a cooldown and this
   * is what the cooldown reads. Absent means never notified.
   */
  lastDamagesNoticeTurn?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * How much a supplier may promise ABOVE what its plants can physically make.
 * Validated at PROPOSE time against the supplier's capacity-implied units for
 * that commodity (Σ capacity × mix weight across its sectors).
 *
 * 1.2 (20% headroom) rather than exactly 1.0 on purpose: capacity depreciates
 * and grows between drafting and settlement, builds land mid-contract, and a
 * supplier should be able to contract slightly ahead of a plant it is
 * building. Tighter rejects honest contracts; looser makes the promise
 * meaningless.
 */
export const CONTRACT_OVERCOMMIT_TOLERANCE = 1.2;

/**
 * Penalty rate for failing to deliver contracted volume, as a fraction of the
 * market value of the undelivered units: the supplier pays the buyer
 * `shortfallUnits × currentPrice × CONTRACT_SHORTFALL_PENALTY`.
 *
 * 0.5 stays below 1.0 so breach is not strictly worse than never contracting,
 * which would kill the mechanic. Only charged when the supplier UNDER-PRODUCED
 * against its contracted volume, not when a delivery gap is driven by weak
 * market demand.
 */
export const CONTRACT_SHORTFALL_PENALTY = 0.5;

/**
 * Turns of notice a live supply agreement takes to cancel (C6).
 *
 * Instant, free cancellation made the shortfall penalty voluntary: the
 * supplier knows its production before settlement, so it could cancel on the
 * turns it would be short and keep the contract otherwise.
 *
 * Notice, rather than a break fee: break damages are only knowable at
 * settlement (they depend on actual production and clearing price), so a fee
 * at cancellation would be a guess. Notice charges the REAL thing: more turns
 * of the contract as written, settled normally, penalties and all.
 *
 * 4 turns ≈ a sixth of a financial day: long enough that dodging a known-bad
 * settlement fails, short enough that exiting stays a real option.
 * PROVISIONAL: worldsim re-tunes.
 */
export const CONTRACT_CANCEL_NOTICE_TURNS = 4;

/**
 * Share of a fixed-term contract's remaining turns that one-sided notice must
 * cover, and the longest notice it can demand.
 *
 * A flat 4 turns let a 192-turn contract be walked away from as cheaply as a
 * 4-turn one, so a long contract locked in nothing: whoever it turned against
 * could leave within a sixth of a day. Scaling notice with the remaining term
 * makes the commitment cost what it promised. A quarter of what is left, capped
 * at a financial day, keeps leaving possible without making it free. Both
 * sides can still end it sooner by agreeing a shorter term (amend).
 */
const CONTRACT_CANCEL_NOTICE_TERM_SHARE = 0.25;
export const CONTRACT_CANCEL_NOTICE_MAX_TURNS = 24;

/**
 * Turn a one-sided cancellation served on `currentTurn` takes effect. Open-ended
 * contracts take the flat notice; fixed-term ones take a quarter of the turns
 * left (at least the flat notice, at most a day) and never run past their own
 * expiry.
 */
export function contractCancelEffectiveTurn(
  currentTurn: number,
  expiresAtTurn: number | undefined
): number {
  const flat = currentTurn + CONTRACT_CANCEL_NOTICE_TURNS;
  if (expiresAtTurn == null || !Number.isFinite(expiresAtTurn)) return flat;
  const remaining = Math.max(0, expiresAtTurn - currentTurn);
  const notice = Math.min(
    CONTRACT_CANCEL_NOTICE_MAX_TURNS,
    Math.max(CONTRACT_CANCEL_NOTICE_TURNS, Math.ceil(remaining * CONTRACT_CANCEL_NOTICE_TERM_SHARE))
  );
  return Math.min(currentTurn + notice, Math.max(currentTurn, expiresAtTurn));
}

/** Minimum useful fixed term for a supply agreement, in turns. */
export const SUPPLY_AGREEMENT_DURATION_MIN_TURNS = 4;

/** Maximum fixed term for a supply agreement, in turns. */
export const SUPPLY_AGREEMENT_DURATION_MAX_TURNS = 192;

/**
 * Ceiling on shortfall damages from ONE settlement, as a fraction of that
 * contract's own notional value for the period (`volumeCap × unit price`).
 *
 * Bounds the per-turn transfer so a large contract cannot act as an
 * uncapped cash wire between colluding parties. 0.25 of notional is a real
 * penalty for a real miss. PROVISIONAL: worldsim re-tunes.
 */
export const CONTRACT_DAMAGES_CAP_FRACTION = 0.25;

/** Maximum contract price deviation from market (±35%). */
export const SUPPLY_AGREEMENT_PRICE_BAND = 0.35;

/** Deepest discount an AI-run supplier signs; deeper proposals get a counter at this price. */
export const AI_SUPPLIER_MAX_DISCOUNT = 0.1;

/** Clamp a proposed price premium into the legal band. */
export function clampAgreementPremium(premium: number): number {
  if (!Number.isFinite(premium)) return 0;
  return Math.max(-SUPPLY_AGREEMENT_PRICE_BAND, Math.min(SUPPLY_AGREEMENT_PRICE_BAND, premium));
}

/** True when a proposed premium is within the legal band (for validation/reject). */
export function isAgreementPremiumLegal(premium: number): boolean {
  return (
    Number.isFinite(premium) &&
    premium >= -SUPPLY_AGREEMENT_PRICE_BAND &&
    premium <= SUPPLY_AGREEMENT_PRICE_BAND
  );
}
