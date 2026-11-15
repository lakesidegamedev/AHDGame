import {
  TIER_MULTIPLIER,
  NATIONALIZATION_BOOK_PREMIUM,
  NATIONALIZATION_COMPENSATION_PREMIUM,
  type CompensationTier,
} from "./constants";
import {
  sectorBookValueAnchor,
  type SectorBookValueInput,
} from "@/lib/corporations/sectorProfitBasis";

export interface WholeCorpValuationInput {
  /** Share price in ₳. */
  sharePrice: number;
  totalShares: number;
  /** Balance-sheet equity in ₳ (liquid capital + sector NPV + held bonds + cross-corp stakes). */
  balanceSheetEquity: number;
  /** Outstanding debt in ₳ that the state will assume. */
  debt: number;
}

/**
 * Whole-corp valuation in ₳: the greater of market cap and balance-sheet equity
 * (the floor blocks a manipulated-low share price from cheapening a seizure),
 * net of the debt the state is assuming so leveraged corps aren't double-counted.
 * Floored at zero.
 */
export function computeWholeCorpValuation(input: WholeCorpValuationInput): number {
  const marketCap = input.sharePrice * input.totalShares;
  const gross = Math.max(marketCap, input.balanceSheetEquity);
  return Math.max(0, gross - input.debt);
}

/**
 * Single-sector valuation reuses the canonical `computeSectorNpvSum` from the
 * corporate-bond-default module (the same going-concern NPV used by dissolution
 * and bond issuance), so there is no separate valuation helper here — see
 * `ownershipTransition.nationalizeSector`.
 */

/**
 * Apply the compensation tier multiplier + the buyout premium to a valuation.
 *
 * Fair value pays {@link NATIONALIZATION_COMPENSATION_PREMIUM}× the going-concern
 * NPV; discounted pays half of that; seizure pays nothing.
 *
 * D11 — when `plantsEnabled` the premium switches to
 * {@link NATIONALIZATION_BOOK_PREMIUM}, because the `valuation` the caller
 * passes has switched from a capitalized earnings stream to replacement-cost
 * BOOK (see {@link sectorCompensationValuationAnchor}). The premium and the
 * base MUST move together — a book base at the 5× earnings premium would be a
 * silent 5× overpay on every taking.
 */
export function applyTier(
  valuation: number,
  tier: CompensationTier,
  options?: { plantsEnabled?: boolean }
): number {
  const premium = options?.plantsEnabled
    ? NATIONALIZATION_BOOK_PREMIUM
    : NATIONALIZATION_COMPENSATION_PREMIUM;
  return valuation * TIER_MULTIPLIER[tier] * premium;
}

/**
 * The valuation base a taking compensates on, in ₳ (D11).
 *
 * Below "plants": the caller's steady-state NPV (`npvAnchor`), unchanged.
 * At/above "plants": the sector's replacement-cost book — what the built
 * capacity plus any construction in flight cost to put in the ground.
 *
 * `fraction` carves a partial taking (sector-wide sweeps take a slice); pass 1
 * for a whole sector.
 *
 * Pairs with {@link applyTier}: whichever base this returns, `applyTier` must be
 * called with the SAME `plantsEnabled` so the matching premium applies.
 */
export interface WholeCorpCompensationInput {
  /** Σ replacement-cost book across the corp's sectors, in ₳ (plants only). */
  sectorBookAnchor: number;
  /**
   * Non-sector assets the taking also absorbs, in ₳, AT THEIR EXISTING BASIS —
   * today that is the corp's liquid capital, which is cash and is already worth
   * exactly its face. Held bonds / cross-corp stakes join this leg when the
   * portfolio pass lands (P5+).
   */
  nonSectorAssetsAnchor: number;
  /** Outstanding debt the state assumes, in ₳. */
  debtAnchor: number;
  tier: CompensationTier;
}

export interface WholeCorpCompensationResult {
  /** Net asset value of the taking, in ₳, before tier/premium. For the ledger. */
  valuationAnchor: number;
  /** What the treasury pays shareholders, in ₳. */
  payoutAnchor: number;
}

/**
 * Whole-corp compensation under plants (D11): each asset class compensated on
 * its own basis, then summed.
 *
 * THE RULE: sector plants are taken at book and carry the
 * {@link NATIONALIZATION_BOOK_PREMIUM} (the state pays above replacement cost,
 * which is what makes a taking compensated rather than confiscatory). Cash is
 * taken at 1.0, since paying 1.5x for a dollar is a money printer and there is
 * no "premium over replacement cost" for cash.
 *
 * DEBT is netted off the non-sector leg FIRST and only then off the book leg:
 * debt is a claim on cash before it is a claim on plants, and netting it
 * against the premium-bearing leg first would let a leveraged corp's
 * shareholders extract the premium on debt they are being relieved of.
 *
 * The market-cap floor is deliberately DROPPED under plants. Below plants its
 * job was to stop a manipulated-low share price from cheapening a seizure;
 * under plants the book leg is that floor and cannot be manipulated, being
 * priced off capacity actually in the ground.
 *
 * Under plants, prefer {@link computeWholeCorpValuation} + {@link applyTier}
 * only when `plantsEnabled` is false.
 */
export function wholeCorpCompensationAnchor(
  input: WholeCorpCompensationInput
): WholeCorpCompensationResult {
  const book = Math.max(0, input.sectorBookAnchor);
  const nonSector = Math.max(0, input.nonSectorAssetsAnchor);
  const debt = Math.max(0, input.debtAnchor);

  const nonSectorNet = Math.max(0, nonSector - debt);
  const bookNet = Math.max(0, book - Math.max(0, debt - nonSector));

  const valuationAnchor = bookNet + nonSectorNet;
  const payoutAnchor =
    TIER_MULTIPLIER[input.tier] * (bookNet * NATIONALIZATION_BOOK_PREMIUM + nonSectorNet);

  return { valuationAnchor, payoutAnchor };
}

export function sectorCompensationValuationAnchor(
  sector: SectorBookValueInput,
  npvAnchor: number,
  options: {
    plantsEnabled: boolean;
    currentYear?: number | null;
    currentTurn?: number | null;
    fraction?: number;
    /** The world's era unit-basis scale (`getEraUnitScale(preset)`). */
    eraUnitScale: number;
  }
): number {
  const fraction = options.fraction ?? 1;
  const base = options.plantsEnabled
    ? sectorBookValueAnchor(sector, options.currentYear, options.eraUnitScale, options.currentTurn)
    : npvAnchor;
  return base * fraction;
}
