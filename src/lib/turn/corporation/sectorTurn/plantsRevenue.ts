/**
 * Extraction capacity and realized revenue: the hard min, the production
 * chain, and the launch-safety governor.
 *
 * Pure computation split out of processSector. Below plants an extraction
 * sector is gated by capital stock and a soft geological revenue haircut
 * (floor + grace); under plants the deposit is a HARD ceiling on produced
 * units and the plants ramp is the only fade-in. The governor binds derived
 * plants revenue within ±cap of the pre-flip baseline counterfactual so the
 * flip turn is a no-op. Returns the capacity-binding notification as data;
 * the caller pushes it. No reads or writes here, only the turn inputs.
 */
import { activeCapacityConstraintFactor } from "@/lib/corporations/investment/rules";
import { productionProductivityMultiplier } from "@/lib/corporations/rules/productionProductivity";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import { getOutputMultiplier } from "@/lib/utils/productionPolicy";
import { CAPACITY_BINDING_THRESHOLD } from "@/lib/extraction/capacityHaircut";
import {
  governorAnchorTurn,
  softenedMarketRealization,
  softenedMarketRealizationAmount,
  type GovernorGlide,
} from "@/lib/market/capital";
import { computePriceRealization } from "@/lib/market/priceRealization";
import { TRADE_EMBARGO_EXPORT_LOSS_SHARE } from "@/lib/trade/constants";
import { computeExportExposure } from "@/lib/trade/exportPremium";
import { freshMilitaryDiversion } from "@/lib/military/arsenal";
import { commodityProductionCapacityScale } from "@/lib/banking/capacityAllocation";
import type { getSectorTechEffects } from "@/lib/constants/techTree";
import type { CorporateSector, Corporation } from "@/lib/db/types";
import type { MarketContext } from "@/lib/market/marketContext";
import type { SectorClearingResult } from "@/lib/market/clearing";
import type { CommodityType } from "@/lib/constants/commodities";
import type { ExtractableResource } from "@/lib/constants/commodities";
import type { CorporationLookups } from "../types";
import { computeContractProduction } from "../contractProduction";
import { restartProductionFactor } from "../rules/restartRun";
import {
  soldOutMarketHeadroomUnits,
  throttleSoldUnits,
  withEditorialAvailabilityRestored,
  withRegulationBlockedFill,
} from "../demandThrottle";

export interface PlantsRevenueInput {
  /** Share of the market run kept by a plant that keeps losing money (rules/lossRun). */
  lossRunShare?: number;
  sector: Pick<
    CorporateSector,
    | "_id"
    | "sectorType"
    | "countryId"
    | "stateId"
    | "soldUnits"
    | "soldByCommodity"
    | "producedUnits"
    | "capacityUtilization"
    | "militaryDivertedFraction"
    | "militaryDivertedTurn"
    | "plantsGovernorExempt"
  >;
  corp: Pick<Corporation, "_id" | "countryId" | "bankCharter">;
  strategySupply: Partial<Record<CommodityType, number>> | undefined;
  techEffects: Pick<ReturnType<typeof getSectorTechEffects>, "outputRateMult">;
  plantsEnabled: boolean;
  /** Explicit clearing quotes settle at their offered price without ramp blending; tech price realization still applies on top. */
  costPlusPricingEnabled?: boolean;
  mothballed: boolean;
  /** P1 nameplate units from the market-tier computation (non-plants base). */
  nameplateUnits: number;
  activeFraction: number;
  plantsRampLambda: number;
  /**
   * No-buyer phase-out progress for an extraction sector whose recipe has no
   * leg its state can extract (0 otherwise). Under plants the deposit ceiling
   * otherwise rides the launch-governor ramp, so such a mine kept producing
   * (1 - lambda) of capacity for a market that never took a unit.
   */
  noBuyerPhaseOut?: number;
  capacityUtil: { utilization: number; bindingResource: ExtractableResource | null };
  capacityHaircut: number;
  capitalFactor: number;
  capacityHaircutStartTurn?: number;
  clearing: SectorClearingResult | undefined;
  clearingEnabled: boolean;
  clearingFactor: number;
  clearingStartTurn: number | undefined;
  priceRealization: number;
  priceRatioByCommodity: CorporationLookups["priceRatioByCommodity"];
  embargoLegacyMothball: boolean;
  embargoTradeExposureActive: boolean;
  exportIntensityByCountry: CorporationLookups["exportIntensityByCountry"];
  preFlipNameplateRevenue: number;
  plantsNameplateRevenue: number;
  revenueMultiplier: number;
  nationalizationTransition: number;
  throughputFactor: number;
  labourOutputFactor: number;
  strategyIsTransitioning: boolean;
  retoolCapacityRatio: number;
  priorProductionUnitRatio: number;
  disasterOutputFactor: number;
  newPolicyLevel: number;
  /** >= 1; commodity treadmill fix stage 4 shortage headroom (default 1). */
  policyHeadroomFactor?: number;
  plantsCapacity: number;
  plantsMixPrice: number;
  plantsStartTurn: number | undefined | null;
  currentTurn: number;
  /** Originating reset preset; keys the energy productivity ramp. */
  preset?: string;
  governorCap: number;
  governorRampTurns: number;
  /** World flip turn (see `MarketContext.worldGovernorAnchorTurn`). */
  worldGovernorAnchorTurn?: number | null;
  /** Proportional governor glide (see `MarketContext.governorGlide`). */
  governorGlide?: GovernorGlide | null;
  privateBankingEnabled?: boolean;
  marketPlantsEnabled: boolean;
  contractProductionTargetBySectorId: MarketContext["contractProductionTargetBySectorId"];
  /**
   * Share of the plant that runs this turn because it is restarting (back from
   * mothball, or its first capacity just landed): clearing offers last turn's
   * output, so a restarting plant has nothing on the market yet. 1 otherwise.
   * Production only; the demand throttle and every demand read are untouched.
   */
  restartRunShare?: number;
  /**
   * Lagged price over base for one output in this sector's own market (state
   * book for state-scoped outputs, else its reachable country book, else the
   * world). Values each output leg when restating last turn's sales for the
   * demand throttle. Absent reads the world ratio.
   */
  throttleLegPriceRatio?: (commodity: CommodityType) => number | null | undefined;
  /**
   * Lagged supply and demand of the book one output clears in, the same book
   * `throttleLegPriceRatio` prices. Lets a plant that sold out into a short
   * market ramp to unmet demand. Absent means no headroom.
   */
  throttleLegBalance?: (
    commodity: CommodityType
  ) => { supply: number; demand: number } | null | undefined;
  /** Reachable country or global balance for the extraction shortage fill gate. */
  throttleWideBalance?: (
    commodity: CommodityType
  ) => { supply: number; demand: number } | null | undefined;
  /** Share of one sector output unit that is this commodity, as clearing splits offers. */
  throttleLegMixWeight?: (commodity: CommodityType) => number;
}

export interface CapacityBindingEvent {
  sectorId: string;
  corporationId: string;
  stateId: string;
  bindingResource: ExtractableResource;
  utilization: number;
}

export interface PlantsRevenueResult {
  clearingRevenueLeg: number;
  embargoExportExposure: number;
  embargoRevenueFactor: number;
  plantsExtractionHardMin: number;
  activeExtractionHardMin: number;
  baselineHourlyRevenue: number;
  plantsTechOutputMultiplier: number;
  policyTonnageMultiplier: number;
  productionFactor: number;
  bankingCommodityScale: number;
  productionNameplateUnits: number;
  producedUnits: number;
  soldUnits: number;
  contractAchievableUnits: number;
  demandThrottleFactor: number;
  /**
   * Last turn's sold share of output, valued as the throttle values it. Null
   * without a fresh clearing signal. Feeds idle capacity retirement.
   */
  demandFill: number | null;
  plantsDerivedHourlyRevenue: number;
  marketHourlyRevenue: number;
  militaryDivertedFraction: number;
  hourlyRevenue: number;
  capacityBindingEvent: CapacityBindingEvent | null;
}

const EMPTY_EXPORT_INTENSITY: ReadonlyMap<CommodityType, number> = new Map();

export function resolvePlantsRevenue(input: PlantsRevenueInput): PlantsRevenueResult {
  const {
    sector,
    corp,
    strategySupply,
    techEffects,
    plantsEnabled,
    mothballed,
    nameplateUnits,
    activeFraction,
    plantsRampLambda,
    capacityUtil,
    capacityHaircut,
    capitalFactor,
    clearing,
    clearingEnabled,
    clearingFactor,
    clearingStartTurn,
    currentTurn,
    preset,
    priceRealization,
    priceRatioByCommodity,
    embargoLegacyMothball,
    embargoTradeExposureActive,
    exportIntensityByCountry,
    preFlipNameplateRevenue,
    plantsNameplateRevenue,
    revenueMultiplier,
    nationalizationTransition,
    throughputFactor,
    labourOutputFactor,
    strategyIsTransitioning,
    retoolCapacityRatio,
    priorProductionUnitRatio,
    disasterOutputFactor,
    newPolicyLevel,
    plantsCapacity,
    plantsMixPrice,
    plantsStartTurn,
    governorCap,
    governorRampTurns,
    worldGovernorAnchorTurn,
    governorGlide,
    privateBankingEnabled,
    marketPlantsEnabled,
    contractProductionTargetBySectorId,
    restartRunShare = 1,
    throttleLegPriceRatio,
    throttleLegBalance,
    throttleWideBalance,
    throttleLegMixWeight,
  } = input;

  // Launch-safety governor: the clearing price/volume leg (clearingFactor)
  // replaces the ledger's priceRealization, but on thin-margin corps a
  // few-percent gap between the two swings earnings (and share prices) by
  // 50-80% on flip. Bound clearing to within ±CAP of the ledger baseline and
  // ramp that divergence in from 0, so the flip is a no-op and valuations
  // drift instead of cratering. Scoped to the clearing leg only — capitalFactor
  // (the deliberate capacity-decay gate for non-investment) still applies in
  // full. Off-mode this is the plain priceRealization path (clearingFactor 1).
  const clearingRevenueLeg = clearingEnabled
    ? input.costPlusPricingEnabled
      ? clearingFactor
      : softenedMarketRealization(
          computePriceRealization(strategySupply ?? {}, priceRatioByCommodity),
          clearingFactor,
          governorAnchorTurn(clearingStartTurn, worldGovernorAnchorTurn, governorGlide),
          currentTurn,
          governorCap,
          governorRampTurns
        )
    : priceRealization;
  // Trade-exposure embargo: fraction of this sector's output that clears abroad,
  // from the prior turn's trade snapshot (same one-turn-lagged intensity the
  // export premium uses). 0 unless the new model is active for this sector.
  const embargoExportExposure = embargoTradeExposureActive
    ? computeExportExposure(
        strategySupply,
        exportIntensityByCountry.get(sector.countryId ?? corp.countryId) ?? EMPTY_EXPORT_INTENSITY
      )
    : 0;
  // Revenue kept after the embargo strips its export leg: 0 under the legacy
  // mothball, else the domestic remainder (1 − exported share), else 1.
  const embargoRevenueFactor = embargoLegacyMothball
    ? 0
    : 1 - embargoExportExposure * TRADE_EMBARGO_EXPORT_LOSS_SHARE;
  // Extraction under plants is gated by TWO capacity systems: the sector's
  // capital stock and the state's geology. The geological leg arrives as a soft
  // REVENUE haircut floored at EXTRACTION_CAPACITY_HAIRCUT_FLOOR (0.5) and
  // faded in over a 240-turn per-sector grace window.
  //
  // Under plants, capacity IS the production base, so the deposit is a HARD
  // ceiling on the same quantity:
  //
  //     producedUnits = min(plant-driven produced, state resource remaining)
  //
  // No floor and no grace: the plants ramp below is the only fade-in.
  // `plantsRampLambda` is 0 on the sector's first plants turn, so the factor is
  // exactly 1 there. Non-extraction sectors and non-plants worlds are
  // unaffected.
  const extractionRampLambda = Math.max(
    plantsRampLambda,
    Math.max(0, Math.min(1, input.noBuyerPhaseOut ?? 0))
  );
  const plantsExtractionHardMin =
    plantsEnabled && sector.sectorType === "extraction"
      ? 1 - extractionRampLambda * (1 - Math.max(0, Math.min(1, capacityUtil.utilization)))
      : 1;
  const activeExtractionHardMin = activeCapacityConstraintFactor(
    plantsExtractionHardMin,
    activeFraction
  );
  // techEffects.outputRateMult scales the supply rates sector reports to the
  // commodity ledger, but producedUnits (and derived revenue) come from
  // capitalStock, so under plants the effect was half-wired. techOutputUnitsMultiplier
  // is the same scaling expressed in capacity units, so produced == offered == ledger.
  //
  // The multiplier is exactly 1 for an empty outputRateMult and for non-plants
  // sectors, so the flip turn is unchanged. The 1991 energy productivity ramp is
  // folded into this multiplier, not a new leg, keeping produced == offered == ledger.
  const plantsTechOutputMultiplier = plantsEnabled
    ? productionProductivityMultiplier({
        sectorType: sector.sectorType,
        supply: strategySupply,
        outputRateMult: techEffects.outputRateMult,
        currentTurn,
        preset,
      })
    : 1;
  // `baselineHourlyRevenue` is the pre-plants COUNTERFACTUAL. Under plants it is
  // the governor's clamp anchor, so it must carry the legs capital mode carried
  // (`capacityHaircut` and `capitalFactor`). Gating them off here jumps the
  // anchor on flip (λ = 0 returns the anchor verbatim). Do not "fix" the
  // asymmetry. Not a compounding decay: under plants `sector.revenue` was
  // restated as `plantsCapacity x plantsMixPrice`, so the haircut multiplies the
  // anchor once per turn at a constant level. `governorEffectiveCap` drops the
  // clamp at full ramp; after that `plantsExtractionHardMin` and capacity price
  // it.
  // A mid-transition sector governs against its transitioning nameplate once
  // divergence is allowed, but on the flip turn (lambda 0) the governor
  // returns the anchor verbatim: the anchor must be the capital-mode
  // counterfactual there, or the flip books headroom plus the blend as
  // revenue (measured +12% on a manufacturing standard to premium flip).
  const baselineHourlyRevenue =
    ((plantsEnabled && strategyIsTransitioning && retoolCapacityRatio !== 1 && plantsRampLambda > 0
      ? plantsNameplateRevenue
      : preFlipNameplateRevenue) /
      TURNS_PER_DAY) *
    revenueMultiplier *
    nationalizationTransition *
    capacityHaircut *
    clearingRevenueLeg *
    throughputFactor *
    capitalFactor *
    labourOutputFactor *
    // Output-per-capacity gains (tech output rate, energy productivity ramp) raise `producedUnits`, so the anchor must carry them too. Without this, extra output reads as excess revenue and gets clamped, selling units below the clearing-leg price. Exactly 1 without tech or ramp, so the flip identity and other sectors are unchanged.
    plantsTechOutputMultiplier *
    // Embargo: legacy total mothball earns nothing (factor 0); the trade-exposure
    // model keeps the domestic remainder (1 − exported share). 1 when unembargoed.
    embargoRevenueFactor;
  // The policy slider publishes two curves: an OUTPUT curve (−10%…+15%) and a
  // REVENUE curve (−5%…+10%). Under plants, revenue is DERIVED from tonnage, so
  // exactly one may gate `productionFactor` or the slider is counted twice.
  // The OUTPUT curve gates tonnage and the revenue curve steps aside, and
  // `plantsSupplyScaledUnits` no longer re-applies output, so produced ==
  // offered. Applies the chain exactly once. At policy 0 both curves are 1.0,
  // so nothing moves; non-plants worlds are untouched.
  const policyTonnageMultiplier = plantsEnabled
    ? getOutputMultiplier(newPolicyLevel) * (input.policyHeadroomFactor ?? 1)
    : revenueMultiplier;
  const productionFactor =
    disasterOutputFactor *
    policyTonnageMultiplier *
    nationalizationTransition *
    (plantsEnabled ? activeExtractionHardMin : capacityHaircut) *
    throughputFactor *
    // Under plants, capacity IS the production base (see plantsCapacity), so
    // folding the capacity/implied-units haircut in here as well would gate the
    // same constraint twice.
    (plantsEnabled ? 1 : capitalFactor) *
    plantsTechOutputMultiplier *
    labourOutputFactor;
  // Locked decision 18: chartered financial capacity is split between commodity
  // financial_services output and the branch network (deposit ceiling). Scale
  // only the capacity that enters production; stored capitalStock is untouched.
  // Gated on privateBankingEnabled + ACTIVE charter — zero change otherwise.
  const bankingCommodityScale =
    sector.sectorType === "financial"
      ? commodityProductionCapacityScale(corp.bankCharter, privateBankingEnabled === true)
      : 1;
  const productionNameplateUnits = plantsEnabled
    ? mothballed
      ? 0
      : plantsCapacity * bankingCommodityScale * activeFraction
    : nameplateUnits * bankingCommodityScale;
  // The pre-pass just cleared the persisted prior output. Use that fill with
  // that quantity, not the saved fill from an older clearing book. Prices and
  // revenue retain their existing lagged-market convention.
  // Units a media ownership law refused still had buyers, so they count as
  // demand here; a capped outlet must not shrink because of a legal limit.
  const feedbackFill =
    clearingEnabled && clearing
      ? withRegulationBlockedFill(clearing.soldByCommodity, clearing.regulationBlockedByCommodity)
      : sector.soldByCommodity;
  // Editorial stance shrank the advertising offer, not the demand behind it, so
  // the sold-out test reads the fill with that cut undone. Only the restored
  // fill feeds headroom; the throttle's own sales history is untouched.
  const headroomFill =
    clearingEnabled && clearing
      ? withEditorialAvailabilityRestored(feedbackFill, clearing.editorialAvailabilityByCommodity)
      : feedbackFill;
  const feedbackSold =
    clearingEnabled && clearing && sector.producedUnits != null
      ? sector.producedUnits *
        Math.min(1, clearing.soldFraction + (clearing.regulationBlockedFraction ?? 0))
      : sector.soldUnits;
  const priorThrottleSoldUnits = (() => {
    const sold = throttleSoldUnits({
      producedUnits: sector.producedUnits,
      soldUnits: feedbackSold,
      soldByCommodity: feedbackFill,
      supplyRates: strategySupply,
      priceRatioFor: (commodity) =>
        throttleLegPriceRatio?.(commodity as CommodityType) ??
        priceRatioByCommodity.get(commodity as CommodityType),
    });
    return sold == null ? sold : sold * priorProductionUnitRatio;
  })();
  const priorThrottleProducedUnits =
    sector.producedUnits == null
      ? sector.producedUnits
      : sector.producedUnits * priorProductionUnitRatio;
  // Last turn's value-weighted sell-through, the same evidence the throttle
  // reads. Without clearing, sold equals produced and this reads 1.
  const demandFill =
    plantsEnabled &&
    typeof priorThrottleSoldUnits === "number" &&
    Number.isFinite(priorThrottleSoldUnits) &&
    typeof priorThrottleProducedUnits === "number" &&
    Number.isFinite(priorThrottleProducedUnits) &&
    priorThrottleProducedUnits > 0
      ? Math.max(0, Math.min(1, priorThrottleSoldUnits / priorThrottleProducedUnits))
      : null;
  // Restart: run only the restart share, or what a supply contract needs if
  // more. A factor on production, not on the demand throttle, so no demand
  // read (saturation, retirement, idle upkeep) mistakes a restart for low demand.
  const guaranteedUnits = marketPlantsEnabled
    ? contractProductionTargetBySectorId?.get(sector._id.toString())
    : undefined;
  const restartFactor = plantsEnabled
    ? restartProductionFactor({
        restartRunShare,
        guaranteedUnits,
        plannedUnits: productionNameplateUnits * productionFactor,
      })
    : 1;
  const production = computeContractProduction({
    plantsEnabled,
    actualNameplateUnits: productionNameplateUnits,
    actualProductionFactor: productionFactor * restartFactor,
    fullPolicyNameplateUnits: plantsCapacity * bankingCommodityScale,
    involuntaryProductionFactor:
      disasterOutputFactor *
      nationalizationTransition *
      plantsExtractionHardMin *
      throughputFactor *
      plantsTechOutputMultiplier *
      labourOutputFactor,
    // Sales restated by what buyers paid for each output leg, so a mixed plant
    // that sells out its valuable product is not cut for its glutted co-product.
    // Single-output sectors read `soldUnits` unchanged.
    priorSoldUnits: priorThrottleSoldUnits,
    priorProducedUnits: priorThrottleProducedUnits,
    guaranteedDemandUnits: marketPlantsEnabled
      ? contractProductionTargetBySectorId?.get(sector._id.toString())
      : undefined,
    // A plant that sold out into a book with buyers left unserved may step up
    // to that unmet demand instead of crawling 15% a turn (ticket 1393).
    marketHeadroomUnits:
      throttleLegBalance && throttleLegMixWeight
        ? soldOutMarketHeadroomUnits({
            soldByCommodity: headroomFill,
            supplyRates: strategySupply,
            marketShareFor: (commodity) =>
              clearing?.marketSupplyShareByCommodity?.[commodity as CommodityType],
            mixWeightFor: (commodity) => throttleLegMixWeight(commodity as CommodityType),
            balanceFor: (commodity) => throttleLegBalance(commodity as CommodityType),
            wideBalanceFor:
              sector.sectorType === "extraction" && throttleWideBalance
                ? (commodity) => throttleWideBalance(commodity as CommodityType)
                : undefined,
            priceRatioFor: (commodity) =>
              throttleLegPriceRatio?.(commodity as CommodityType) ??
              priceRatioByCommodity.get(commodity as CommodityType),
          }) * priorProductionUnitRatio
        : undefined,
    soldFraction: clearingEnabled && clearing ? clearing.soldFraction : null,
    lossRunShare: input.lossRunShare,
  });
  const { producedUnits, soldUnits, contractAchievableUnits, demandThrottleFactor } = production;
  // Plants: revenue is DERIVED from produced output, exactly inverting the P1
  // identity (producedUnits × mixPrice × sales legs == realizedRevenue). At the
  // flip, capacity == impliedOutputUnits(nameplate) and every leg is unchanged,
  // so this reproduces the old realized revenue EXACTLY — which is why the
  // migration above seeds capacity from implied units.
  const plantsDerivedHourlyRevenue = plantsEnabled
    ? ((producedUnits * plantsMixPrice) / TURNS_PER_DAY) * clearingRevenueLeg * embargoRevenueFactor
    : 0;
  // Launch-safety governor: bound derived revenue to within ±capEffective(λ) of
  // the pre-flip baseline, fading in over the ramp. λ=0 on the flip turn returns
  // the baseline exactly. This is an AMOUNT, so it uses the amount variant: the
  // factor variant substitutes the baseline when market input <= 0, which would
  // pay a halt its full nameplate revenue and make the boundary discontinuous.
  // A zero baseline passes through (no anchor to govern). Mothballed sectors earn
  // exactly 0, bypassing the governor even mid-ramp.
  const marketHourlyRevenue = mothballed
    ? 0
    : plantsEnabled
      ? input.costPlusPricingEnabled
        ? plantsDerivedHourlyRevenue
        : governedOrExemptRevenue(
            sector.plantsGovernorExempt === true,
            plantsDerivedHourlyRevenue,
            softenedMarketRealizationAmount(
              baselineHourlyRevenue * activeFraction,
              plantsDerivedHourlyRevenue,
              governorAnchorTurn(plantsStartTurn, worldGovernorAnchorTurn, governorGlide),
              currentTurn,
              governorCap,
              governorRampTurns
            )
          )
      : baselineHourlyRevenue;
  // Final realization leg: output shipped to a government arsenal under a defence contract
  // was already paid for per lot, and does not also get sold on the market. Without this the
  // plant earned its full market revenue AND the contract price for the same production — one
  // plant's output paid for twice, scaling with however many contracts a minister wrote.
  // The matching deduction on the goods side lives in `computeRawSupplyDemand`.
  const militaryDivertedFraction = freshMilitaryDiversion(sector, currentTurn);
  const hourlyRevenue = marketHourlyRevenue * (1 - militaryDivertedFraction);
  // Emit a notification event when a sector newly crosses into capacity-bound
  // territory (was unbound/undefined last turn, now below the threshold).
  // Returned as data; the caller pushes it, preserving the single write site.
  const capacityBindingEvent: CapacityBindingEvent | null =
    sector.sectorType === "extraction" &&
    capacityUtil.bindingResource != null &&
    capacityUtil.utilization < CAPACITY_BINDING_THRESHOLD &&
    (sector.capacityUtilization == null || sector.capacityUtilization >= CAPACITY_BINDING_THRESHOLD)
      ? {
          sectorId: sector._id.toString(),
          corporationId: corp._id.toString(),
          stateId: sector.stateId,
          bindingResource: capacityUtil.bindingResource,
          utilization: capacityUtil.utilization,
        }
      : null;

  return {
    clearingRevenueLeg,
    embargoExportExposure,
    embargoRevenueFactor,
    plantsExtractionHardMin,
    activeExtractionHardMin,
    baselineHourlyRevenue,
    plantsTechOutputMultiplier,
    policyTonnageMultiplier,
    productionFactor,
    bankingCommodityScale,
    productionNameplateUnits,
    producedUnits,
    soldUnits,
    contractAchievableUnits,
    demandThrottleFactor,
    demandFill,
    plantsDerivedHourlyRevenue,
    marketHourlyRevenue,
    militaryDivertedFraction,
    hourlyRevenue,
    capacityBindingEvent,
  };
}

/**
 * A player-built sector born under plants is exempt from the launch governor
 * so it is never held BELOW its market revenue. The exemption may only lift
 * revenue: where the governed value is higher (a sector whose pre-flip anchor
 * sits above what its local market now pays, such as media stations in small
 * states), it keeps the governed value.
 */
export function governedOrExemptRevenue(
  exempt: boolean,
  derived: number,
  governed: number
): number {
  return exempt ? Math.max(derived, governed) : governed;
}
