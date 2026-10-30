/** Prepare work, recipes and plant constraints before any product money is moved. */
import {
  withCaptiveDeliveries,
  type CaptiveProduct,
} from "@/lib/market/producerMarket/captiveDeliveryRules";
import { plantPressure, shortageGrowth } from "@/lib/market/producerMarket/shortageGrowthRules";
import { jointRunShare, lineSlices } from "@/lib/market/producerMarket/jointRunRules";
import {
  inTransitionWindow,
  TRANSITION_WINDOW_TURNS,
  transitionReliefEligible,
} from "@/lib/market/producerMarket/transitionRules";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import {
  COMMODITY_BASE_PRICES,
  COMMODITY_TYPES,
  eraScaledBasePrices,
  type CommodityType,
} from "@/lib/constants/commodities";
import {
  getEffectiveStrategyRatesForOperatingModel,
  getOperatingSectorType,
} from "@/lib/constants/sectorStrategies";
import { getSectorTechEffectsForYear, NEUTRAL_TECH_EFFECTS } from "@/lib/constants/techTree";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import { activeCapacityConstraintFactor } from "@/lib/corporations/investment/rules";
import {
  LOW_USE_COLD_UPKEEP_FRACTION,
  standingProducerSiteBill,
} from "@/lib/corporations/plantCosts/rules";
import { retoolOperatingCapacityRatio } from "@/lib/corporations/retooling/rules";
import { applyExtractionResourceCapacityToSupply } from "@/lib/corporations/extractionResourceSupply";
import { commodityProductionCapacityScale } from "@/lib/banking/capacityAllocation";
import { nationalizationProductivityFactor } from "@/lib/nationalization/transitionShock";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import { computeSoeEfficiencyPenalty } from "@/lib/nationalization/soeEfficiency";
import { resolveSectorMandate } from "@/lib/nationalization/soeMandates";
import { sociMultiplier } from "@/lib/nationalization/concentration";
import { politicalSoeInputs } from "@/lib/politicalLegislation/marginAdapter";
import { getSectorTypeMatchModifier } from "@/lib/corporations/specialization/rules";
import { organisationalOutputFactor } from "@/lib/market/producerMarket/efficiencyRules";
import {
  demandPlanRunShare,
  liveLineReceipt,
  pacedRunShare,
  LOW_USE_RUN_FLOOR,
  nextRunShare,
  OUTPUT_RUN_FLOOR,
  type PriorReceipt,
  type ReceiptLine,
} from "@/lib/market/producerMarket/outputResponseRules";
import {
  idleRetireActive,
  idleRetireSectorShare,
} from "@/lib/market/producerMarket/idleRetirementRules";
import { computeStateMetricMarginModifier } from "@/lib/corporations/sectorMetricMarginProfiles";
import { STRATEGY_TRANSITION_TURNS } from "@/lib/constants/sectorStrategyTypes";
import { resolveSectorHostCurrencyCode } from "@/lib/currency/corporationCapital";
import {
  computeDisasterPenaltySplit,
  disasterProductionFactor,
} from "@/lib/crises/disasterMarginPenalty";
import {
  getInputMultiplier,
  getOutputMultiplier,
  trendProductionPolicy,
} from "@/lib/utils/productionPolicy";
import { energyProductivityMultiplier } from "@/lib/corporations/rules/energyProductivityRamp";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import { producerRecipe } from "@/lib/market/producerMarket/recipeRules";
import { prepareProducerSector } from "./producerSectorPlan";
import { producerWalletId, type ProducerWalletScope } from "./producerWallets";
import {
  resolveSectorHeadcount,
  resolveSectorLabourEconomics,
  resolveSectorLabourProductionEffects,
} from "./sectorLabour";
import type { SectorTurnEnv } from "./sectorTurnTypes";
import type { CorporationLookups } from "./types";

export type ProducerPhysicalEnv = Pick<
  SectorTurnEnv,
  | "currentTurn"
  | "currentYear"
  | "techTreesEnabled"
  | "labour"
  | "wageIndexByState"
  | "automationIndexByState"
  | "pendingStrikeEvents"
  | "labourDemandByState"
  | "labourDemandWageIndexByState"
  | "privateBankingEnabled"
> & {
  /** Funded producer turns and the shadow: advertising as a paid input. */
  advertisingInput?: boolean;
  /** First funded turn of this world, when the cutover transition window applies. */
  transitionFirstFundedTurn?: number;
  /** gameConfig.producerDemandPlanStage: >= 1 plans output from expected sales. 0 or absent = off. */
  demandPlanStage?: number;
  /** gameConfig.producerSpilloverStage share: substitution share for same-turn spillover (0 or absent = off). */
  spilloverShare?: number;
  /** Share of unfilled public budget kept per line for next turn (0 = off). */
  publicCarryShare?: number;
  /** gameConfig.producerProcurementSpillStage share: leftover public funding paid to households (0 = off). */
  procurementSpillShare?: number;
  /** gameConfig.producerRunPaceDrop: largest share of last turn's run a plant may shed in one turn (0 or absent = off). */
  runPaceDrop?: number;
  /** gameConfig.producerHouseholdIncomeFloor: target household income per turn, anchor (0 or absent = off). */
  householdIncomeFloor?: number;
  /** gameConfig.producerStockCover: turns of recent sales a seller may carry before marking down (0 or absent = off). */
  stockCoverTurns?: number;
  /** gameConfig.producerClearingReferenceStage: >= 1 floors a buyer's reference at the last funded clearing price of a reachable good. */
  clearingReferenceStage?: number;
  /** gameConfig.producerFundedBookStage: >= 1 prices the funded market from its own orders and cross-border fills. */
  fundedBookStage?: number;
  /** gameConfig.producerShortageGrowthStage: >= 1 grows a sold-out line by its book's shortage. */
  shortageGrowthStage?: number;
  /** gameConfig.producerCaptiveDeliveryStage: >= 1 counts internal deliveries as sales for planning. */
  captiveDeliveryStage?: number;
  /** gameConfig.producerJointRunStage: >= 1 runs a multi-product plant at its best paying line plan. */
  jointRunStage?: number;
  /** gameConfig.producerFundedRestartStage: >= 1 publishes shortage per recipe for AI restarts. */
  fundedRestartStage?: number;
  /** Funded build speedup factor for short plants (gameConfig.producerShortageBuildFactor). */
  shortageBuildFactor?: number;
  /** Units asked over delivered per commodity book, from last turn's settled orders. */
  pressureByBook?: ReadonlyMap<string, number>;
  /** Last funded clearing price per reachable commodity, anchor per unit (from the previous turn's outcomes). */
  lastClearingPriceByCommodity?: ReadonlyMap<string, number>;
  /** gameConfig.producerIdleRetireStage: >= 1 retires capacity that persistently sells nothing. 0 or absent = off. */
  idleRetireStage?: number;
  /** gameConfig.decommissionGrantShare: share of retired book paid from unspent public funding. */
  decommissionGrantShare?: number;
  /** gameConfig.producerLowUseCostStage: >= 1 lets barely used and parked plants cost close to nothing. */
  lowUseCostStage?: number;
  /** gameConfig.wholePlantsStage on: capacity moves in whole plants. */
  wholePlants?: boolean;
  lookups: Pick<
    CorporationLookups,
    | "labourTightnessByState"
    | "labourDemandWageIndexByState"
    | "preset"
    | "hardwareInputReliefStartTurn"
    | "eraUnitScale"
    | "stateResourceCapacityByState"
    | "statePriceRatioByState"
    | "reachablePriceRatioByCountry"
    | "priceRatioByCommodity"
    | "activeDisasterEffectsByState"
    | "recessionCapacityFactorByCountry"
    | "rawWorkforceSkillByState"
    | "politicalBoardByState"
    | "stateMetricsByState"
    | "extractionCapacityUtilBySector"
    | "corporateEmbargoSuppression"
    | "embargoTradeExposureEnabled"
    | "eraYear"
    | "politicalBaseModifiersByState"
    | "regionalConditionMarginByState"
    | "stateOwnershipConcentrationByCountry"
  >;
};

/** Per-commodity rate scaling for one plant's recipe. */
export function scaledCommodityRates(
  rates: Partial<Record<CommodityType, number>>,
  factors: Record<string, number>,
  multiplier = 1
) {
  // One pass, no entry array and no second object: this runs twice per plant.
  const scaled: Partial<Record<CommodityType, number>> = {};
  for (const [commodity, rate] of Object.entries(rates))
    scaled[commodity as CommodityType] = rate! * (factors[commodity] ?? 1) * multiplier;
  return scaled;
}

/** Membership test for the catalogue, so a plant's commodity lookup is O(1). */
const COMMODITY_TYPE_SET: ReadonlySet<string> = new Set<string>(COMMODITY_TYPES);

/** The catalogue entry for a plant's recipe key, or a loud failure. */
export function producerCommodity(key: string): CommodityType {
  if (!COMMODITY_TYPE_SET.has(key)) throw new Error("Unrecognized producer commodity");
  return key as CommodityType;
}

/**
 * The commodities a plant's plan touches: both recipe legs plus anything it
 * still holds as sellable stock.
 */
export function producerRecipeCommodities(
  recipe: {
    supply: Partial<Record<CommodityType, number>>;
    demand: Partial<Record<CommodityType, number>>;
  },
  sector: Pick<CorporateSector, "producerInventory">
): Set<string> {
  const commodities = new Set<string>(Object.keys(recipe.supply));
  for (const commodity of Object.keys(recipe.demand)) commodities.add(commodity);
  for (const stock of sector.producerInventory?.outputStock ?? [])
    if (stock.units > 0) commodities.add(stock.commodity);
  return commodities;
}

/**
 * Price choices and last turn's sell-through never determine physical capacity.
 * Demand and affordability constrain the prepared work inside funded settlement.
 */
export function prepareProducerPhysicalSector(input: {
  worldEpoch: string;
  env: ProducerPhysicalEnv;
  corporation: Corporation;
  sector: CorporateSector;
  /** One buyer policy, shared across sectors; supplied by the world host. */
  inputPriceHeadroom: number;
}) {
  const { env, corporation: corp, sector } = input;
  const { lookups, currentTurn, currentYear } = env;
  const countryId = sector.countryId ?? corp.countryId;
  const currency = resolveSectorHostCurrencyCode(sector, corp);
  if (!countryId || !currency) throw new Error("Producer location requires a reconciled currency");
  if (!Number.isFinite(input.inputPriceHeadroom) || input.inputPriceHeadroom <= 0)
    throw new Error("Invalid producer input price headroom");
  const scopes: ProducerWalletScope[] = [
    { kind: "households", countryId, stateId: sector.stateId, currency },
    { kind: "operatingPayee", countryId, stateId: sector.stateId, currency },
  ];
  const labour = resolveSectorLabourProductionEffects(
    env.labour,
    sector,
    lookups.labourTightnessByState.get(sector.stateId),
    lookups.labourDemandWageIndexByState?.get(sector.stateId),
    countryId
  );
  const tech =
    env.techTreesEnabled && currentYear != null
      ? getSectorTechEffectsForYear(
          corp,
          sector.sectorType,
          currentYear,
          sector.industryModel,
          sector.mediaDiscriminator
        )
      : NEUTRAL_TECH_EFFECTS;
  const recipe = getEffectiveStrategyRatesForOperatingModel(
    sector.sectorType,
    sector.strategyId ?? "standard",
    sector.transitionFromStrategyId,
    sector.transitionStartTurn,
    currentTurn,
    sector.industryModel,
    sector.mediaDiscriminator,
    lookups.preset,
    lookups.hardwareInputReliefStartTurn,
    { advertisingInput: env.advertisingInput === true }
  );
  const operatingType = getOperatingSectorType(
    sector.sectorType,
    sector.industryModel,
    sector.mediaDiscriminator
  );
  const outputRateValueBasis = Object.values(recipe.supply).reduce<number>(
    (sum, value) => sum + (value ?? 0),
    0
  );
  const baseRecipe = producerRecipe({ ...recipe, eraUnitScale: lookups.eraUnitScale });
  if (sector.transitionFromStrategyId && sector.retoolRescaleApplied !== true)
    throw new Error("Retooling requires a reconciled owned-unit basis");
  if (operatingType === "extraction" && !lookups.stateResourceCapacityByState.has(sector.stateId))
    throw new Error("Extraction requires a reconciled resource opening");
  const resourceSupply = applyExtractionResourceCapacityToSupply(
    operatingType,
    recipe.supply,
    lookups.stateResourceCapacityByState.get(sector.stateId)
  );
  const supply = scaledCommodityRates(resourceSupply, tech.outputRateMult);
  const outputYield =
    (Object.entries(supply).reduce(
      (sum, [commodity, rate]) => sum + rate / COMMODITY_BASE_PRICES[commodity as CommodityType],
      0
    ) *
      lookups.eraUnitScale) /
    outputRateValueBasis;
  const policyLevel = trendProductionPolicy(
    sector.productionPolicyLevel ?? 0,
    sector.productionPolicy ?? 0
  );
  const policyOutput = getOutputMultiplier(policyLevel);
  const demand = scaledCommodityRates(
    recipe.demand,
    tech.inputRateMult,
    getInputMultiplier(policyLevel) / policyOutput
  );
  const prices = eraScaledBasePrices(lookups.eraUnitScale);
  const commodities = producerRecipeCommodities(recipe, sector);
  const markets = new Map(
    [...commodities].map((key) => {
      const commodity = producerCommodity(key);
      const ratio = isStateScopedCommodity(commodity)
        ? lookups.statePriceRatioByState?.get(sector.stateId)?.get(commodity)
        : lookups.reachablePriceRatioByCountry?.get(countryId)?.get(commodity);
      const reference =
        prices[commodity] * (ratio ?? lookups.priceRatioByCommodity.get(commodity) ?? 1);
      // A buyer will bid up to what the market last cleared at (capped at 3x its own
      // reference), but only on the bid side: the output reference and the 1.25x
      // headroom stay on the unfloored reference, so the floor cannot feed on its own
      // clearing prices turn after turn.
      let bidFloor = 0;
      if ((env.clearingReferenceStage ?? 0) >= 1 && !isStateScopedCommodity(commodity)) {
        const cleared = env.lastClearingPriceByCommodity?.get(commodity);
        if (cleared != null && Number.isFinite(cleared) && cleared > reference)
          bidFloor = Math.min(cleared, reference * 3);
      }
      return [
        commodity,
        {
          book: isStateScopedCommodity(commodity) ? `state:${sector.stateId}` : "world",
          referenceUnitPrice: reference,
          maximumInputUnitPrice: Math.max(reference * input.inputPriceHeadroom, bidFloor),
        },
      ] as const;
    })
  );
  const disaster = computeDisasterPenaltySplit(
    lookups.activeDisasterEffectsByState.get(sector.stateId) ?? [],
    { sectorType: sector.sectorType, strategyId: sector.strategyId ?? null },
    currentTurn,
    true
  );
  const prepared = prepareProducerSector({
    worldEpoch: input.worldEpoch,
    turn: currentTurn,
    sector: withStateBooks(sector),
    // A site with no accessible resource still retains its recipe for selling
    // old goods. Its current physical output is zero, never a fallback yield.
    recipe: {
      supply: outputYield > 0 ? supply : recipe.supply,
      demand,
      eraUnitScale: lookups.eraUnitScale,
      outputRateValueBasis,
    },
    markets,
    outputMultiplier: 0,
    operatingRecipeRatio:
      sector.retoolRescaleApplied === true && sector.transitionFromStrategyId
        ? retoolOperatingCapacityRatio({ ...sector, currentTurn })
        : 1,
    recessionCapacityFactor:
      (lookups.recessionCapacityFactorByCountry?.get(countryId) ?? 1) *
      (1 -
        (idleRetireActive(
          env.idleRetireStage,
          currentTurn,
          env.transitionFirstFundedTurn,
          inTransitionWindow
        )
          ? idleRetireSectorShare(
              sector,
              currentTurn,
              env.transitionFirstFundedTurn != null
                ? env.transitionFirstFundedTurn + TRANSITION_WINDOW_TURNS
                : undefined
            )
          : 0)),
    labourCost: 0,
    otherOperatingCost: 0,
    labourRecipientAccountId: producerWalletId(input.worldEpoch, scopes[0]),
    operatingRecipientAccountId: producerWalletId(input.worldEpoch, scopes[1]),
    wholePlants: env.wholePlants === true,
  });
  const { plan } = prepared;
  // Stock-cover markdown needs last turn's sales per product (see stockCoverRules).
  if ((env.stockCoverTurns ?? 0) > 0) {
    const last = (
      sector as {
        producerSettlement?: {
          soldUnits?: number;
          turn?: number;
          products?: {
            commodity: string;
            book: string;
            deliveredUnits?: number;
            soldUnits?: number;
          }[];
        };
      }
    ).producerSettlement;
    const current = last && last.turn === currentTurn - 1 ? last : null;
    plan.recentSoldUnits = current?.soldUnits ?? 0;
    // A product the last receipt did not list sold nothing; plants without product rows fall back to the plant total.
    if (current?.products)
      plan.recentSoldByOutput = Object.fromEntries(
        current.products.map((x) => [
          `${x.commodity}|${x.book}`,
          x.deliveredUnits ?? x.soldUnits ?? 0,
        ])
      );
  }
  const suspended =
    lookups.corporateEmbargoSuppression?.has(`${countryId}|${corp.countryId}`) === true &&
    lookups.embargoTradeExposureEnabled !== true;
  if (suspended) plan.activeFraction = 0;
  const nominalDaily = plan.capacityUnits * TURNS_PER_DAY * baseRecipe.nominalAnchorPerCapacityUnit;
  // Output follows price: last turn's own settled receipt sets this turn's run.
  const priorReceipt = (sector as { producerSettlement?: PriorReceipt & { turn?: number } })
    .producerSettlement;
  const lowUse = (env.lowUseCostStage ?? 0) >= 1;
  const runFloor = lowUse ? LOW_USE_RUN_FLOOR : OUTPUT_RUN_FLOOR;
  const settledLast = priorReceipt && priorReceipt.turn === currentTurn - 1 ? priorReceipt : null;
  // Leftover stock of lines the recipe no longer makes is still sold, but does not steer the run.
  const liveLast = settledLast
    ? liveLineReceipt(
        settledLast as PriorReceipt & { products?: (ReceiptLine & CaptiveProduct)[] },
        new Set(plan.outputs.filter((o) => o.unitsPerOutput > 0).map((o) => o.commodity))
      )
    : null;
  const lastReceipt =
    liveLast && (env.captiveDeliveryStage ?? 0) >= 1 ? withCaptiveDeliveries(liveLast) : liveLast;
  const planRun = (receipt: typeof lastReceipt) =>
    (env.demandPlanStage ?? 0) >= 1
      ? demandPlanRunShare(
          receipt,
          runFloor,
          (env.shortageGrowthStage ?? 0) >= 1
            ? shortageGrowth(
                plantPressure(
                  (receipt as { products?: Parameters<typeof plantPressure>[0] } | null)?.products,
                  env.pressureByBook
                )
              )
            : undefined
        )
      : nextRunShare(receipt, runFloor);
  const summedRunShare = planRun(lastReceipt);
  // A multi-product plant runs at the highest line plan that pays, not at the plan its summed lines read.
  const unpacedRunShare =
    (env.jointRunStage ?? 0) >= 1
      ? jointRunShare(
          summedRunShare,
          lastReceipt,
          lineSlices(lastReceipt, (env.captiveDeliveryStage ?? 0) >= 1),
          (line) => planRun(line.receipt as typeof lastReceipt)
        )
      : summedRunShare;
  // A plan that reads a glut sheds at most runPaceDrop of its run a turn; the workforce persists.
  const runShare = pacedRunShare(unpacedRunShare, lastReceipt, env.runPaceDrop ?? 0, runFloor);
  if ((env.demandPlanStage ?? 0) >= 1) plan.plannedRunShare = runShare;
  // Wages and site running costs follow the line the plant runs: idle lines
  // employ no one (their workers count as unemployed) and idle capacity pays
  // cold upkeep only.
  const runningFraction = plan.activeFraction * runShare;
  const headcount = resolveSectorHeadcount({
    revenue: nominalDaily * runningFraction,
    stateId: sector.stateId,
    rawWorkforceSkillByState: lookups.rawWorkforceSkillByState,
    politicalBoard: lookups.politicalBoardByState?.get(sector.stateId),
    staffingFactor: labour.staffingFactor,
    labourDemandByState: env.labourDemandByState,
    labourDemandWageIndexByState: env.labourDemandWageIndexByState,
    wageLevel: sector.wageLevel,
  });
  const metrics = lookups.stateMetricsByState?.get(sector.stateId);
  const staffedShare =
    headcount.desiredWorkers > 0 ? headcount.workers / headcount.desiredWorkers : 0;
  const payroll = resolveSectorLabourEconomics({
    labour: { ...env.labour, wagesEnabled: true },
    sector,
    sectorCountryId: countryId,
    currentTurn,
    currentYear,
    explicitPlantCostsEnabled: true,
    hourlyRevenue: (nominalDaily * runningFraction * staffedShare) / TURNS_PER_DAY,
    grossMaintenance: (nominalDaily * runningFraction * staffedShare) / TURNS_PER_DAY,
    computedWorkers: headcount.workers,
    techLaborCostMultiplier: tech.laborCostMultiplier,
    costOfLivingIndex: metrics?.economic?.costOfLiving?.value,
    unemploymentRate: metrics?.economic?.unemploymentRate?.value,
    wageIndexByState: env.wageIndexByState,
    automationIndexByState: env.automationIndexByState,
    pendingStrikeEvents: env.pendingStrikeEvents,
  });
  const extraction =
    operatingType === "extraction"
      ? activeCapacityConstraintFactor(
          lookups.extractionCapacityUtilBySector.get(sector._id.toHexString())?.utilization ?? 0,
          plan.activeFraction
        )
      : 1;
  // Type match and state-company efficiency are real productivity here, not
  // margin points (see efficiencyRules.ts).
  const stateOwned = isStateOwned(corp);
  const politicalBoard = lookups.politicalBoardByState?.get(sector.stateId);
  const politicalSoe = politicalBoard ? politicalSoeInputs(politicalBoard) : null;
  const soeMandate = stateOwned ? resolveSectorMandate(corp, sector) : null;
  const regionalMetric = computeStateMetricMarginModifier({
    sectorType: operatingType,
    strategyId: sector.strategyId ?? "standard",
    transitionFromStrategyId: sector.transitionFromStrategyId,
    transitionProgress:
      sector.transitionFromStrategyId && sector.transitionStartTurn != null
        ? Math.min(
            1,
            Math.max(0, (currentTurn - sector.transitionStartTurn) / STRATEGY_TRANSITION_TURNS)
          )
        : 0,
    stateMetrics: metrics ?? null,
    countryId,
    year: lookups.eraYear ?? null,
    politicalBaseModifiers: lookups.politicalBaseModifiersByState?.get(sector.stateId) ?? null,
  });
  const organisational = organisationalOutputFactor({
    regionalPp:
      regionalMetric.cappedTotal +
      (lookups.regionalConditionMarginByState?.get(sector.stateId) ?? 0),
    typeMatchPp:
      stateOwned || !corp.type
        ? 0
        : getSectorTypeMatchModifier(sector.sectorType, corp.type, corp.secondaryType),
    soeEfficiencyPp: stateOwned
      ? computeSoeEfficiencyPenalty({
          corruptionIndex:
            metrics?.governance?.corruptionIndex?.value ?? politicalSoe?.corruptionIndex ?? null,
          governmentTransparency:
            metrics?.governance?.governmentTransparency?.value ??
            politicalSoe?.governmentTransparency ??
            null,
          priceControlled: soeMandate?.priceControlled === true,
          employmentGuaranteed: soeMandate?.employmentGuaranteed === true,
          concentrationMultiplier: sociMultiplier(
            lookups.stateOwnershipConcentrationByCountry?.get(corp.countryOwnerId ?? "") ?? 0
          ),
        })
      : 0,
  });
  plan.outputMultiplier =
    runShare *
    organisational *
    labour.outputFactor *
    disasterProductionFactor(disaster.productionPenalty) *
    policyOutput *
    (outputYield / baseRecipe.unitsPerNominalAnchor) *
    extraction *
    energyProductivityMultiplier(sector.sectorType, currentTurn, lookups.preset) *
    (sector.sectorType === "financial"
      ? commodityProductionCapacityScale(corp.bankCharter, env.privateBankingEnabled === true)
      : 1) *
    (isStateOwned(corp)
      ? nationalizationProductivityFactor(
          sector.nationalizedAtTurn,
          currentTurn,
          sector.nationalizationTransitionMultiplier ?? 1
        )
      : 1);
  plan.labourCost = payroll.sectorLaborCost;
  const siteBill = (activeFraction: number) =>
    standingProducerSiteBill({
      nominalHourlyCapacityValue: nominalDaily / TURNS_PER_DAY,
      activeFraction,
      financialPenaltyPercent: Math.max(0, -disaster.marginPenalty),
      coldUpkeepWaived:
        env.transitionFirstFundedTurn != null &&
        transitionReliefEligible(sector) &&
        inTransitionWindow(currentTurn, env.transitionFirstFundedTurn),
      coldShareOverride: lowUse
        ? sector.mothballed === true
          ? 0
          : LOW_USE_COLD_UPKEEP_FRACTION
        : undefined,
    });
  plan.otherOperatingCost = siteBill(runningFraction);
  // Cold upkeep alone: the floor the site bill keeps when short inputs cut the run.
  plan.idleOperatingCost = siteBill(0);
  return {
    prepared,
    walletScopes: scopes,
    headcount,
    payroll,
    policyLevel,
    staffingFactor: labour.staffingFactor,
    suspended,
  };
}

/**
 * Freight trades on one book per country in the funded market, so stock it
 * carried over is stamped `country:<id>`. Plant preparation knows only state
 * and world books; read carried country-book stock back onto the plant's own
 * state book (the market maps it to the country book again).
 */
export function withStateBooks(sector: CorporateSector): CorporateSector {
  const inv = sector.producerInventory;
  if (!inv || !inv.outputStock.some((r) => r.book.startsWith("country:"))) return sector;
  return {
    ...sector,
    producerInventory: {
      ...inv,
      outputStock: inv.outputStock.map((r) =>
        r.book.startsWith("country:") ? { ...r, book: `state:${sector.stateId}` } : r
      ),
    },
  };
}
