import type { CommodityType } from "@/lib/constants/commodities";
import { safeUnitScale } from "@/lib/constants/capacityEconomy";

/**
 * Capital tier: sectors own productive capacity (output units/day) that
 * depreciates every turn. The growth slider becomes investment, building
 * capacity; a sector that stops investing loses the ability to produce.
 * Realized output is gated by capacity the way geological capacity gates
 * extraction, so output above capacity is not realized as revenue.
 */

/**
 * Seed headroom: capacity starts 10% above implied output so flipping the
 * mode on is a no-op (utilization begins < 1 capacity-side, factor = 1) and
 * depreciation only starts to bite sectors that stop investing.
 */
export const CAPITAL_SEED_HEADROOM = 1.1;

/** Capacity lost per turn with zero investment (~12% over 5 game years). */
export const CAPITAL_DEPRECIATION_PER_TURN = 0.0005;

/**
 * Ceiling on the capital book anchor as a multiple of the sector's CURRENT NPV.
 * The anchor smooths a transient profit dip, but must not carry a going-concern
 * book many times current earnings for ever: past a 5x dip the sector is
 * impaired, not dipping. Bounds the high-water mark so an early-life peak cannot
 * become a permanent ghost valuation. See {@link advanceCapitalBookAnchor}.
 */
const CAPITAL_BOOK_ANCHOR_MAX_NPV_MULTIPLE = 5;

/**
 * Share of the gap between the anchor and current NPV closed each turn while NPV
 * sits below the anchor. A stale peak fades geometrically (~86% gone after one
 * 48-turn year) instead of waiting on the 5x cap or the slow depreciation, so
 * market cap converges onto what current profit supports. See
 * {@link advanceCapitalBookAnchor}.
 */
const CAPITAL_BOOK_ANCHOR_CONVERGENCE_PER_TURN = 0.04;

/**
 * Launch-safety governor for the clearing/capital revenue leg.
 *
 * Big corps run on thin net margins (~0.5% of revenue), so even a few-percent
 * gap between what clearing/capital realizes and what the prior ledger mode
 * (priceRealization) realized is leveraged into a 50-80% earnings swing — a
 * flip that would visibly "nuke" the largest, most visible companies. This
 * governor (a) bounds the clearing/capital realized factor to within ±CAP of
 * the ledger baseline so the per-turn earnings swing stays small, and (b) ramps
 * that bounded divergence in from zero over RAMP_TURNS so the mode flip itself
 * is a no-op (day 1: realized == ledger exactly) and divergence only accrues
 * gradually. Widen CAP / shorten RAMP later once the flip is proven stable.
 */
export const MARKET_REALIZATION_DEVIATION_CAP = 0.15;
export const MARKET_REALIZATION_RAMP_TURNS = 240;

/**
 * Capital book anchor, a depreciated high-water mark on a sector's
 * going-concern value (sectorNPV), used as a tangible-book floor under capital
 * mode.
 *
 * Under capital, tangible book only credits sectorNPV, a perpetuity on current
 * profit that collapses when profit dips, valuing a corp with real capacity as
 * if it owns nothing. The anchor is seeded at current NPV on first exposure (so
 * the flip is a no-op), ratchets UP with NPV, and decays slowly when NPV falls,
 * so valuation reflects durable capacity through a dip without exceeding the
 * sector's historical peak.
 *
 * Slow decay alone was not enough: at 0.05%/turn the half-life is ~1,400 turns,
 * so a stale anchor could dwarf live NPV and mask insolvency. Above a multiple
 * of current NPV the anchor snaps down to reality. Below NPV it also converges
 * each turn, closing `convergencePerTurn` of its gap (whichever is lower of
 * convergence and depreciation). Rising NPV re-ratchets instantly; the existing
 * per-turn price cap prevents a price jump.
 */
export function advanceCapitalBookAnchor(args: {
  prevAnchor: number | null | undefined;
  sectorNPV: number;
  depreciationPerTurn?: number;
  convergencePerTurn?: number;
}): number {
  const {
    prevAnchor,
    sectorNPV,
    depreciationPerTurn = CAPITAL_DEPRECIATION_PER_TURN,
    convergencePerTurn = CAPITAL_BOOK_ANCHOR_CONVERGENCE_PER_TURN,
  } = args;
  const npv = Number.isFinite(sectorNPV) && sectorNPV > 0 ? sectorNPV : 0;
  // First exposure: seed at the current NPV → floor is a no-op on the flip turn.
  if (!(typeof prevAnchor === "number" && prevAnchor > 0)) return npv;
  const decayed = prevAnchor * (1 - Math.max(0, depreciationPerTurn));
  const converged = npv + (prevAnchor - npv) * (1 - Math.min(1, Math.max(0, convergencePerTurn)));
  const smoothed = Math.max(npv, Math.min(decayed, converged));
  // Bound the going-concern floor to a multiple of current NPV. A dip to a fifth
  // of peak earnings is already severe; below that the sector is impaired, not
  // dipping, and must not keep a book that reads as many times its own earnings.
  return Math.min(smoothed, npv * CAPITAL_BOOK_ANCHOR_MAX_NPV_MULTIPLE);
}

/**
 * The deviation cap widens as the ramp completes, released entirely at full ramp.
 *
 * A fixed cap would floor a fully-halted plant at a fraction of nameplate revenue
 * forever, making the physical layer cosmetic. The ramp already fades the governor
 * in, so the cap must fade out with it:
 *
 *   capEffective(λ) = λ >= 1 ? ∞ : cap / (1 − λ)
 *
 * Key invariants: at λ = 0 the baseline is returned verbatim (flip-day identity);
 * at λ = 0.5 the blended bound equals the old constant cap; at λ = 1 the governor
 * is inert.
 */
export function governorEffectiveCap(cap: number, lambda: number): number {
  if (!(lambda < 1)) return Number.POSITIVE_INFINITY;
  return cap / (1 - lambda);
}

/** Shared blend used by both the factor and the amount variants. */
function governorBlend(
  baseline: number,
  market: number,
  startTurn: number | null | undefined,
  currentTurn: number | null | undefined,
  cap: number,
  rampTurns: number
): number {
  const c = Number.isFinite(cap) && cap >= 0 ? cap : MARKET_REALIZATION_DEVIATION_CAP;
  const ramp =
    Number.isFinite(rampTurns) && rampTurns >= 1 ? rampTurns : MARKET_REALIZATION_RAMP_TURNS;
  const now = currentTurn ?? 0;
  const since = Math.max(0, now - (startTurn ?? now));
  const lambda = Math.min(1, since / ramp);
  const ce = governorEffectiveCap(c, lambda);
  // At λ = 1 the bounds are ±∞, so `capped` is `market` exactly — no NaN, since
  // `baseline` is finite and positive by the callers' own guards.
  const capped = Math.min(baseline * (1 + ce), Math.max(baseline * (1 - ce), market));
  return baseline + lambda * (capped - baseline);
}

/**
 * Blend a clearing/capital revenue FACTOR toward the ledger baseline factor it
 * replaces: clamp it to ±capEffective(λ) of the baseline, then ramp that clamped
 * deviation in from 0 over RAMP_TURNS (λ = 0 at the flip turn → returns the
 * baseline exactly → no-op). Returns the baseline unchanged for degenerate
 * inputs — for a FACTOR, a non-positive input is garbage, not "zero output".
 *
 * Do NOT call this with revenue amounts: see `softenedMarketRealizationAmount`.
 */
export function softenedMarketRealization(
  ledgerFactor: number,
  marketFactor: number,
  startTurn: number | null | undefined,
  currentTurn: number | null | undefined,
  cap: number = MARKET_REALIZATION_DEVIATION_CAP,
  rampTurns: number = MARKET_REALIZATION_RAMP_TURNS
): number {
  const lf = Number.isFinite(ledgerFactor) && ledgerFactor > 0 ? ledgerFactor : 1;
  const mf = Number.isFinite(marketFactor) && marketFactor > 0 ? marketFactor : lf;
  return governorBlend(lf, mf, startTurn, currentTurn, cap, rampTurns);
}

/**
 * The turn a sector's launch-safety ramp is measured from.
 *
 * The governor exists to make the WORLD's tier flip a no-op and fade the new
 * economics in from there. A sector's own stamp (`plantsStartTurn`,
 * `clearingStartTurn`) records its first turn under the mode, which for a
 * sector founded or captured long after the flip is just its birthday. Ramping
 * from that birthday restarts the clamp for every new sector, pinning it near
 * the old ledger baseline for its first months even though the world has been
 * on the new model for ages. So the ramp anchors on the earlier of the
 * sector's stamp and the world's flip turn. A sector with no stamp keeps its
 * existing semantics (null in, null out).
 */
export function governorAnchorTurn(
  sectorStartTurn: number | null | undefined,
  worldAnchorTurn: number | null | undefined,
  glide?: GovernorGlide | null
): number | null | undefined {
  if (typeof sectorStartTurn !== "number" || !Number.isFinite(sectorStartTurn)) {
    return sectorStartTurn;
  }
  if (glide) return proportionalGlideAnchorTurn(sectorStartTurn, glide);
  if (typeof worldAnchorTurn !== "number" || !Number.isFinite(worldAnchorTurn)) {
    return sectorStartTurn;
  }
  return Math.min(sectorStartTurn, worldAnchorTurn);
}

/** Default length of the governor glide, in turns. */
export const MARKET_GOVERNOR_GLIDE_TURNS = 24;

/**
 * Proportional governor glide (marketGovernorGlideMode: "proportional").
 *
 * Unlike the floor glide, which only lifts a sector once `progress` passes
 * its own ramp share, this moves every sector the same fraction of its
 * remaining gap each turn:
 *
 *   λ = 1 − (1 − max(ownλ, floor)) × (1 − progress)
 *
 * `floor` is the floor glide's share frozen at switch-over, so already-
 * lifted sectors do not fall back. At progress 0 λ equals the old glide
 * (switch is a no-op); after `glideTurns` λ is 1 for everyone.
 */
export interface GovernorGlide {
  currentTurn: number;
  rampTurns: number;
  /** 0 on the glide's start turn, 1 once it is complete. */
  progress: number;
  /** Minimum ramp share every sector starts the glide from (0-1). */
  floor: number;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/** The anchor turn that yields the proportional-glide ramp share for one sector. */
export function proportionalGlideAnchorTurn(sectorStartTurn: number, glide: GovernorGlide): number {
  const ramp = glide.rampTurns >= 1 ? glide.rampTurns : MARKET_REALIZATION_RAMP_TURNS;
  const own = clamp01((glide.currentTurn - sectorStartTurn) / ramp);
  const base = Math.max(own, clamp01(glide.floor));
  const lambda = 1 - (1 - base) * (1 - clamp01(glide.progress));
  return glide.currentTurn - ramp * lambda;
}

/** Proportional glide parameters for a turn, or null when that mode is not configured. */
export function proportionalGovernorGlide(
  currentTurn: number,
  glideStartTurn: number | null | undefined,
  glideTurns: number | null | undefined,
  rampTurns: number,
  floor: number | null | undefined
): GovernorGlide | null {
  if (typeof glideStartTurn !== "number" || !Number.isFinite(glideStartTurn)) return null;
  if (!Number.isFinite(currentTurn)) return null;
  const turns =
    typeof glideTurns === "number" && Number.isFinite(glideTurns) && glideTurns >= 1
      ? glideTurns
      : MARKET_GOVERNOR_GLIDE_TURNS;
  return {
    currentTurn,
    rampTurns,
    progress: clamp01((currentTurn - glideStartTurn) / turns),
    floor: clamp01(typeof floor === "number" ? floor : 0),
  };
}

/**
 * World anchor that phases the governor out on a schedule.
 *
 * Unset `glideStartTurn` means no glide: returns null, so every sector ramps
 * from its own stamp. Once set, the anchor slides back so that every sector's
 * ramp share is at least `(currentTurn - glideStartTurn) / glideTurns`: 0 on
 * the start turn (no change), 1 after `glideTurns` turns (governor inert for
 * all). Sectors already further along keep their own, higher share. Moving the
 * anchor to a fixed early turn instead (turn 0 on a world seeded under plants)
 * jumps every young sector most of the way in a single turn.
 */
export function governorGlideAnchorTurn(
  currentTurn: number,
  glideStartTurn: number | null | undefined,
  glideTurns: number | null | undefined,
  rampTurns: number
): number | null {
  if (typeof glideStartTurn !== "number" || !Number.isFinite(glideStartTurn)) return null;
  if (!Number.isFinite(currentTurn)) return null;
  const turns =
    typeof glideTurns === "number" && Number.isFinite(glideTurns) && glideTurns >= 1
      ? glideTurns
      : MARKET_GOVERNOR_GLIDE_TURNS;
  const progress = Math.max(0, Math.min(1, (currentTurn - glideStartTurn) / turns));
  return currentTurn - rampTurns * progress;
}

/**
 * Softened market realization for a revenue AMOUNT, not a factor.
 *
 * For a factor, `<= 0` means "no signal, use the baseline". For an amount, 0
 * is meaningful (a halted plant earns nothing), so `market <= 0` is blended
 * literally and the halt is continuous, landing on exactly 0 at full ramp.
 * A non-positive baseline passes the market amount through unchanged. Result
 * is floored at 0: the governor must never mint negative revenue.
 */
export function softenedMarketRealizationAmount(
  baselineAmount: number,
  marketAmount: number,
  startTurn: number | null | undefined,
  currentTurn: number | null | undefined,
  cap: number = MARKET_REALIZATION_DEVIATION_CAP,
  rampTurns: number = MARKET_REALIZATION_RAMP_TURNS
): number {
  const ma = Number.isFinite(marketAmount) && marketAmount > 0 ? marketAmount : 0;
  if (!(Number.isFinite(baselineAmount) && baselineAmount > 0)) return ma;
  return Math.max(0, governorBlend(baselineAmount, ma, startTurn, currentTurn, cap, rampTurns));
}

/**
 * Output the sector's revenue base implies at full throughput:
 * Σ revenue × rate / basePrice over its output mix, × the world's era unit
 * scale.
 *
 * `unitScale` (`getEraUnitScale(preset)`) is REQUIRED: the base-price table is
 * 2019-calibrated, and a pre-modern world's revenue is era-nominal, so without
 * the scale a 1953 economy implies ~70x too few units. It is 1 for every
 * modern world, so modern behavior is byte-identical.
 */
export function impliedOutputUnits(
  revenue: number,
  supplyRates: Partial<Record<CommodityType, number>>,
  basePrices: Record<CommodityType, number>,
  unitScale: number
): number {
  if (!Number.isFinite(revenue) || revenue <= 0 || !supplyRates) return 0;
  let units = 0;
  for (const commodity of Object.keys(supplyRates) as CommodityType[]) {
    const rate = supplyRates[commodity] ?? 0;
    const base = basePrices[commodity];
    if (rate <= 0 || !(base > 0)) continue;
    units += (revenue * rate) / base;
  }
  return units * safeUnitScale(unitScale);
}

/** Initial capacity at first exposure: implied output × headroom. */
export function seedCapitalStock(
  revenue: number,
  supplyRates: Partial<Record<CommodityType, number>>,
  basePrices: Record<CommodityType, number>,
  unitScale: number
): number {
  return impliedOutputUnits(revenue, supplyRates, basePrices, unitScale) * CAPITAL_SEED_HEADROOM;
}

/**
 * Advance capacity one turn: investment (the growth slider, %/turn) builds
 * it, depreciation erodes it. Floored at 0; garbage stock reads as 0.
 */
export function advanceCapitalStock(args: {
  prevStock: number;
  currentGrowthRate: number;
}): number {
  const { prevStock, currentGrowthRate } = args;
  const safePrev = Number.isFinite(prevStock) && prevStock > 0 ? prevStock : 0;
  const growth = Number.isFinite(currentGrowthRate) ? currentGrowthRate / 100 : 0;
  return Math.max(0, safePrev * (1 + growth - CAPITAL_DEPRECIATION_PER_TURN));
}

/**
 * Output-gating factor: min(1, capacity / implied output). 1 when there is
 * nothing to produce; 0 when capacity is gone and output was expected.
 */
export function capitalUtilizationFactor(stock: number, impliedUnits: number): number {
  if (!(impliedUnits > 0)) return 1;
  const safeStock = Number.isFinite(stock) && stock > 0 ? stock : 0;
  return Math.min(1, safeStock / impliedUnits);
}
