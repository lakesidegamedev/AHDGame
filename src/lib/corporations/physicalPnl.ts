import {
  groupInputCost,
  type GroupInputAllocation,
} from "@/lib/corporations/groups/rules/inputPricing";
/**
 * Physical sector P&L (plants tier, wave P3.5).
 *
 * ─── What this replaces ──────────────────────────────────────────────────────
 *
 * Below the plants tier a sector's operating cost is one opaque line:
 *
 *     costs = revenue × (1 − effectiveProfitMargin / 100)
 *
 * `effectiveProfitMargin` is `sector.profitMargin` plus ~25 additive
 * percentage-point modifiers (commodity balances, tech, tariffs, subsidies,
 * macro, disasters, …). Every one of them is an *assertion about profitability*
 * rather than a statement about what the firm buys. Two consequences:
 *
 *  1. A sector's cost cannot move with the price of the things it consumes.
 *     Steel doubling shows up (if at all) as a few percentage points of margin
 *     modifier derived from a supply/demand *balance*, never as a bill.
 *  2. The same real-world condition is priced twice — once by the market
 *     (clearing, price realization) and again by a margin modifier standing in
 *     for the same thing.
 *
 * Under plants, cost becomes a sum of physical lines:
 *
 *     profit = revenue
 *              − inputsCost      (units consumed × lagged commodity price)
 *              − laborCost       (workers × wage, already physical)
 *              − upkeep          (P3a idle / mothball capacity charge)
 *              − complianceCost  (regulatory burden)
 *              − otherOpex       (the calibration residual, per unit)
 *              − financialLegs   (disaster penalties etc., ₳ passthrough)
 *              − growthCost      (unchanged, its own line)
 *
 * ─── The calibration identity (why the flip is a no-op) ──────────────────────
 *
 * `otherOpexPerUnit` is not a designed number. It is SOLVED, once, on the
 * sector's first physical-P&L turn, so that
 *
 *     Σ physical lines  ==  the margin formula's cost, exactly, at that state.
 *
 * The solved value is persisted (`otherOpexPerUnitAnchor`, ₳ per output unit
 * per turn) and then held. From that turn on the physical lines move on their
 * own: input prices move → the input bill moves → profit moves → the (now
 * DERIVED) margin moves. The old formula would have been blind to all of it.
 *
 * This is the same discipline P2 applied to revenue, pointed at costs: prove
 * the new model reproduces the old one byte-for-byte at the switchover, then
 * let it diverge for reasons you can name.
 *
 * The margin modifiers that are NOT physical (subsidies, tariffs, macro drag
 * and the rest) ride one named line, `policyCredit`, worth revenue × pp/100,
 * so they still move cost without being the whole cost model. Anchors solved
 * before that line existed still contain the calibration-time stack; see
 * `legacyAnchorPolicyCharge`.
 *
 * Every function here is pure. Money is ₳ (economic anchor), per TURN (hourly),
 * matching `hourlyRevenue` in `sectorTurn`. Units are output units per turn.
 */

import type { CommodityType } from "@/lib/constants/commodities";
import { DEFAULT_SECTOR_PROFIT_MARGIN_PCT } from "@/lib/corporations/sectorProfitBasis";
import { priceRealizationFactor } from "@/lib/market/priceRealization";
import { plantUtilizationForInputs } from "@/lib/corporations/rules/energyProductivityRamp";

/** One commodity's consumption line for a turn. */
export interface InputLine {
  commodity: CommodityType;
  /** Units consumed this turn. */
  units: number;
  /** Price actually charged per unit (lagged market price, ₳). */
  unitPrice: number;
  /** units × unitPrice, ₳ this turn. */
  cost: number;
}

export interface InputsCostResult {
  /** Σ line.cost, ₳ this turn. */
  total: number;
  lines: InputLine[];
}

/**
 * Merge a country's reachable price ratio onto the world ratio for the
 * plant input bill.
 *
 * Reachable books in partitioned markets can print far above the world, but
 * the input bill prices through the same realization damping revenue does
 * (`ratio^0.5`, max 2x, see `computeInputsCost`), so capping the ratio here
 * lowers the value fed into that factor rather than a raw linear price.
 * Taking the cheaper of the two keeps cheap-local discounts without charging
 * buyers a cost no seller-side leg can recover.
 *
 * Uncapped reachable input prices are the same cliff as the worldwide margin
 * collapse.
 */
export function capInputPriceRatioAtWorld(
  worldRatio: number | undefined,
  reachableRatio: number
): number {
  if (typeof worldRatio === "number" && Number.isFinite(worldRatio)) {
    return Math.min(worldRatio, reachableRatio);
  }
  return reachableRatio;
}

/**
 * Physical input bill for one sector-turn.
 *
 * Units match what the world commodity ledger books as this sector's
 * demand: recipe rate × base price, scaled by utilization and the
 * production-policy input multiplier. The firm must be billed for the same
 * units the world is told it took.
 *
 * Known level divergences from the ledger (absorbed by the calibration
 * solve; they only bite when the factor moves): demandMultiplier and
 * natcorpScale are not carried here, tech input effects are; and the
 * revenue basis lags one turn while capacity is building.
 *
 * Price uses the same realization as the revenue side:
 * basePrice × clamp(ratio^0.5, 0.7, 1.5), so buy-sell symmetry holds and
 * world inflation squeezes margins proportionally. statePremiums adds the
 * home state's landed-price surcharge; empty means byte-identical output.
 */
export function computeInputsCost(args: {
  /**
   * Daily nominal revenue basis for the recipe (₳/day). Under plants this is
   * capacity × mixPrice — the nameplate the recipe rates are expressed against.
   */
  nominalDailyRevenue: number;
  /** Commodity → input rate (share of nominal revenue), tech-scaled. */
  rates: Partial<Record<CommodityType, number>>;
  /** Commodity → base price. */
  basePrices: Readonly<Record<CommodityType, number>>;
  /** Commodity → lagged price ÷ base price. Missing ⇒ 1. */
  priceRatios: ReadonlyMap<CommodityType, number>;
  /** producedUnits ÷ capacity. 1 when capacity is unknown. */
  utilization: number;
  /** Same input-utilization ceiling as the world ledger; defaults to 1. */
  productivityMultiplier?: number;
  /** Production-policy input multiplier (`getInputMultiplier`). */
  inputMultiplier: number;
  /** Turns per game day — converts the daily basis to this turn's bill. */
  turnsPerDay: number;
  /** Mothballed plants are cold: no production, no inputs. */
  mothballed?: boolean;
  /**
   * Commodity → landed-price premium per unit (₳), for the sector's home
   * state. Absent or empty leaves unitPrice unchanged (pre-money-wiring
   * behavior).
   */
  statePremiums?: ReadonlyMap<CommodityType, number>;
  groupAllocations?: ReadonlyMap<CommodityType, GroupInputAllocation>;
}): InputsCostResult {
  const {
    nominalDailyRevenue,
    rates,
    basePrices,
    priceRatios,
    utilization,
    productivityMultiplier = 1,
    inputMultiplier,
    turnsPerDay,
    mothballed,
    statePremiums,
  } = args;
  if (
    mothballed === true ||
    !Number.isFinite(nominalDailyRevenue) ||
    nominalDailyRevenue <= 0 ||
    !(turnsPerDay > 0)
  ) {
    return { total: 0, lines: [] };
  }
  const util = Number.isFinite(utilization)
    ? plantUtilizationForInputs(
        utilization,
        1,
        Number.isFinite(productivityMultiplier) ? productivityMultiplier : 1
      )
    : 1;
  const inputMult = Number.isFinite(inputMultiplier) ? Math.max(0, inputMultiplier) : 1;
  const lines: InputLine[] = [];
  let total = 0;
  for (const key of Object.keys(rates) as CommodityType[]) {
    const rate = rates[key] ?? 0;
    const basePrice = basePrices[key];
    if (!(rate > 0) || !(basePrice > 0)) continue;
    const units = ((nominalDailyRevenue * rate) / basePrice / turnsPerDay) * util * inputMult;
    if (!(units > 0)) continue;
    const ratio = priceRatios.get(key);
    const premium = statePremiums?.get(key);
    // Buy-sell symmetry: the bill prices through the SAME realization function
    // revenue does (clamp(ratio^0.5, 0.7, MAX), priceRealization.ts). Before
    // this, a seller realized at most 1.5x base on a shortage while paying raw
    // linear ratios (2.5-3x) for the same shortage on the buy side, so any
    // recipe with fat input rates went structurally negative the moment the
    // world inflated — regardless of how well the corp was run (corp 445:
    // recipe 0.72 of nameplate billed at ~1.33x nameplate while revenue
    // realized ~1.5x, margin -19.8%). Same damping, same clamp, both legs.
    const unitPrice =
      basePrice * priceRealizationFactor(Number.isFinite(ratio) ? (ratio as number) : null) +
      (Number.isFinite(premium) && (premium as number) > 0 ? premium! : 0);
    const allocation = args.groupAllocations?.get(key);
    const priced = allocation
      ? groupInputCost(units, basePrice, unitPrice, allocation)
      : { cost: units * unitPrice, groupUnits: 0 };
    const cost =
      priced.cost +
      priced.groupUnits * (Number.isFinite(premium) && (premium as number) > 0 ? premium! : 0);
    if (!Number.isFinite(cost)) continue;
    total += cost;
    lines.push({ commodity: key, units, unitPrice: allocation ? cost / units : unitPrice, cost });
  }
  return { total, lines };
}

/**
 * The financial (non-physical) cost legs, charged as ₳ passthrough.
 *
 * These are margin penalties that are NOT claims about what the plant buys —
 * a disaster does not raise the price of steel, it destroys throughput and
 * imposes losses. They are converted from percentage points of revenue to ₳
 * once, here, and added as their own line so they survive the physical rewrite
 * unchanged and stay attributable.
 *
 * Only NEGATIVE (penalty) modifiers become costs; a positive modifier would be
 * a subsidy-shaped thing and belongs in the margin stack the residual carries.
 */
export function computeFinancialLegs(args: {
  hourlyRevenue: number;
  /** Percentage-point margin modifiers that are financial, not physical. */
  marginPenaltyPp: number;
}): number {
  const { hourlyRevenue, marginPenaltyPp } = args;
  if (!Number.isFinite(hourlyRevenue) || hourlyRevenue <= 0) return 0;
  if (!Number.isFinite(marginPenaltyPp) || marginPenaltyPp >= 0) return 0;
  return hourlyRevenue * (-marginPenaltyPp / 100);
}

/*
 * Solve the calibration residual: whatever the physical model cannot name
 * is the sector's other operating cost, expressed per output unit so it
 * scales with production, not revenue.
 * Returns null when there is no production to divide by; caller defers.
 * The residual may be negative; not clamped, so the identity holds.
 */
export function solveOtherOpexPerUnit(args: {
  marginFormulaCost: number;
  laborCost: number;
  inputsCost: number;
  financialLegs: number;
  producedUnits: number;
}): number | null {
  const { marginFormulaCost, laborCost, inputsCost, financialLegs, producedUnits } = args;
  if (!(producedUnits > 0) || !Number.isFinite(producedUnits)) return null;
  const residual = marginFormulaCost - laborCost - inputsCost - financialLegs;
  if (!Number.isFinite(residual)) return null;
  return residual / producedUnits;
}

/**
 * The calibration-time policy stack still inside a legacy
 * `otherOpexPerUnitAnchor`, as ₳ this turn.
 *
 * Anchors stamped before the policy stack moved to `policyCredit` were solved
 * against a margin cost that already contained the stack (basis
 * `1 − (base + stack)/100`), while `policyCredit` now credits the live stack
 * on top. The stack sits inside the residual as an AMOUNT, revenue ×
 * stack/100, not a proportion:
 *
 *     anchor_neutral × units = anchor_legacy × units
 *                              + revenue × (basis_neutral − basis_at_calibration)
 *
 * Charging that amount back makes the stack count once. Revenue is this
 * turn's, so on the calibration state the two lines cancel; afterwards only
 * the CHANGE since calibration moves profit. Anchors stamped at the neutral
 * basis return 0. A negative result is a credit (those sectors were paying
 * the penalty twice). Scaling the anchor by a basis ratio is wrong: it is
 * only correct with no inputs and no labour, under-charges every real
 * sector, and grows the credit on a negative anchor.
 */
export function legacyAnchorPolicyCharge(args: {
  hourlyRevenue: number;
  neutralBasis: number;
  anchorMarginBasis: number | null | undefined;
}): number {
  const { hourlyRevenue, neutralBasis, anchorMarginBasis } = args;
  if (typeof anchorMarginBasis !== "number" || !Number.isFinite(anchorMarginBasis)) return 0;
  if (!Number.isFinite(neutralBasis) || !Number.isFinite(hourlyRevenue)) return 0;
  const stack = neutralBasis - anchorMarginBasis;
  if (Math.abs(stack) < 1e-9) return 0;
  return hourlyRevenue * stack;
}

/**
 * Re-base a held `otherOpexPerUnitAnchor` across a strategy retool.
 *
 * The anchor is ₳ PER OUTPUT UNIT, so it survives capacity growth,
 * mothballing, throttling and merges untouched. A RETOOL changes what a unit
 * IS: `setSectorStrategy` rescales `capitalStock` by `capacityRescaleRatio`
 * to keep nameplate (capacity × mixPrice) invariant while unit count moves
 * by the RPU ratio (up to ~327x for coal ↔ rare-earth). An anchor left alone
 * would be multiplied by that same ratio.
 *
 * The anchor moves by the INVERSE: `anchor / ratio`, holding `anchor × units`
 * (the actual ₳ charged) fixed across the retool. Composing a retool with its
 * cancellation restores the original anchor.
 *
 * Returns null when there is no anchor or the ratio is degenerate; the caller
 * writes nothing and the sector calibrates fresh next producing turn.
 */
export function rescaleOtherOpexAnchorForRetool(
  anchor: number | null | undefined,
  rescaleRatio: number
): number | null {
  if (typeof anchor !== "number" || !Number.isFinite(anchor)) return null;
  if (!Number.isFinite(rescaleRatio) || rescaleRatio <= 0) return null;
  const rescaled = anchor / rescaleRatio;
  return Number.isFinite(rescaled) ? rescaled : null;
}

/**
 * The units of capacity an idle-upkeep charge may honestly be levied on.
 *
 * `IDLE_UPKEEP_FRACTION` should price OVER-BUILDING, an owner's decision. Charging
 * it against `capacity - producedUnits` also bills involuntary throttles (input
 * starvation, disasters, strikes), and `throughputFactor` already prices those on
 * the revenue side, so one constraint gets billed twice. Dividing the involuntary
 * throttle back out leaves the capacity that would still stand idle absent it:
 *
 *     ownerIdleUnits = max(0, capacity - producedUnits / involuntaryThrottle)
 *
 * `involuntaryThrottle` is the product of the production legs the owner cannot
 * choose. The policy slider stays in, so a slider cut to 60% still idles and is
 * still billed. A throttle of 0 (fully halted plant) returns 0 idle units rather
 * than dividing by zero; MOTHBALL_UPKEEP_FRACTION is the player-chosen path that
 * does carry a charge.
 */
export function ownerIdleUnits(args: {
  capacity: number;
  producedUnits: number;
  /** Product of the production legs the owner did not choose. */
  involuntaryThrottle: number;
}): number {
  const { capacity, producedUnits, involuntaryThrottle } = args;
  if (!Number.isFinite(capacity) || capacity <= 0) return 0;
  if (!Number.isFinite(involuntaryThrottle) || involuntaryThrottle <= 0) return 0;
  // Capped at 1: a "throttle" above 1 is a boost, and dividing by it would
  // MANUFACTURE idle units out of a productivity gain. Only a genuine
  // restriction may narrow the base.
  const throttle = Math.min(1, involuntaryThrottle);
  const produced = Number.isFinite(producedUnits) ? Math.max(0, producedUnits) : 0;
  const couldHaveRun = Math.min(capacity, produced / throttle);
  const idle = capacity - couldHaveRun;
  return Number.isFinite(idle) ? Math.max(0, idle) : 0;
}

/**
 * The per-unit price of idle upkeep, ₳ per output unit per turn.
 *
 * The basis is ANCHORED, like `otherOpexPerUnitAnchor`: stamped once from the
 * live margin on the sector's first plants turn, then HELD. Absent an anchor
 * (a legacy row, a sector that has not run a plants turn), it falls back to
 * the live basis.
 *
 * The basis must not track the live margin: `(1 - margin_now)` makes the
 * charge GROW as the margin falls, and a sector at a negative derived margin
 * sees it rise without bound, a positive feedback loop pointed at insolvency.
 * Idle upkeep is described as fixed site/maintenance/skeleton crew, and a
 * fixed cost does not float with this quarter's margin.
 *
 * Clamped to [0, IDLE_UPKEEP_BASIS_MAX]. A negative basis would pay the owner
 * to hold idle plant. The ceiling is a healthy sector's cost share, so no
 * sector's idle unit is priced above a healthy sector's running-unit cost.
 */
export const IDLE_UPKEEP_BASIS_MAX = 1 - DEFAULT_SECTOR_PROFIT_MARGIN_PCT / 100;

export function idleUpkeepUnitPrice(args: {
  mixPrice: number;
  turnsPerDay: number;
  /** Held `1 − margin/100` from the sector's first plants turn, when present. */
  anchoredMarginBasis: number | null | undefined;
  /** Live `1 − margin/100`, used only when there is no anchor yet. */
  liveMarginBasis: number;
}): number {
  const { mixPrice, turnsPerDay, anchoredMarginBasis, liveMarginBasis } = args;
  if (!Number.isFinite(mixPrice) || mixPrice <= 0) return 0;
  if (!Number.isFinite(turnsPerDay) || turnsPerDay <= 0) return 0;
  const raw =
    typeof anchoredMarginBasis === "number" && Number.isFinite(anchoredMarginBasis)
      ? anchoredMarginBasis
      : liveMarginBasis;
  const basis = Number.isFinite(raw) ? Math.max(0, Math.min(IDLE_UPKEEP_BASIS_MAX, raw)) : 0;
  return (mixPrice / turnsPerDay) * basis;
}

/** The assembled physical cost stack for one sector-turn. */
export interface PhysicalPnl {
  inputsCost: number;
  laborCost: number;
  upkeep: number;
  complianceCost: number;
  otherOpex: number;
  financialLegs: number;
  growthCost: number;
  /**
   * The policy/tech margin stack (subsidies, tariffs, home location, state
   * metrics, SOE efficiency, tech marginBonus, …) as ₳ this turn:
   * `hourlyRevenue × policyPp / 100`. Positive is a credit (reduces cost),
   * negative a charge. This replaced the drift factor on `otherOpex` as the
   * carrier for non-physical margin modifiers: the drift ratio INVERTED on any
   * sector whose calibrated residual was negative (a margin bonus shrank the
   * credit and raised cost — live on 82% of prod sectors when found), while a
   * revenue-proportional line is monotone in the modifier by construction.
   */
  policyCredit: number;
  /**
   * The like-for-like replacement of the old `grossMaintenance` line:
   * inputs + labor + otherOpex + financialLegs. Upkeep, compliance and growth
   * are NOT in it — they were separate lines before this wave too, and the
   * derived margin below has to compare against the same thing the margin
   * formula described.
   */
  operatingCost: number;
  /** Every line: what the corp actually pays this turn. */
  totalCost: number;
  profit: number;
  /**
   * True when the calibrated residual was a CREDIT larger than every named
   * cost line put together and was clamped to them. See
   * `clampOtherOpexCredit`: a sector can never be paid to run, so the credit
   * may cancel the inputs, labour, upkeep, compliance, financial and growth
   * bills, and not one anchor more. The stored `otherOpex` is the clamped
   * figure; the raw anchor-times-units product is on `otherOpexUncapped`.
   */
  otherOpexCreditCapped: boolean;
  otherOpexUncapped: number;
  /**
   * The DERIVED margin. Under plants `effectiveProfitMargin` is an OUTPUT of
   * the cost model, not an input to it — see `assemblePhysicalPnl`.
   */
  derivedMarginPct: number;
  /** `100 x profit / revenue`: margin over the full cost stack, uncapped. */
  netMarginPct: number;
}

/**
 * Bound the calibration residual when it is a CREDIT.
 *
 * `solveOtherOpexPerUnit` stores a negative residual PER UNIT and re-multiplies
 * it by `producedUnits` every turn. That credit scales on its own whenever the
 * unit count or unit economics move, so a sector can book profit far above
 * revenue. Invariant enforced here: a plant can never be paid to run. The
 * credit may cancel the bills it was calibrated against (net of policy credit)
 * and not one anchor more, so total cost is never negative. A positive
 * residual, or a credit that leaves total cost at or above zero, is untouched,
 * so the calibration identity still holds wherever it held honestly.
 */
export function clampOtherOpexCredit(args: {
  otherOpex: number;
  inputsCost: number;
  laborCost: number;
  financialLegs: number;
  upkeep: number;
  complianceCost: number;
  growthCost: number;
  policyCredit?: number;
}): number {
  const { otherOpex, inputsCost, laborCost, financialLegs, upkeep, complianceCost, growthCost } =
    args;
  if (!Number.isFinite(otherOpex) || otherOpex >= 0) return otherOpex;
  const policyCredit = Number.isFinite(args.policyCredit) ? (args.policyCredit as number) : 0;
  const namedBills =
    Math.max(0, inputsCost) +
    Math.max(0, laborCost) +
    Math.max(0, financialLegs) +
    Math.max(0, upkeep) +
    Math.max(0, complianceCost) +
    Math.max(0, growthCost) -
    Math.max(0, policyCredit);
  const floor = Number.isFinite(namedBills) && namedBills > 0 ? -namedBills : 0;
  return otherOpex < floor ? floor : otherOpex;
}

/**
 * Assemble the lines into a profit, and DERIVE the margin.
 *
 * `derivedMarginPct = 100 × (1 − operatingCost / revenue)`.
 *
 * That denominator choice is deliberate: the old `effectiveMargin` satisfied
 * `grossMaintenance = revenue × (1 − margin/100)` and nothing else, so deriving
 * against `operatingCost` (the same scope) makes the derived value EXACTLY
 * equal to the old one on the calibration turn — every existing margin reader
 * keeps working and sees no step. Deriving against total profit instead would
 * have folded upkeep/growth/compliance into a number no reader expects to
 * contain them, producing a visible flip-day jump in a display field.
 *
 * At zero revenue the margin is 0 (no meaningful ratio) rather than −∞.
 */
export function assemblePhysicalPnl(args: {
  hourlyRevenue: number;
  inputsCost: number;
  laborCost: number;
  upkeep: number;
  complianceCost: number;
  otherOpex: number;
  financialLegs: number;
  /** Matched internal rebate after the existing subsidy and residual caps. */
  internalSupplyDiscountCost?: number;
  growthCost: number;
  policyCredit: number;
}): PhysicalPnl {
  const { hourlyRevenue, inputsCost, laborCost, upkeep, complianceCost, financialLegs } = args;
  const { growthCost } = args;
  let { otherOpex } = args;
  const otherOpexUncapped = otherOpex;
  // Policy credit offsets bills; it cannot exceed them. Without this cap a
  // sector whose policy stack outran its costs booked a NEGATIVE total cost and
  // a profit above revenue (a live technology sector: revenue 3,694, credit
  // 1,628, total cost -270, profit 3,965). The other-opex clamp below only
  // engages when other opex itself is a credit, so this path slipped past it.
  // `policyCredit` may itself be negative (a net penalty); only the credit
  // side is bounded.
  const billsForCredit =
    inputsCost +
    laborCost +
    financialLegs +
    Math.max(0, otherOpex) +
    upkeep +
    complianceCost +
    growthCost;
  const policyCredit =
    args.policyCredit > 0
      ? Math.min(args.policyCredit, Math.max(0, billsForCredit))
      : args.policyCredit;
  const clampedOtherOpex = clampOtherOpexCredit({
    otherOpex,
    inputsCost,
    laborCost,
    financialLegs,
    upkeep,
    complianceCost,
    growthCost,
    policyCredit,
  });
  const otherOpexCreditCapped = clampedOtherOpex !== otherOpex;
  otherOpex = clampedOtherOpex;
  // `policyCredit` sits inside operatingCost (as a credit) so the derived
  // margin keeps the same scope the old `effectiveMargin` had — the modifier
  // stack was part of that number, and margin readers expect it there.
  const internalSupplyDiscountCost = Number.isFinite(args.internalSupplyDiscountCost)
    ? (args.internalSupplyDiscountCost ?? 0)
    : 0;
  const operatingCost =
    inputsCost + laborCost + otherOpex + financialLegs - policyCredit + internalSupplyDiscountCost;
  const totalCost = operatingCost + upkeep + complianceCost + growthCost;
  const profit = hourlyRevenue - totalCost;
  const derivedMarginPct =
    Number.isFinite(hourlyRevenue) && hourlyRevenue > 0
      ? Math.min(100, 100 * (1 - operatingCost / hourlyRevenue))
      : 0;
  // Net margin over EVERY cost line, upkeep, compliance and growth included.
  // `derivedMarginPct` deliberately keeps the old operating scope so existing
  // readers see no step; this is the number that tells a player the sector is
  // actually losing money (a healthcare plant read 30 percent operating margin
  // against 8.1M of upkeep on 3.3M of revenue).
  const netMarginPct =
    Number.isFinite(hourlyRevenue) && hourlyRevenue > 0 ? (100 * profit) / hourlyRevenue : 0;
  return {
    inputsCost,
    laborCost,
    upkeep,
    complianceCost,
    otherOpex,
    financialLegs: financialLegs + internalSupplyDiscountCost,
    growthCost,
    policyCredit,
    operatingCost,
    totalCost,
    profit,
    derivedMarginPct,
    netMarginPct,
    otherOpexCreditCapped,
    otherOpexUncapped,
  };
}
