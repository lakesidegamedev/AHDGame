import { settleSectorAccounts } from "@/lib/turn/corporation/settleSectorAccounts";
import { operatingCrewFactor } from "@/lib/societyPressures/rules/automation";
import { corporateGrowthWithPayables } from "./rules/corporateTaxPriority";
/**
 * Sector operations turn owned capacity into sales, jobs and operating profit.
 * processSector prices production, upkeep and policy effects while preserving payroll.
 */

import {
  specializationMaintenance,
  specializationPayrollModifier,
} from "@/lib/corporations/specialization/rules";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";

import type { CommodityType } from "@/lib/constants/commodities";
import { eraScaledBasePrices } from "@/lib/constants/commodities";
import {
  commodityMixWeights,
  mixWeightFor as mixWeightFrom,
} from "@/lib/market/rules/commodityMixWeights";
import { trendProductionPolicy, getRevenueMultiplier } from "@/lib/utils/productionPolicy";
import {
  calculateDailyGrowthCost,
  TURNS_PER_DAY,
  getDominanceGrowthCostMultiplier,
  getNationalDominanceGrowthCostMultiplier,
  getLogisticsShippingMultiplier,
  softCapEffectiveMargin,
  nextNegativeProductionCounter,
} from "@/lib/constants/corporations";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import { isAutopilotRun } from "@/lib/corporations/autopilot";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";

import { sociMultiplier } from "@/lib/nationalization/concentration";
import { nationalizationProductivityFactor } from "@/lib/nationalization/transitionShock";

import { lawAdjustedLabourFactor, lawWageCostMultiplier } from "@/lib/automationPolicy/policies";
import { resolveSectorTechEffects } from "./sectorTurn/sectorTechEffects";

import { getCountryConfig } from "@/lib/constants/countries";
import { NEUTRAL_STAT } from "@/lib/stats/statsConstants";
import { getEffectiveStrategyRates } from "@/lib/constants/sectorStrategies";

import { computeMarketTiers } from "./sectorTurn/marketTiers";
import { computePlantsCapacity } from "./sectorTurn/plantsCapacity";
import { accumulateMarginModifiers } from "./sectorTurn/marginStack";
import { resolvePlantsRevenue } from "./sectorTurn/plantsRevenue";
import { computeGrowthAndRegulatory } from "./sectorTurn/sectorCosts";
import { resolveBuildQueueTurn } from "./sectorBuildQueueTurn";

import { resolveSectorGrowthPolicy } from "./sectorGrowthPolicy";
import {
  resolveSectorHeadcount,
  fundedPayrollShare,
  resolveSectorLabourEconomics,
  resolveSectorLabourProductionEffects,
} from "./sectorLabour";

import type { SectorTurnEnv, SectorTurnResult } from "./sectorTurnTypes";

import { resolveSectorFreightBillingLegs } from "./freightBillingTurn";
import { isExtractionStrategyZeroYield } from "@/lib/corporations/extractionStrategyAvailability";
import { noBuyerPhaseOutProgress } from "@/lib/extraction/capacityHaircut";

import { resolveSectorCapacityHaircut } from "./sectorCapacityHaircut";

export { computeSectorOutputUnits } from "./sectorOutputUnits";
export type { SectorTurnEnv, SectorTurnResult } from "./sectorTurnTypes";

import { computeIdleUpkeep } from "./sectorTurn/idleUpkeep";
import { contributionShare, nextLossRun } from "./rules/lossRun";
import { isStateScopedCommodity } from "@/lib/market/commodityMarketScope";
import { liftedThrottleBalance } from "./demandThrottle";
import { nppOperatingCapacityTarget } from "./rules/nppOperatingCapacity";
import { idleCapacityRetirement, IDLE_RETIRE_GRACE_TURNS } from "./rules/idleCapacityRetirement";
import { plantCrewMaxDropPerTurn, plantCrewShare } from "./rules/plantRunShare";
import {
  PLANT_CREW_FLOOR_SHARE,
  PLANT_CREW_MAX_DROP_PER_TURN,
  RESTART_RUN_SHARE,
  PLANT_CREW_SUSTAINED_GLUT_MAX_DROP_PER_TURN,
  PLANT_CREW_SUSTAINED_GLUT_THROTTLE,
} from "@/lib/constants/capacityEconomy";
import { seedPlantLedger } from "@/lib/corporations/plantLedger";
import { applyPlantChange } from "@/lib/corporations/wholePlants/rules";
import { plantSizeForSector } from "@/lib/constants/facilityQuantum";
import { supportsCostPlusPricing, validCostPlusBasis } from "@/lib/market/costPlusPricing/rules";

import { shortagePolicyHeadroom } from "@/lib/market/commodityFixStages";
import { stagedMarginTrimPp } from "@/lib/market/marketRecoveryStages";

/** Process one sector and append its persisted update to the turn collectors. */
function prepareProcessSector(
  env: SectorTurnEnv,
  corp: Corporation,
  sector: CorporateSector,
  corpSectorCount: number,
  sectorCurrencyCode: CurrencyCode | undefined,
  sectorFxRate: number
) {
  const {
    lookups,
    turn,
    currentTurn,
    now,
    techTreesEnabled,
    currentYear,
    commandEconomyEnabled,
    labour,
    market,
    wageIndexByState,
    automationIndexByState,
    labourDemandByState,
    pendingStrikeEvents,
    pendingCapacityBindingEvents,
    sectorOps,
  } = env;
  // The ids are read by a dozen map lookups below; convert once per sector.
  const sectorId = sector._id.toString();
  const corpId = corp._id.toString();
  const operatingSectorType = sector.sectorType;

  // Per-sector tech effects (see sectorTurn/sectorTechEffects.ts).
  const techEffects = resolveSectorTechEffects(
    corp,
    sector,
    lookups,
    techTreesEnabled,
    currentYear,
    operatingSectorType
  );
  // Normalize host-currency revenue to anchor currency. Recover corrupt values
  // here so NaN cannot spread through corporate totals and tax accruals.
  const rawSectorRevenue = Number.isFinite(sector.revenue) ? sector.revenue : 0;
  const sectorRevenueAnchor = readCorpEconomicAnchor(
    rawSectorRevenue,
    sectorCurrencyCode,
    sectorFxRate
  );

  const embargoSuppressed =
    lookups.corporateEmbargoSuppression?.has(
      `${sector.countryId ?? corp.countryId}|${corp.countryId}`
    ) ?? false;
  const useTradeExposureEmbargo = lookups.embargoTradeExposureEnabled === true;
  const plantsEnabled = market.plantsEnabled;
  const explicitPlantCostsEnabled = plantsEnabled && market.explicitPlantCostsEnabled === true;
  // The era-scaled base price table depends only on the world's unit scale, so
  // this sector builds it once and every leg below reads the same object
  // instead of rebuilding all 27 rows per reader.
  const basePrices = eraScaledBasePrices(lookups.eraUnitScale);
  const {
    brakedTargetRate,
    newCurrentGrowthRate,
    perTurnGrowthRate,
    embargoLegacyMothball,
    embargoTradeExposureActive,
    newRevenue,
    preFlipNameplateRevenue,
  } = corporateGrowthWithPayables(
    resolveSectorGrowthPolicy({
      corp,
      sector,
      currentYear,
      commandEconomyEnabled,
      sectorRevenueAnchor,
      plantsEnabled,
      embargoSuppressed,
      useTradeExposureEmbargo,
    }),
    corp,
    sectorRevenueAnchor,
    plantsEnabled
  );

  // Recalculate daily growth cost; legacy sectors fall back to the HQ country.
  const sectorCountryId = sector.countryId ?? corp.countryId;
  // Partition worlds: the WIDE balance leg this sector reads (margin
  // modifiers, throughput coupling) is its country's REACHABLE book — the
  // same book clearing fills it from — so a sector behind an embargo wall is
  // margin-priced and input-throttled against the market it actually trades
  // in. Modern worlds build no books → the worldwide aggregate, unchanged.
  const wideCommodityBalances =
    lookups.countryClearingBooks?.get(sectorCountryId) ?? lookups.globalCommodityBalances;
  const primeRate =
    lookups.primeRateByCountry.get(sectorCountryId) ??
    getCountryConfig(sectorCountryId).centralBank.defaultPrimeRate;
  const sectorMarketSharePct = lookups.marketShareBySectorId.get(sectorId) ?? 0;
  // The owning corp's aggregate share of this (country, sectorType) across every
  // state. The per-cell share above is a LOCAL contest (50% threshold); a corp
  // can command a whole nation's sector while sitting under 50% in each state.
  // National share is a weighted average of the cell shares, so it is always
  // ≤ the largest cell — the national toll uses a LOWER threshold (30%) to bite
  // at all. Each toll is charged at the HARSHER of its local and national leg:
  // min() for the negative margin penalty, max() for the positive growth-cost
  // multiplier and regulatory burden. Absent lookup → national 0 → local-only.
  const nationalDominanceSharePct = lookups.nationalDominanceShareBySectorId?.get(sectorId) ?? 0;
  const dominanceGrowthMult = Math.max(
    getDominanceGrowthCostMultiplier(sectorMarketSharePct),
    getNationalDominanceGrowthCostMultiplier(nationalDominanceSharePct)
  );
  // Business Acumen: a player CEO's stat makes growth cheaper and dampens the
  // prime-rate penalty. Absent (NPP/imperial/vacant) → neutral.
  const ceoAcumen = lookups.ceoBusinessAcumenByCorpId.get(corpId) ?? NEUTRAL_STAT;
  // A state monopoly is exempt from the private-firm dominance growth toll:
  // applying it alongside the command-economy soft budget creates an unchecked
  // growth-cost ratchet because a state firm cannot go bankrupt. We pass share 0
  // into calculateDailyGrowthCost (no internal dominance leg) and apply the
  // combined local+national growth multiplier here so both thresholds compose.
  // Use the pre-flip nameplate so enabling plants does not change growth cost.
  const newGrowthCost =
    calculateDailyGrowthCost(preFlipNameplateRevenue, perTurnGrowthRate, primeRate, 0, ceoAcumen) *
    techEffects.growthCostMultiplier *
    (isStateOwned(corp) ? 1 : dominanceGrowthMult);

  // Calculate per-turn financials from daily amounts and state conditions.
  // Trend production policy level toward CEO-set target by 1 pt/turn
  const newPolicyLevel = trendProductionPolicy(
    sector.productionPolicyLevel ?? 0,
    sector.productionPolicy ?? 0
  );
  // Sustained-negative-production tracker: increments while negative,
  // decrements (floored at 0) while non-negative — no free reset.
  const newNegativeProductionTurns = nextNegativeProductionCounter(
    sector.negativeProductionSustainedTurns,
    newPolicyLevel
  );
  const revenueMultiplier = getRevenueMultiplier(newPolicyLevel);
  // Nationalization transition shock: a freshly state-owned sector produces at
  // a discount that recovers over NATIONALIZATION_TRANSITION_TURNS. Hits output
  // here (not the stored `newRevenue` base), so it fades back to full as the
  // window elapses. Private sectors are unaffected.
  // Live SOCI escalation for the owning country — drives the steady-state
  // overreach penalty below.
  const soeConcentrationMultiplier = isStateOwned(corp)
    ? sociMultiplier(
        lookups.stateOwnershipConcentrationByCountry?.get(corp.countryOwnerId ?? "") ?? 0
      )
    : 1;
  // Transition uses the per-sector snapshot (the SOCI multiplier at taking
  // time), NOT live SOCI — so raising concentration later can't retroactively
  // deepen an already-settled sector's digestion. Absent ⇒ 1 (base shock).
  const nationalizationTransition = isStateOwned(corp)
    ? nationalizationProductivityFactor(
        sector.nationalizedAtTurn,
        turn,
        sector.nationalizationTransitionMultiplier ?? 1
      )
    : 1;
  // v3 Phase 6: a sector with an active strike (persisted from a prior
  // turn's trigger — see the labour.unionsEnabled block below for where
  // strikes are triggered/resolved) has revenue throttled, not zeroed.
  // Checked on `labour.unionsEnabled` directly (not `wagesEnabled`):
  // LabourContext does not tie unionsEnabled to wagesEnabled, so this reads
  // `sector.strikeStartedAtTurn` regardless of wagesEnabled.
  const tightness = lookups.labourTightnessByState.get(sector.stateId);
  const stateDemandWageIndex = lookups.labourDemandWageIndexByState?.get(sector.stateId);
  const {
    outputFactor: labourOutputFactor,
    strikeMarginModifier,
    staffingFactor,
  } = resolveSectorLabourProductionEffects(
    labour,
    sector,
    tightness,
    stateDemandWageIndex,
    sectorCountryId
  );
  // Effective strategy rates, resolved once here and reused below by the
  // capacity haircut, price realization, and the blended commodity margin
  // modifiers (so non-standard strategies are priced against what the
  // sector actually produces/consumes).
  const strategyRates = getEffectiveStrategyRates(
    sector.sectorType,
    sector.strategyId ?? "standard",
    sector.transitionFromStrategyId,
    sector.transitionStartTurn,
    turn ?? 0,
    lookups.preset,
    lookups.hardwareInputReliefStartTurn
  );
  // No-buyer phase-out: a mine whose recipe has no leg its state can extract
  // put nothing on the clearing book, yet the deposit ramps kept crediting it
  // with output. Those ramps close for such mines over 24 turns from the
  // world's phase-out stamp. Every other sector reads 0 and is unchanged.
  const noBuyerPhaseOut =
    sector.sectorType === "extraction" &&
    isExtractionStrategyZeroYield(
      strategyRates,
      lookups.stateResourceCapacityByState.get(sector.stateId)
    )
      ? noBuyerPhaseOutProgress(lookups.extractionNoBuyerPhaseOutStartTurn, currentTurn)
      : 0;
  const { capacityUtil, capacityHaircutStartTurn, capacityHaircut } = resolveSectorCapacityHaircut(
    sector,
    lookups.extractionCapacityUtilBySector,
    currentTurn,
    noBuyerPhaseOut
  );
  // ─── Market-tier realization legs (clearing / throughput / capital) ──────
  // Pure computation in `sectorTurn/marketTiers.ts`; the orchestrator only
  // threads its inputs and consumes the legs. Names are unchanged, so every
  // reader below sees exactly what it saw before.
  const {
    clearing,
    clearingStartTurn,
    clearingFactor,
    priceRealization,
    throughputRaw,
    throughputStartTurn,
    throughputFactor,
    governorCap,
    nameplateUnits,
    newCapitalStock,
    capitalFactor,
  } = computeMarketTiers({
    sector,
    market,
    priceRatioByCommodity: lookups.priceRatioByCommodity,
    stateInputAvailabilityByState: lookups.stateInputAvailabilityByState,
    strategySupply: strategyRates.supply,
    strategyDemand: strategyRates.demand,
    wideCommodityBalances,
    stateBalances: lookups.rawStateBalances?.get(sector.stateId),
    stateId: sector.stateId,
    currentTurn,
    preFlipNameplateRevenue,
    perTurnGrowthRate,
    eraUnitScale: lookups.eraUnitScale,
  });
  // Resolve operation where allocated named demand and physical books are known.
  // NPP V6 and owner-enabled autopilot share this reversible rule; ordinary player
  // operation remains manual. Autopilot is owner-opted-in, so it does not depend on
  // the country's NPP autonomy tier. Neither may strand a buyer behind parked capacity.
  const originalActivePercent = sector.activeCapacityPercent;
  const autopilotOperationEligible = isAutopilotRun(corp);
  const nppV6OperationEligible =
    corp.ceoType === "npp" &&
    !corp.caretakerCeo &&
    !corp.suspended &&
    !corp.ceoVacant &&
    lookups.engineSixCountries?.has(corp.countryId) === true;
  const operatingCapacityEligible =
    plantsEnabled &&
    (nppV6OperationEligible || autopilotOperationEligible) &&
    sector.sectorType !== "media" &&
    !isStateOwned(corp) &&
    !corp.suspended &&
    !corp.ceoVacant &&
    corp.subsidiaryFormalizedAtTurn == null;
  let operatingCapacityTarget: number | null = null;
  if (operatingCapacityEligible) {
    // One book per positive output leg. Built with a loop: the filter/map chain
    // this replaced allocated an entries array, a pair per commodity and a
    // filtered array per sector.
    const supplyRates = strategyRates.supply ?? {};
    const outputBooks: ({ supply: number; demand: number } | null | undefined)[] = [];
    for (const rawCommodity in supplyRates) {
      const commodity = rawCommodity as CommodityType;
      if (!((supplyRates[commodity] ?? 0) > 0)) continue;
      // The book the throttle leg reads, so parking and throttling agree on demand.
      outputBooks.push(
        liftedThrottleBalance(
          isStateScopedCommodity(commodity)
            ? lookups.rawStateBalances?.get(sector.stateId)?.get(commodity)
            : (lookups.countryClearingBooks?.get(sectorCountryId)?.get(commodity) ??
                lookups.globalCommodityBalances?.get(commodity)),
          isStateScopedCommodity(commodity) || !lookups.countryClearingBooks?.has(sectorCountryId)
            ? 0
            : lookups.unmetForeignDemandByCountry?.get(sectorCountryId)?.get(commodity)
        )
      );
    }
    operatingCapacityTarget = nppOperatingCapacityTarget({
      eligible: true,
      mothballed: sector.mothballed === true,
      activePercent: originalActivePercent,
      demandThrottle: sector.demandThrottleFactor,
      measuredProfit: sector.plantsPnl?.profit,
      measuredTurn: sector.plantsPnl?.turn,
      currentTurn,
      contractDemand:
        market.contractProductionTargetBySectorId?.get(sectorId) ??
        (market.contractProductionTargetBySectorId ? 0 : undefined),
      outputBooks,
      physicalConstraintsClear:
        throughputRaw.throughput >= 1 &&
        labourOutputFactor >= 1 &&
        capacityUtil.utilization >= 1 &&
        !lookups.activeDisasterEffectsByState.has(sector.stateId),
      constructionOrRetool: strategyRates.isTransitioning || (sector.buildQueue?.length ?? 0) > 0,
    });
  }
  // (moved to computeMarketTiers: throughput coupling + downside floor)
  // (moved to computeMarketTiers: capital tier + P1 nameplate units)
  // Plants tier: capacity is AUTHORITATIVE, not a haircut.
  //
  // Lazy per-sector flip migration — the first plants turn adopts
  //   capacity := max(existing capitalStock, impliedOutputUnits(nameplate))
  // so a sector arriving from capital mode keeps the capital it built, and one
  // that never ran under capital starts at exactly the units its revenue base
  // implied (which is what makes the derived-revenue identity below exact for
  // it). Capacity then only DEPRECIATES this phase — the growth slider no
  // longer builds it; build orders arrive in P3.
  // ─── P3a: build queue ─────────────────────────────────────────────────────
  // Extracted whole to `sectorBuildQueueTurn.ts`: it is a pure computation and
  // this file was over the 2000 LOC block threshold. The WRITES stay below,
  // because the queue update is a delta inside the same bulk op.
  const {
    isFlipTurn,
    existingQueue,
    landedBuildUnits,
    landedBuildCostAnchor,
    flipGrowthCreditOrder,
    constructionInProgressAnchor,
    capacityUnitPriceAnchor,
  } = resolveBuildQueueTurn({
    sector,
    currentTurn,
    plantsEnabled,
    currentYear,
    sectorCurrencyCode,
    sectorFxRate,
    eraUnitScale: lookups.eraUnitScale,
    preset: lookups.preset,
    worldBuildsSettledTurn: lookups.worldBuildsSettledTurn,
  });
  // C4: the turn's queue write is a delta, never a whole-array $set.
  // `nextBuildQueue` is a snapshot; `$set`-ing it would erase an order a CEO
  // placed during this phase. Write only what the turn owns: `$pull` orders
  // that landed (`onlineTurn <= currentTurn`). CIP has one writer: this turn
  // derives its absolute value from the outstanding queue, including smooth
  // delivery, and clamps it at zero. Other queue writers never adjust CIP.
  // Flip-turn credit is a `$push` in a second bulkWrite op. Mongo rejects
  // `$pull` and `$push` on the same path in one update. bulkWrite is
  // ordered, so the pull always precedes the push.
  const landedOrderCount = plantsEnabled
    ? existingQueue.reduce((n, o) => (o.onlineTurn <= currentTurn ? n + 1 : n), 0)
    : 0;
  // ─── Plants capacity advance + P5 paid basis ──────────────────────────────
  // Pure computation in `sectorTurn/plantsCapacity.ts`; the orchestrator only
  // threads its inputs and consumes the legs. Names are unchanged, so every
  // reader below sees exactly what it saw before.
  const {
    mothballed,
    activeFraction,
    plantLedger,
    plantWearUnits,
    plantsOwnedCapacity,
    capacityBookAnchor,
    plantsMixPrice,
    storedOtherOpexAnchor,
    healedOpex,
    retoolCapacityRatio,
    priorProductionUnitRatio,
    plantsCapacity,
    plantsNameplateRevenue,
    plantsStartTurn,
    plantsRampLambda,
  } = computePlantsCapacity({
    sector,
    corp,
    activeCapacityPercent: operatingCapacityTarget,
    plantsEnabled,
    isFlipTurn,
    preFlipNameplateRevenue,
    strategySupply: strategyRates.supply,
    eraUnitScale: lookups.eraUnitScale,
    landedBuildUnits,
    landedBuildCostAnchor,
    capacityUnitPriceAnchor,
    newRevenue,
    currentTurn,
    governorRampTurns: market.governorRampTurns,
    worldGovernorAnchorTurn: market.worldGovernorAnchorTurn,
    governorGlide: market.governorGlide,
    embargoLegacyMothball,
    recessionCapacityFactor: lookups.recessionCapacityFactorByCountry?.get(sector.countryId ?? ""),
    wholePlants: lookups.wholePlantsOn === true,
  });
  // (moved to computePlantsCapacity: plant ledger + owned-capacity advance)
  // (moved to computePlantsCapacity: P5 paid basis of capacity)
  // (moved to computePlantsCapacity: mix price, opex heal, retool ratios)
  // (moved to computePlantsCapacity: nameplate revenue, ramp anchor + λ)
  // ─── Margin stack (tariffs / subsidies / supply / policy) ────────────────
  // Pure computation in `sectorTurn/marginStack.ts`; the orchestrator only
  // threads its inputs and consumes the legs. Runs before the revenue
  // resolution because the P3.5 disaster split it owns feeds tonnage.
  const corpCountry = corp.countryId;
  const politicalBoard = lookups.politicalBoardByState?.get(sector.stateId);
  const {
    disasterOutputFactor,
    effectiveDemand,
    commodityMod,
    surplusMod,
    exportPremiumMod,
    sectorTypeMatchMod,
    inflationMod,
    debtToGdpMod,
    deficitMod,
    stateMetricMargin,
    totalMarginMod,
    disasterMarginMod,
    nationalizedMarginPenalty,
    effectiveMargin,
    sprawlMod,
    dominanceMarginPenalty,
    fundedSizeLegs,
    revenueEffectLegs,
    dominanceCostPct,
    subsidyMod,
  } = accumulateMarginModifiers({
    corp,
    sector,
    // Market recovery stage 2 lowers the flat margin trim (marketRecoveryStages.ts).
    // Resolved here, once per sector, instead of copying the whole lookups object.
    lookups,
    marginLevelTrimPp: stagedMarginTrimPp(lookups.marginLevelTrimPp, market.marketRecoveryStage),
    strategySupply: strategyRates.supply,
    strategyDemand: strategyRates.demand,
    strategyIsTransitioning: strategyRates.isTransitioning,
    techEffects,
    sectorMarketSharePct,
    nationalDominanceSharePct,
    sectorCountryId,
    corpCountry,
    turn,
    currentTurn,
    plantsEnabled,
    plantsRampLambda,
    newNegativeProductionTurns,
    newPolicyLevel,
    embargoTradeExposureActive,
    soeConcentrationMultiplier,
    corpSectorCount,
    strikeMarginModifier,
    wideCommodityBalances,
    politicalBoard,
  });
  // Commodity treadmill fix stage 4: a plant at positive policy whose own
  // output clears into a deep shortage gets extra output AND input headroom.
  const policyHeadroomFactor = shortagePolicyHeadroom({
    stage: market.commodityFixStage,
    policyLevel: newPolicyLevel,
    supplyRates: strategyRates.supply,
    balances: wideCommodityBalances,
  });
  // ─── P3b extraction capacity + realized revenue ───────────────────────────
  // Pure computation in `sectorTurn/plantsRevenue.ts`; the orchestrator only
  // threads its inputs and consumes the legs. Names are unchanged.
  // Restart turn: the plant made nothing last turn (back from mothball, first
  // capacity just landed, or a full outage), so clearing has nothing of it on
  // the market this turn. It runs only RESTART_RUN_SHARE until real sales exist.
  const restarting =
    plantsEnabled && !mothballed && plantsCapacity > 0 && sector.producedUnits === 0;
  const restartRunShare = restarting ? RESTART_RUN_SHARE : 1;
  // Per-sector output mix weights, built on first use by the throttle legs.
  let throttleMixWeights: Map<CommodityType, number> | undefined;
  // A cold plant (no crew on site last turn) hires straight to its run; one
  // whose crew stayed through an outage keeps the gradual-layoff path.
  const coldRestart = restarting && (sector.workers ?? 0) <= 1;
  // Market rebuild 1b: a plant that keeps losing money on what it makes runs
  // less of it. Read from last turn's stored P&L; a missing or stale P&L, a
  // mothball or a restart holds the plant where it was.
  const priorPnl = sector.plantsPnl;
  const lossRun =
    plantsEnabled && explicitPlantCostsEnabled && !mothballed && !restarting
      ? nextLossRun({
          contribution:
            priorPnl && typeof priorPnl.turn === "number" && priorPnl.turn >= currentTurn - 1
              ? contributionShare(priorPnl, PLANT_CREW_FLOOR_SHARE)
              : null,
          priorShare: sector.lossRunShare,
          priorStreak: sector.lossRunStreak,
        })
      : { share: sector.lossRunShare ?? 1, streak: sector.lossRunStreak ?? 0 };
  const {
    plantsExtractionHardMin,
    producedUnits,
    soldUnits,
    contractAchievableUnits,
    demandThrottleFactor,
    demandFill,
    embargoExportExposure,
    hourlyRevenue: realizedHourlyRevenue,
    capacityBindingEvent,
  } = resolvePlantsRevenue({
    restartRunShare,
    lossRunShare: lossRun.share,
    sector,
    corp,
    strategySupply: strategyRates.supply,
    techEffects,
    plantsEnabled,
    costPlusPricingEnabled:
      market.clearingEnabled &&
      explicitPlantCostsEnabled &&
      supportsCostPlusPricing(sector.sectorType) &&
      sector.pricingMode === "costPlus" &&
      validCostPlusBasis(sector.costPlusCostBasis),
    mothballed,
    nameplateUnits,
    activeFraction,
    plantsRampLambda,
    noBuyerPhaseOut,
    capacityUtil,
    capacityHaircut,
    capitalFactor,
    clearing,
    clearingEnabled: market.clearingEnabled,
    clearingFactor,
    clearingStartTurn,
    currentTurn,
    preset: lookups.preset,
    priceRealization,
    priceRatioByCommodity: lookups.priceRatioByCommodity,
    embargoLegacyMothball,
    embargoTradeExposureActive,
    exportIntensityByCountry: lookups.exportIntensityByCountry,
    preFlipNameplateRevenue,
    plantsNameplateRevenue,
    revenueMultiplier,
    nationalizationTransition,
    throughputFactor,
    labourOutputFactor,
    strategyIsTransitioning: strategyRates.isTransitioning,
    retoolCapacityRatio,
    priorProductionUnitRatio,
    disasterOutputFactor,
    newPolicyLevel,
    policyHeadroomFactor,
    plantsCapacity,
    plantsMixPrice,
    plantsStartTurn,
    governorCap,
    governorRampTurns: market.governorRampTurns,
    worldGovernorAnchorTurn: market.worldGovernorAnchorTurn,
    governorGlide: market.governorGlide,
    marketPlantsEnabled: market.plantsEnabled,
    contractProductionTargetBySectorId: market.contractProductionTargetBySectorId,
    // The same market each leg clears and realizes in (see clearing.ts):
    // state book for state-scoped outputs, else the sector's reachable book.
    throttleLegPriceRatio: (commodity) =>
      isStateScopedCommodity(commodity)
        ? lookups.statePriceRatioByState?.get(sector.stateId)?.get(commodity)
        : lookups.reachablePriceRatioByCountry?.get(sectorCountryId)?.get(commodity),
    throttleLegBalance: (commodity) =>
      liftedThrottleBalance(
        isStateScopedCommodity(commodity)
          ? lookups.rawStateBalances?.get(sector.stateId)?.get(commodity)
          : (lookups.countryClearingBooks?.get(sectorCountryId)?.get(commodity) ??
              lookups.globalCommodityBalances?.get(commodity)),
        // Only a country-scoped book pins an exporter's demand to its supply.
        // Local services never cross a state line, and a single worldwide book
        // already holds every country's demand, so neither adds foreign room.
        isStateScopedCommodity(commodity) || !lookups.countryClearingBooks?.has(sectorCountryId)
          ? 0
          : lookups.unmetForeignDemandByCountry?.get(sectorCountryId)?.get(commodity)
      ),
    // The extraction "sold at least half" allowance reads the WIDE book. For a
    // country-scoped output that is the same reachable book the sold-out leg
    // reads, so it needs the same lift: an exporter's raw book pins demand to
    // its supply, and without the foreign-demand lift the allowance is always
    // zero however short the country's own buyers are.
    throttleWideBalance: (commodity) =>
      liftedThrottleBalance(
        wideCommodityBalances.get(commodity),
        isStateScopedCommodity(commodity) || !lookups.countryClearingBooks?.has(sectorCountryId)
          ? 0
          : lookups.unmetForeignDemandByCountry?.get(sectorCountryId)?.get(commodity)
      ),
    throttleLegMixWeight: (commodity) => {
      // One mix total for the whole sector, built only when a sold-out plant
      // asks for a leg weight.
      throttleMixWeights ??= commodityMixWeights(strategyRates.supply, basePrices);
      return mixWeightFrom(throttleMixWeights, commodity);
    },
  });
  if (capacityBindingEvent) {
    pendingCapacityBindingEvents.push(capacityBindingEvent);
  }
  // Capacity the market persistently will not buy retires toward the size the
  // plant can sell (see rules/idleCapacityRetirement). It is applied to the
  // stock persisted for NEXT turn: this turn runs, staffs and bills the plant
  // it started with, and the paid basis and plant ledger shrink with the stock
  // so the per-unit book stays flat, exactly as depreciation does.
  const idleRetirement = idleCapacityRetirement({
    plantsEnabled,
    mothballed,
    activeFraction,
    demandThrottleFactor,
    demandFill,
    priorStreak: sector.demandIdleTurns,
    rampLambda: plantsRampLambda,
    nppRun: corp.ceoType === "npp",
    nppStructural:
      corp.ceoType === "npp" && lookups.engineSixCountries?.has(corp.countryId) === true,
  });
  const retainedCapacityShare = 1 - idleRetirement.retireFraction;
  // Whole plants: retirement is wear too, and it is the one path that may take
  // the last plant (a plant nobody buys from closes).
  const idleWholePlants =
    plantWearUnits != null && plantLedger
      ? applyPlantChange(
          {
            capitalStock: plantsOwnedCapacity,
            plantUnitRemainder: plantLedger.plantUnitRemainder,
            plantWearUnits,
          },
          plantSizeForSector(sector),
          {
            lossUnits: plantsOwnedCapacity * idleRetirement.retireFraction,
            protectLastPlant: false,
          }
        )
      : null;
  const persistedOwnedCapacity = idleWholePlants
    ? idleWholePlants.capitalStock
    : plantsOwnedCapacity * retainedCapacityShare;
  const idleCapacityRetiredUnits = plantsOwnedCapacity - persistedOwnedCapacity;
  const persistedCapacityBookAnchor =
    capacityBookAnchor * (idleWholePlants ? idleWholePlants.bookRetention : retainedCapacityShare);
  const persistedPlantLedger = idleWholePlants
    ? {
        plantCount: idleWholePlants.plantCount,
        plantUnitRemainder: idleWholePlants.plantUnitRemainder,
      }
    : idleRetirement.retireFraction > 0
      ? seedPlantLedger(sector, persistedOwnedCapacity)
      : plantLedger;
  // A released product venture lifts realized revenue for a few days, after
  // every market-microstructure leg (governor, clearing, embargo) has run, so
  // those legs keep pricing what the market actually cleared. Nameplate
  // revenue above (the headcount basis) is deliberately unboosted.
  const hourlyRevenue =
    realizedHourlyRevenue * (lookups.productVentureBoostBySectorId?.get(sectorId) ?? 1);
  // (moved to resolvePlantsRevenue: trade-exposure embargo legs)
  // (moved to resolvePlantsRevenue: P3b extraction hard min)
  // (moved to resolvePlantsRevenue: pre-plants counterfactual baseline)
  // P1 units telemetry: the production-side legs of the chain above — the ones
  // that gate how much the sector can physically make. The remaining legs
  // (clearingRevenueLeg, embargoRevenueFactor) are sales-side and stay on the
  // dollar side of the identity documented on computeSectorOutputUnits.
  // (moved to resolvePlantsRevenue: tech output rate in capacity units)
  // (moved to accumulateMarginModifiers: P3.5 disaster split partition)
  // (moved to resolvePlantsRevenue: tonnage policy curve + production factor)
  // (moved to resolvePlantsRevenue: banking split + contract production)
  // (moved to resolvePlantsRevenue: derived revenue from produced output)
  // (moved to resolvePlantsRevenue: launch-safety governor + arsenal leg)
  // (moved to resolvePlantsRevenue: capacity-binding event, pushed above)
  // (moved to accumulateMarginModifiers: tariffs, subsidies, supply scaling)
  // (moved to accumulateMarginModifiers: export/macro/strategy/state metrics)
  // (moved to accumulateMarginModifiers: dominance + negative-production)
  // (moved to accumulateMarginModifiers: expropriation/alignment/disaster/total)
  // (moved to accumulateMarginModifiers: SOE efficiency + effective margin)
  // Labour telemetry below reads raw state metrics directly; the political
  // board it also needs was hoisted next to the margin call above.
  const sectorMetrics = lookups.stateMetricsByState?.get(sector.stateId) ?? null;
  // Ahead of the labor-cost split below, so labor is workers x wage-per-worker.
  //
  // Explicit plants staff and pay the part of the active plant that is actually
  // scheduled to run (demand throttle x input throughput), with a crew floor so
  // a plant is never staffed at zero. A plant at a full run gets exactly 1.
  const plantCrew = explicitPlantCostsEnabled
    ? plantCrewShare({
        demandThrottleFactor: Math.min(demandThrottleFactor, restartRunShare),
        ramp: plantsRampLambda,
        floor: PLANT_CREW_FLOOR_SHARE,
        // A plant with no stored crew share is new: it has never hired anyone,
        // so it hires straight to its run instead of starting at a full crew
        // and shedding 2% a turn (ticket: new plants paid ~90% payroll at a
        // 33% run for their first turns).
        previous: coldRestart || sector.plantCrewShare == null ? 0 : sector.plantCrewShare,
        maxDropPerTurn: plantCrewMaxDropPerTurn({
          demandThrottleFactor,
          priorDemandIdleTurns: sector.demandIdleTurns,
          graceTurns: IDLE_RETIRE_GRACE_TURNS,
          normalMaxDrop: PLANT_CREW_MAX_DROP_PER_TURN,
          sustainedMaxDrop: PLANT_CREW_SUSTAINED_GLUT_MAX_DROP_PER_TURN,
          sustainedThrottle: PLANT_CREW_SUSTAINED_GLUT_THROTTLE,
        }),
      })
    : 1;
  const {
    desiredWorkers,
    workers: computedWorkers,
    referenceDesiredWorkers,
  } = resolveSectorHeadcount({
    revenue: plantsEnabled ? plantsNameplateRevenue * activeFraction * plantCrew : newRevenue,
    stateId: sector.stateId,
    rawWorkforceSkillByState: lookups.rawWorkforceSkillByState,
    politicalBoard,
    staffingFactor,
    labourDemandByState,
    labourDemandWageIndexByState: env.labourDemandWageIndexByState,
    wageLevel: labour.wagesEnabled ? sector.wageLevel : 1,
    labourPerUnitFactor: lawAdjustedLabourFactor(
      operatingCrewFactor(sector, currentTurn, env.automationDisplacedByState !== undefined),
      lookups.automationPolicyByCountry,
      sector.countryId ?? corp.countryId
    ),
    automationDisplacedByState: env.automationDisplacedByState,
    fundedHeadcount: env.fundedHeadcountBySectorId
      ? (env.fundedHeadcountBySectorId.get(sectorId) ?? {
          desiredWorkers: 0,
          workers: 0,
        })
      : undefined,
  });

  // Wanted staff the state could not supply are not paid (as in the producer path).
  const staffedShare = desiredWorkers > 0 ? computedWorkers / desiredWorkers : 0;
  // On a funded turn the crew is the funded run's, not the crew share's, so the
  // basis scales by the funded share to agree with what was actually paid.
  const fundedShare = env.fundedHeadcountBySectorId
    ? fundedPayrollShare({
        fundedDesiredWorkers: desiredWorkers,
        referenceDesiredWorkers,
      })
    : 1;
  const explicitPayrollBasis =
    (plantsNameplateRevenue * activeFraction * plantCrew * staffedShare * fundedShare) /
    TURNS_PER_DAY;

  const payrollSpecializationMod = isStateOwned(corp)
    ? 0
    : specializationPayrollModifier(operatingSectorType, corp.type, corp.secondaryType);
  const { payrollBasis, operatingSaving } = specializationMaintenance({
    revenue: hourlyRevenue,
    operatingMargin: effectiveMargin,
    payrollMargin: softCapEffectiveMargin(
      sector.profitMargin +
        totalMarginMod +
        nationalizedMarginPenalty -
        sectorTypeMatchMod +
        payrollSpecializationMod
    ),
  });
  const {
    maintenance: maintenanceBeforeSpecialization,
    sectorLaborCost,
    wagePerWorker,
    newUnionization,
    newWorkerExpectationIndex,
    newStrikeStartedAtTurn,
    newStrikeCooldownUntilTurn,
  } = resolveSectorLabourEconomics({
    explicitPlantCostsEnabled,
    marketRecoveryStage: market.marketRecoveryStage,
    labour: explicitPlantCostsEnabled ? { ...labour, wagesEnabled: true } : labour,
    sector,
    sectorCountryId,
    currentTurn,
    currentYear,
    // Decision 18 diverts branch capacity from production; apply the same scale
    // to the commodity labour-cost basis, with deposit income covering branches.
    // Keep branch headcount, so wagePerWorker reflects the smaller commodity bill.
    hourlyRevenue: explicitPlantCostsEnabled ? explicitPayrollBasis : hourlyRevenue,
    // Staff are paid for the staffed share of the scheduled run of active
    // capacity (crew floor applies), even when its output cannot sell. This
    // neutral basis also removes the legacy margin cap on payroll.
    grossMaintenance: explicitPlantCostsEnabled ? explicitPayrollBasis : payrollBasis,
    computedWorkers,
    techLaborCostMultiplier: techEffects.laborCostMultiplier,
    employerWageCostMultiplier: lawWageCostMultiplier(
      lookups.automationPolicyByCountry,
      sector.countryId ?? corp.countryId
    ),
    costOfLivingIndex: sectorMetrics?.economic?.costOfLiving?.value,
    unemploymentRate: sectorMetrics?.economic?.unemploymentRate?.value,
    wageIndexByState,
    automationIndexByState,
    pendingStrikeEvents,
  });
  // Apply operating savings after payroll has been priced at its existing basis.
  const maintenance = maintenanceBeforeSpecialization - operatingSaving;
  // ─── Growth cost (on realized revenue) + regulatory burden ────────────────
  // Pure computation in `sectorTurn/sectorCosts.ts`; names are unchanged.
  const {
    hourlyGrowthCost,
    regulatoryBurden,
    fundedRegulatoryBurdenRate,
    nameplateHourlyGrowthCost,
    nominalHourlyRevenue,
  } = computeGrowthAndRegulatory({
    corp,
    newGrowthCost,
    preFlipNameplateRevenue,
    hourlyRevenue,
    sectorMarketSharePct,
    nationalDominanceSharePct,
    dominanceShield: techEffects.dominanceShield,
    plantsEnabled,
    plantsRampLambda,
  });

  // ─── P3a: idle / mothball upkeep (plants only) ────────────────────────────
  //
  // Maintenance above is derived from REALIZED revenue, so it scales with
  // utilization: a sector running its plants at 40% pays 40% of the
  // maintenance and idle capacity is free to hold. Under plants that is no
  // longer honest — capacity is a thing you BOUGHT and must keep, and an
  // over-built sector should feel it.
  //
  // Cost basis becomes  utilization + IDLE_UPKEEP_FRACTION × (1 − utilization),
  // implemented as an ADDITIVE charge on the idle units rather than a
  // multiplier on `maintenance`, for two reasons: the multiplier form divides
  // by utilization (undefined at 0, which is exactly the mothballed case), and
  // the additive form prices idle units at nominal mix prices instead of
  // inheriting the sales legs — an idle plant's upkeep does not fall because
  // the market price of its output fell.
  //
  //   unitUpkeep = (mixPrice / TURNS_PER_DAY) × (1 − margin)   [per unit, hourly]
  //
  // FLIP IDENTITY: the flip turn seeds capacity at 1.1 × implied units, so
  // utilization is ≈0.909 and this charge would be ≈2.7% of maintenance on flip
  // day — a visible profit step on a tier whose promise is that the flip
  // changes nothing. It is therefore faded in over the SAME governor ramp every
  // other plants leg uses, anchored on `plantsStartTurn`: λ = 0 on the flip turn
  // (exact no-op, existing flip-identity tests stay green) rising to 1 over
  // `governorRampTurns`. DEVIATION from the plan's "fold it into the governor
  // baseline": folding a cost into a REVENUE governor would have made the
  // governor's revenue clamp mean two different things at once; ramping the
  // charge itself is the same guarantee with one meaning per mechanism.
  //
  // A MOTHBALLED sector is not ramped — mothballing is a deliberate, explicit
  // player action taken after the flip, so there is no continuity to protect.
  //
  // ─── TWO CORRECTIONS (measured on the live sandbox, turn 293) ─────────────
  //
  // 1. THE UNIT PRICE IS ANCHORED, not `(1 − margin_now)`. Pricing a FIXED
  //    site/skeleton-crew cost off the live margin made it GROW as the margin
  //    fell, so the world's most distressed sectors paid the most per idle
  //    unit. Stamped once from the live margin on the sector's first plants
  //    turn (`plantsUpkeepMarginBasisAnchor`) and then held, in exactly the
  //    discipline `otherOpexPerUnitAnchor` uses. The stamping turn is unchanged
  //    by construction — including for a mothballed sector, where the ramp is
  //    deliberately not applied and so would not have hidden a step.
  //
  // 2. THE BASE IS OWNER-IDLE CAPACITY, not `capacity − producedUnits`. All 675
  //    live sectors sat at `throughputFactor === 0.85` exactly, the launch
  //    governor's floor: every plant in the world was input-starved, none was
  //    over-built, and each was already losing that 15% off its top line
  //    (`throughputFactor` is a term in `baselineHourlyRevenue`) before being
  //    billed upkeep on the same 15% again.
  //
  // See `ownerIdleUnits` / `idleUpkeepUnitPrice` for the full rationale.
  const { plantsUpkeepCost, plantsUpkeepMarginBasisLive, plantsUpkeepMarginBasisAnchor } =
    computeIdleUpkeep({
      sector,
      activeCapacityPercent: operatingCapacityTarget,
      plantsEnabled,
      mothballed,
      effectiveMargin,
      plantsMixPrice,
      plantsCapacity,
      producedUnits,
      plantsRampLambda,
      disasterOutputFactor,
      nationalizationTransition,
      plantsExtractionHardMin,
      throughputFactor,
      labourOutputFactor,
      demandThrottleFactor,
    });

  // Canonical freight billing (issue #897, gameConfig gate, default off):
  // last turn's state-scoped shipping money as this sector's own named legs,
  // ₳/turn. Charge rides `costs` and credit rides the returned revenue below;
  // both legs and the flag-off stale-clear behavior live in
  // `resolveSectorFreightBillingLegs`. Off ⇒ both 0 and no fields written.
  // Logistics strength (research grants it, the CEO's logistics budget grows
  // it) cuts the freight bill and the landed surcharge on out-of-state inputs.
  // Haul revenue is not discounted: it is what the haulier earns, not a cost.
  const shippingCostMultiplier = isStateOwned(corp)
    ? 1
    : getLogisticsShippingMultiplier(corp.logisticsStrength);
  const freightBilling = resolveSectorFreightBillingLegs({
    market,
    sector,
    embargoLegacyMothball,
    currentTurn,
    sectorCurrencyCode,
    sectorFxRate,
    shippingCostMultiplier,
  });
  return {
    kind: "context" as const,
    context: {
      basePrices,
      brakedTargetRate,
      capacityHaircutStartTurn,
      capacityUtil,
      capitalFactor,
      clearing,
      commodityMod,
      computedWorkers,
      constructionInProgressAnchor,
      contractAchievableUnits,
      corp,
      corpId,
      currentTurn,
      currentYear,
      debtToGdpMod,
      deficitMod,
      demandThrottleFactor,
      desiredWorkers,
      dominanceMarginPenalty,
      effectiveDemand,
      effectiveMargin,
      embargoExportExposure,
      embargoLegacyMothball,
      embargoSuppressed,
      embargoTradeExposureActive,
      existingQueue,
      explicitPlantCostsEnabled,
      flipGrowthCreditOrder,
      freightBilling,
      fundedRegulatoryBurdenRate,
      fundedSizeLegs,
      revenueEffectLegs,
      subsidyMod,
      dominanceCostPct,
      healedOpex,
      hourlyGrowthCost,
      hourlyRevenue,
      idleCapacityRetiredUnits,
      idleRetirement,
      idleWholePlants,
      inflationMod,
      labour,
      landedBuildUnits,
      landedOrderCount,
      lookups,
      lossRun,
      maintenance,
      market,
      mothballed,
      nameplateHourlyGrowthCost,
      newCapitalStock,
      newCurrentGrowthRate,
      newGrowthCost,
      newNegativeProductionTurns,
      newPolicyLevel,
      newStrikeCooldownUntilTurn,
      newStrikeStartedAtTurn,
      newUnionization,
      newWorkerExpectationIndex,
      nominalHourlyRevenue,
      now,
      operatingCapacityTarget,
      operatingSectorType,
      originalActivePercent,
      persistedCapacityBookAnchor,
      persistedOwnedCapacity,
      persistedPlantLedger,
      plantCrew,
      plantsCapacity,
      plantsEnabled,
      plantsMixPrice,
      plantsNameplateRevenue,
      plantsStartTurn,
      plantsUpkeepCost,
      plantsUpkeepMarginBasisAnchor,
      plantsUpkeepMarginBasisLive,
      priceRealization,
      producedUnits,
      regulatoryBurden,
      sector,
      sectorCountryId,
      sectorCurrencyCode,
      sectorFxRate,
      sectorId,
      sectorLaborCost,
      sectorOps,
      soldUnits,
      sprawlMod,
      staffingFactor,
      stateMetricMargin,
      strategyRates,
      surplusMod,
      throughputFactor,
      throughputRaw,
      throughputStartTurn,
      turn,
      wagePerWorker,
      wideCommodityBalances,
      totalMarginMod,
      disasterMarginMod,
      nationalizedMarginPenalty,
      activeFraction,
      retoolCapacityRatio,
      policyHeadroomFactor,
      shippingCostMultiplier,
      storedOtherOpexAnchor,
      isFlipTurn,
      preFlipNameplateRevenue,
      clearingFactor,
      clearingStartTurn,
      exportPremiumMod,
    },
  };
}
export type ProcessSectorStageContext = Extract<
  ReturnType<typeof prepareProcessSector>,
  { kind: "context" }
>["context"];

export function processSector(...args: Parameters<typeof prepareProcessSector>): SectorTurnResult {
  const prepared = prepareProcessSector(...args);
  return settleSectorAccounts(prepared.context);
}
