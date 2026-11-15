export type { PlantIdleCause, PlantBuildOrderView, SectorPlantsSection } from "./sectorPlantsTypes";
import { hasProtectedConstructionProperty } from "@/lib/corporations/securedConstructionProperty";
import { getCorporateSectorLaneQuery } from "@/lib/corporations/sectorLocation";
import { buildSecuredLoanInfo } from "./securedSaleLoanInfo";
import { sectorMergeStrategyRefusal } from "@/lib/corporations/sectorMergeStrategy";
import { securedSaleMergeRefusal } from "@/lib/banking/constructionSaleMerge";
/**
 * Payload-section builders for the sector detail query: apportioned taxes,
 * active-crisis margin penalty, attack/split info, for-sale info, tech
 * growth-cost reduction, and the strategy panel. Extracted verbatim from
 * sectorDetail.ts (pure code motion; no behavior change).
 */
import { sectorFxSpreadBetween } from "@/lib/currency/sectorFxSpread";
import type { Db } from "mongodb";
import type {
  CommodityPrice,
  CorporateSector,
  Corporation,
  FederalBudget,
  StateBudget,
  Tariff,
} from "@/lib/db/types";
import type { Crisis } from "@/lib/db/types/crisis";
import {
  buildDisasterEffectsByState,
  computeDisasterMarginPenalty,
} from "@/lib/crises/disasterMarginPenalty";
import { getEffectiveTariffRate, getSplitCaptureMultiplier } from "@/lib/tariffs/tariffEffects";
import { sectorEconomicRevenue } from "@/lib/corporations/sectorRevenueBasis";
import {
  SPLIT_BASE_CAPTURE_FRACTION,
  UNOWNED_CAPTURE_BONUS_MULTIPLIER,
  MS_CAPTURE_DIVISOR,
  DOMINANCE_MARKET_SHARE_THRESHOLD,
} from "@/lib/constants/corporations";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { CountryId } from "@/lib/constants/countries";
import { roundMarketingStrength } from "@/lib/utils/formatters";
import {
  calculateAttackCostFromLocalRevenue,
  calculateSplitCostAnchor,
  calculateSplitMsCostForStrength,
  SPLIT_STRENGTH_MULTIPLIERS,
  type SplitStrength,
} from "@/lib/corporations/marketActionCosts";
import {
  anchorToCorpLiquidCapital,
  corpLiquidCapitalToAnchor,
  resolveCorpLiquidCurrencyCode,
  resolveSectorHostCurrencyCode,
  fxRateForSectorHostFromMap,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import { strategyRetoolPricing } from "./strategyRetoolPricing";
import { getLegalStructureForCorp } from "@/lib/corporations/legalStructure";
import {
  getSectorStrategies,
  getStrategy,
  STRATEGY_TRANSITION_TURNS,
  STRATEGY_RETOOL_COST_FRACTION,
  CANCEL_COST_FRACTION,
} from "@/lib/constants/sectorStrategies";
import type { SectorStrategy } from "@/lib/constants/sectorStrategies";
import { computePriceRealization } from "@/lib/market/priceRealization";
import { applyExtractionResourceCapacityToSupply } from "@/lib/corporations/extractionResourceSupply";
import {
  getStrategyAvailability,
  type StrategyAvailabilityWorld,
  type TechCorpView,
} from "@/lib/constants/techTree";
import { COMMODITY_BASE_PRICES, computeBlendedMarginModifiers } from "@/lib/constants/commodities";
import type { CommodityType, ExtractableResource } from "@/lib/constants/commodities";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { projectStrategyRevenuePerTurn } from "@/lib/corporations/strategyRevenuePreview";
import { calculatePlantSectorSplit } from "@/lib/corporations/plantSectorSplit";
import { capacityRescaleRatio } from "@/lib/constants/capacityEconomy";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { crisesCollection } from "@/lib/db/repositories/crises";
export { buildSectorPlantsSection } from "./sectorDetailPlants";
export { computeSectorMarketPosition, computeSectorMarginSection } from "./sectorDetailMarket";

// Apportioned per-sector tax — matches the corp page formula exactly for THIS sector:
//   corpLevelCosts = marketing + logistics + CEO salary
//     (equivalent to corp.sectorOpTotal − operatingIncome used on the corp page)
//   revenueShare = sectorEconomicRevenue(sector) / corpRevenue
//   netIncome = profit − corpLevelCosts × revenueShare
//   tax = max(0, netIncome) × rate / 100
// Sibling sector margins never enter THIS sector's tax formula, so no approximation.
// Build domestic/foreign rate maps — per-sector selection based on
// corp.countryId === sector.countryId matches the simulation tax path.
export function computeSectorTaxSection(args: {
  allFederalBudgets: FederalBudget[];
  allSiblingStateBudgets: StateBudget[];
  corporation: Corporation;
  allCorpSectors: Pick<CorporateSector, "revenue" | "countryId" | "realizedRevenue">[];
  sector: CorporateSector;
  profit: number;
  sectorCountryId: string;
  fxByCurrency: ReadonlyMap<CurrencyCode, number>;
}) {
  const {
    allFederalBudgets,
    allSiblingStateBudgets,
    corporation,
    allCorpSectors,
    sector,
    profit,
    sectorCountryId,
    fxByCurrency,
  } = args;
  const domesticFederalRateByCountry = new Map<string, number>();
  const foreignFederalRateByCountry = new Map<string, number>();
  for (const fb of allFederalBudgets) {
    if (!fb.countryId) continue;
    const dom = fb.taxRates?.domesticCorporateTax;
    if (typeof dom === "number") domesticFederalRateByCountry.set(fb.countryId, dom);
    const fgn = fb.taxRates?.foreignCorporateTax;
    if (typeof fgn === "number") foreignFederalRateByCountry.set(fb.countryId, fgn);
  }
  const domesticStateRateByStateId = new Map<string, number>();
  const foreignStateRateByStateId = new Map<string, number>();
  for (const sb of allSiblingStateBudgets) {
    const dom = sb.taxRates?.domesticCorporateTax;
    if (typeof dom === "number") domesticStateRateByStateId.set(sb._id, dom);
    const fgn = sb.taxRates?.foreignCorporateTax;
    if (typeof fgn === "number") foreignStateRateByStateId.set(sb._id, fgn);
  }
  const corpLevelCosts =
    (corporation.marketingBudget ?? 0) +
    (corporation.logisticsBudget ?? 0) +
    (corporation.ceoSalary ?? 0);
  // Revenue share apportions corp-level costs across sectors. Each sector's
  // revenue is stored in its HOST-state currency, so normalize every sector to ₳
  // before the ratio — a raw sum across a multinational's mixed-currency sectors
  // would distort the shares. Use the same realized-preferring basis
  // (sectorEconomicRevenue) the corp page weights its siblings by, not raw
  // nameplate — otherwise the two pages apportion the same sector's tax
  // differently whenever any sibling has a capacity/embargo/oversupply haircut.
  const revenueAnchorOf = (
    s: Pick<CorporateSector, "revenue" | "countryId" | "realizedRevenue">
  ): number =>
    readCorpEconomicAnchor(
      sectorEconomicRevenue(s),
      resolveSectorHostCurrencyCode(s, corporation),
      fxRateForSectorHostFromMap(s, corporation, fxByCurrency)
    );
  const corpRevenue = allCorpSectors.reduce((sum, s) => sum + revenueAnchorOf(s), 0);
  const thisRevenueShare = corpRevenue > 0 ? revenueAnchorOf(sector) / corpRevenue : 0;
  const thisSectorNetIncome = profit - corpLevelCosts * thisRevenueShare;
  const thisSectorTaxable = Math.max(0, thisSectorNetIncome);
  const isDomesticSector = corporation.countryId === sectorCountryId;
  const corpLegalStructure = getLegalStructureForCorp(corporation);
  const corpTaxMultiplier =
    corpLegalStructure.taxTreatment === "pass_through"
      ? 0
      : corpLegalStructure.taxTreatment === "preferential"
        ? (corpLegalStructure.taxMultiplier ?? 1)
        : 1;
  const sectorFederalRate =
    corpTaxMultiplier *
    (isDomesticSector
      ? (domesticFederalRateByCountry.get(sectorCountryId) ?? 0)
      : (foreignFederalRateByCountry.get(sectorCountryId) ?? 0));
  const sectorStateRate =
    corpTaxMultiplier *
    (isDomesticSector
      ? (domesticStateRateByStateId.get(sector.stateId) ?? 0)
      : (foreignStateRateByStateId.get(sector.stateId) ?? 0));
  const apportionedFederalTax = Math.round(thisSectorTaxable * (sectorFederalRate / 100));
  const apportionedStateTax = Math.round(thisSectorTaxable * (sectorStateRate / 100));
  return {
    corpLevelCosts,
    thisRevenueShare,
    thisSectorTaxable,
    sectorFederalRate,
    sectorStateRate,
    apportionedFederalTax,
    apportionedStateTax,
  };
}

// Active-crisis margin penalty for this sector — decaying disaster /
// infrastructure effects on sectors in this state. Mirrors the turn-engine
// blend (buildLookups -> computeDisasterMarginPenalty) so the detail page
// reflects the same hit, and links to the crises responsible.
export async function buildSectorCrisisSection(
  db: Db,
  sector: CorporateSector,
  sectorCountryId: string,
  currentTurn: number
) {
  const activeStateCrises = await crisesCollection(db)
    .find({
      status: "active",
      $or: [
        { regionIds: sector.stateId },
        { scope: "global" },
        { scope: "country", countryIds: sectorCountryId },
      ],
    })
    .toArray();
  // Every fetched crisis already affects this state (by the $or above), so the
  // resolver collapses each to this one stateId; computeDisasterMarginPenalty
  // then applies sector/strategy filters and the linear decay.
  const disasterEntries =
    buildDisasterEffectsByState(activeStateCrises, () => [sector.stateId]).get(sector.stateId) ??
    [];
  const crisisMarginPenalty = computeDisasterMarginPenalty(
    disasterEntries,
    { sectorType: sector.sectorType, strategyId: sector.strategyId ?? null },
    currentTurn
  );
  const activeCrises = activeStateCrises
    .filter((c) =>
      c.effects.some(
        (e) =>
          e.effectType === "decay" &&
          e.targetType === "profitMargin" &&
          (!e.sectorType || e.sectorType === sector.sectorType) &&
          (!e.strategyId || e.strategyId === (sector.strategyId ?? null))
      )
    )
    .map((c) => ({ id: c._id.toString(), name: c.name }));
  return { crisisMarginPenalty, activeCrises };
}

/** Attack/split panel info for the viewer's corporation (non-null viewer). */
export function buildSectorAttackInfo(args: {
  viewerCorporation: Corporation;
  defenderMarketingStrength: number;
  viewerCorpFxRate: number;
  sectorHostFxRate: number;
  sectorHostLiquidCode: CurrencyCode | undefined;
  sector: CorporateSector;
  sectorType: OperatingSectorType;
  sectorCountryId: CountryId;
  allTariffs: Tariff[];
  activeFtaPairs: Set<string>;
  unownedRevenue: number;
  effectiveMarket: number;
  mods: { effective: number };
  siblingsSectors: CorporateSector[];
  siblingRevenueAnchorById: Map<string, number>;
  /**
   * Under plants, unowned splits are gone — only rival plant takeovers remain.
   * Split quote fields are forced to 0 so no client can render a Split CTA.
   */
  plantsMode?: boolean;
}) {
  const {
    viewerCorporation,
    defenderMarketingStrength,
    viewerCorpFxRate,
    sectorHostFxRate,
    sectorHostLiquidCode,
    sector,
    sectorType,
    sectorCountryId,
    allTariffs,
    activeFtaPairs,
    unownedRevenue,
    effectiveMarket,
    mods,
    siblingsSectors,
    siblingRevenueAnchorById,
    plantsMode = false,
  } = args;
  const viewerCountryId = viewerCorporation.headquartersState
    ? viewerCorporation.countryId
    : sectorCountryId;
  const tariffEffectiveRate = getEffectiveTariffRate(
    allTariffs,
    sectorCountryId,
    sectorType,
    viewerCountryId,
    undefined,
    activeFtaPairs
  );
  const isDomesticSplitting = sectorCountryId === viewerCountryId;
  const tariffMultiplier = getSplitCaptureMultiplier(tariffEffectiveRate, isDomesticSplitting);
  const captureMultiplier =
    (1 + (viewerCorporation.marketingStrength ?? 0) / MS_CAPTURE_DIVISOR) * tariffMultiplier;
  // Raw capture for normal (1×) size — other sizes are scaled from this
  const rawCaptureNormal =
    unownedRevenue *
    SPLIT_BASE_CAPTURE_FRACTION *
    captureMultiplier *
    UNOWNED_CAPTURE_BONUS_MULTIPLIER;
  const baseSplitCost = calculateSplitCostAnchor(unownedRevenue);

  // Viewer's current revenue in this market (for projected share calc)
  const viewerSib = siblingsSectors.find(
    (s) => s.corporationId.toString() === viewerCorporation._id.toString()
  );
  const viewerCurrentRevAnchor = viewerSib
    ? (siblingRevenueAnchorById.get(viewerSib._id.toString()) ?? 0)
    : 0;

  const buildStrengthInfo = (strength: SplitStrength) => {
    const mult = SPLIT_STRENGTH_MULTIPLIERS[strength];
    const strengthSplitCost = Math.round(baseSplitCost * mult);
    const strengthMsCost = calculateSplitMsCostForStrength(
      viewerCorporation.splitEscalation,
      strength
    );
    const strengthCapture = Math.min(
      Math.round(rawCaptureNormal * mult),
      Math.round(unownedRevenue)
    );
    const projectedRevAnchor = viewerCurrentRevAnchor + strengthCapture;
    const projectedMarketShare =
      effectiveMarket > 0 ? Math.round((projectedRevAnchor / effectiveMarket) * 10000) / 100 : 0;
    const estimatedNetIncome = Math.round((strengthCapture * mods.effective) / 100);
    return {
      splitCost: strengthSplitCost,
      splitMsCost: strengthMsCost,
      splitEstimatedCapture: strengthCapture,
      splitEstimatedNetIncome: estimatedNetIncome,
      projectedMarketShare,
      exceedsDominanceThreshold: projectedMarketShare > DOMINANCE_MARKET_SHARE_THRESHOLD,
    };
  };

  const fullStrengthInfo = buildStrengthInfo("full");
  const zeroSplit = {
    splitCost: 0,
    splitMsCost: 0,
    splitEstimatedCapture: 0,
    splitEstimatedNetIncome: 0,
    projectedMarketShare: 0,
    exceedsDominanceThreshold: false,
  };
  const userLiquidCapitalAnchor = Math.round(
    corpLiquidCapitalToAnchor(
      viewerCorporation.liquidCapital ?? 0,
      viewerCorporation,
      viewerCorpFxRate
    )
  );
  const hasPersistedPlantLedger =
    Number.isInteger(sector.plantCount) &&
    (sector.plantCount ?? 0) >= 2 &&
    typeof sector.capacityBookAnchor === "number" &&
    Number.isFinite(sector.capacityBookAnchor) &&
    sector.capacityBookAnchor >= 0;
  const plantSplitQuote =
    plantsMode && hasPersistedPlantLedger
      ? calculatePlantSectorSplit({
          defenderPlantCount: sector.plantCount as number,
          defenderBookValueAnchor: sector.capacityBookAnchor as number,
          attackerMarketingStrength: viewerCorporation.marketingStrength ?? 0,
          defenderMarketingStrength,
        })
      : null;

  return {
    attackCost: calculateAttackCostFromLocalRevenue(
      sector.revenue,
      sectorHostLiquidCode,
      sectorHostFxRate
    ),
    // Flat full-strength fields kept for backwards compat. Plants: always 0 —
    // unowned splits are retired; attackCost above is the only market action.
    splitCost: plantsMode ? 0 : fullStrengthInfo.splitCost,
    splitEstimatedCapture: plantsMode ? 0 : fullStrengthInfo.splitEstimatedCapture,
    splitMsCost: plantsMode ? 0 : fullStrengthInfo.splitMsCost,
    userMarketingStrength: roundMarketingStrength(viewerCorporation.marketingStrength ?? 0),
    userLiquidCapital: userLiquidCapitalAnchor,
    userLiquidCurrencyCode: resolveCorpLiquidCurrencyCode(viewerCorporation),
    stateId: sector.stateId,
    countryId: sectorCountryId,
    ...(plantsMode && hasPersistedPlantLedger ? { plantCount: sector.plantCount } : {}),
    ...(plantSplitQuote ? { plantSplitQuote } : {}),
    splitStrengths: plantsMode
      ? { full: zeroSplit, half: zeroSplit }
      : {
          full: fullStrengthInfo,
          half: buildStrengthInfo("half"),
        },
    sectorEffectiveMargin: mods.effective,
  };
}

/** For-sale listing info for a prospective buyer (null when not applicable). */
export async function buildSectorForSaleInfo(
  db: Db,
  args: {
    sector: CorporateSector;
    viewerCorporation: Corporation | null;
    isCeo: boolean;
    viewerCorpFxRate: number;
    sellerCurrency?: CurrencyCode | null;
    /** Local units per ₳ for the seller, to express a secured loan in ₳. */
    sellerFxRate?: number;
  }
) {
  const { sector, viewerCorporation, isCeo, viewerCorpFxRate, sellerCurrency } = args;
  const listing = sector.forSale;
  if (!listing || !viewerCorporation || isCeo) return null;
  // Detect buyers who already operate this sector type in this state; the
  // purchase is still allowed — it becomes a merge rather than a transfer.
  const conflict = await corporateSectorsCollection(db).findOne(
    {
      corporationId: viewerCorporation._id,
      stateId: sector.stateId,
      ...getCorporateSectorLaneQuery(sector),
    },
    {
      projection: {
        _id: 1,
        constructionFinancing: 1,
        constructionPropertyTransition: 1,
        corporationId: 1,
        sectorType: 1,
        industryModel: 1,
        mediaDiscriminator: 1,
        strategyId: 1,
      },
    }
  );
  const buyerCurrency = resolveCorpLiquidCurrencyCode(viewerCorporation);
  const feeLocal =
    listing.pledged && sector.constructionFinancing
      ? Math.round(
          sectorFxSpreadBetween(
            buyerCurrency,
            sector.constructionFinancing.currency as CurrencyCode,
            listing.priceAnchor
          ).spreadAnchor * viewerCorpFxRate
        )
      : Math.round(
          sectorFxSpreadBetween(buyerCurrency, sellerCurrency ?? buyerCurrency, listing.priceAnchor)
            .spreadAnchor * viewerCorpFxRate
        );
  const priceInViewerCapital =
    Math.round(
      anchorToCorpLiquidCapital(listing.priceAnchor, viewerCorporation, viewerCorpFxRate)
    ) + feeLocal;
  const viewerCapitalAnchor = Math.round(
    corpLiquidCapitalToAnchor(
      viewerCorporation.liquidCapital ?? 0,
      viewerCorporation,
      viewerCorpFxRate
    )
  );
  const hasFunds = (viewerCorporation.liquidCapital ?? 0) >= priceInViewerCapital;
  const priceValid = Number.isFinite(listing.priceAnchor) && listing.priceAnchor > 0;
  // A pledged site folds into the buyer's existing site once the price has paid
  // off the lender; any other listing needs the buyer's site free of secured debt.
  const mergeBlocked =
    !!conflict &&
    (listing.pledged
      ? securedSaleMergeRefusal(conflict) !== null
      : hasProtectedConstructionProperty(conflict));
  const securedLoan = await buildSecuredLoanInfo(db, sector, listing, args.sellerFxRate);
  // A merge keeps the buyer's strategy, so a different one is refused up front.
  const strategyMismatch = conflict ? sectorMergeStrategyRefusal(sector, conflict) : null;
  const constructionBlocked =
    !!sector.constructionPropertyTransition ||
    (hasProtectedConstructionProperty(sector) &&
      !(
        sector.constructionFinancing?.loanFunded === true &&
        ["building", "released"].includes(sector.constructionFinancing.status)
      ));
  // First reason the purchase is unavailable, so the buyer panel can say why
  // instead of disappearing. Null when eligible.
  const blockReason: SectorPurchaseBlockReason | null = !priceValid
    ? "invalid_price"
    : !hasFunds
      ? "insufficient_funds"
      : strategyMismatch
        ? "strategy_mismatch"
        : mergeBlocked
          ? "merge_blocked"
          : constructionBlocked
            ? "construction"
            : null;
  return {
    viewerCorporationId: viewerCorporation._id.toString(),
    viewerLiquidCurrencyCode: resolveCorpLiquidCurrencyCode(viewerCorporation),
    priceInViewerCapital,
    viewerCapitalAnchor,
    eligible: blockReason === null,
    blockReason: blockReason as SectorPurchaseBlockReason | null,
    blockDetail: blockReason === "strategy_mismatch" ? strategyMismatch : null,
    conflict: !!conflict,
    hasFunds,
    securedLoan,
  };
}

type SectorPurchaseBlockReason =
  | "invalid_price"
  | "insufficient_funds"
  | "merge_blocked"
  | "strategy_mismatch"
  | "construction"
  | "not_ceo"
  | "actions_paused"
  | "state_controlled";

/** Strategy panel: current/available strategies, transition and cost fields. */
export function buildSectorStrategySection(args: {
  preset?: string;
  sector: CorporateSector;
  sectorType: OperatingSectorType;
  effectiveRates: { isTransitioning: boolean };
  transitionProgress: number;
  strategyTransitionMod: number;
  currentTurn: number;
  sectorHostLiquidCode: CurrencyCode | undefined;
  sectorHostFxRate: number;
  commodityPrices: CommodityPrice[];
  techCorpView: TechCorpView;
  techCurrentYear: number;
  techTreesEnabled: boolean;
  /** Breakthrough research and, in diffusion worlds, country access. */
  strategyWorld?: StrategyAvailabilityWorld;
  mediaOperatingModelsEnabled?: boolean;
  shouldRedact: boolean;
  stateResources: Partial<Record<ExtractableResource, number>> | null | undefined;
  strategyCapacityMultipliers: Map<string, Partial<Record<ExtractableResource, number>>> | null;
  /**
   * Commodity-market state for the per-strategy margin projection. Same inputs
   * `computeBlendedMarginModifiers` gets for the live sector, so a projection
   * and the real thing can never disagree.
   */
  marginProjection: {
    globalBalances: Map<CommodityType, { supply: number; demand: number }>;
    nationalBalances: Map<CommodityType, { supply: number; demand: number }>;
    stateBalances: Map<CommodityType, { supply: number; demand: number }>;
    globalWeight: number;
    nationalWeight: number;
    localWeight: number;
    /** The live sector's own commodity modifier — the baseline to diff against. */
    currentCommodityModifier: number;
    /**
     * The live sector's realization multiplier, to diff the revenue leg against.
     * null when the price-realization market mode is OFF — projecting a revenue
     * change the engine would not apply is worse than showing nothing.
     */
    currentRealization: number | null;
  } | null;
}) {
  const {
    sector,
    sectorType,
    effectiveRates,
    transitionProgress,
    strategyTransitionMod,
    currentTurn,
    sectorHostLiquidCode,
    sectorHostFxRate,
    commodityPrices,
    techCorpView,
    techCurrentYear,
    techTreesEnabled,
    mediaOperatingModelsEnabled = false,
    shouldRedact,
    stateResources,
    strategyCapacityMultipliers,
    marginProjection,
  } = args;
  return {
    currentStrategyId: sector.strategyId ?? "standard",
    operatingSectorType: sectorType,
    mediaOperatingModelsEnabled,
    currentStrategyName: getStrategy(sectorType, sector.strategyId ?? "standard").name,
    isTransitioning: effectiveRates.isTransitioning,
    isReversing: sector.isReversing ?? false,
    transitionFromStrategyId: sector.transitionFromStrategyId ?? null,
    transitionStartTurn: sector.transitionStartTurn ?? null,
    transitionProgress: transitionProgress > 0 ? transitionProgress : null,
    transitionMarginPenalty: Math.round(Math.abs(strategyTransitionMod) * 10) / 10,
    cancelCost:
      effectiveRates.isTransitioning && !sector.isReversing
        ? Math.round(
            transitionProgress *
              CANCEL_COST_FRACTION *
              readCorpEconomicAnchor(sector.revenue, sectorHostLiquidCode, sectorHostFxRate)
          )
        : 0,
    reversalTurns:
      effectiveRates.isTransitioning && !sector.isReversing
        ? Math.max(1, Math.round(transitionProgress * STRATEGY_TRANSITION_TURNS))
        : 0,
    cooldownUntilTurn: sector.transitionCooldownUntilTurn ?? null,
    cooldownRemaining:
      sector.transitionCooldownUntilTurn != null
        ? Math.max(0, sector.transitionCooldownUntilTurn - currentTurn)
        : 0,
    retoolCost: Math.round(
      readCorpEconomicAnchor(sector.revenue, sectorHostLiquidCode, sectorHostFxRate) *
        STRATEGY_RETOOL_COST_FRACTION
    ),
    availableStrategies: (() => {
      // Strategy-picker revenue preview (extraction only): projected ₳/turn
      // at current lagged prices, capacity-clamped per resource — the number
      // that makes "big rate, no deposit" visible before retooling. Uses the
      // same globalPrice/base positive-price guard as the realization map.
      const previewPriceRatioByCommodity = new Map(
        commodityPrices
          .filter(
            (p) =>
              typeof p.globalPrice === "number" &&
              COMMODITY_BASE_PRICES[p.commodity] > 0 &&
              p.globalPrice > 0
          )
          .map((p) => [p.commodity as string, p.globalPrice / COMMODITY_BASE_PRICES[p.commodity]])
      );
      const sectorRevenueForPreview = readCorpEconomicAnchor(
        sector.revenue,
        sectorHostLiquidCode,
        sectorHostFxRate
      );

      // Per-strategy margin + realization projection, for every sector type.
      // Strategies carry no direct margin modifier: their effect is the commodity
      // supply/demand mix they impose (see sectorStrategies.ts header). So project
      // by running computeBlendedMarginModifiers over each candidate strategy's
      // rates against today's market, then diff against the live sector's modifier.
      const priceRatioMapTyped = new Map<CommodityType, number>(
        commodityPrices
          .filter(
            (p) =>
              typeof p.globalPrice === "number" &&
              COMMODITY_BASE_PRICES[p.commodity] > 0 &&
              p.globalPrice > 0
          )
          .map((p) => [
            p.commodity as CommodityType,
            p.globalPrice / COMMODITY_BASE_PRICES[p.commodity],
          ])
      );

      const projectStrategy = (s: SectorStrategy) => {
        if (!marginProjection || shouldRedact) return { marginDelta: null, realizationDelta: null };
        // Capacity-clamp the supply exactly as the live sector's is clamped, so
        // an extraction strategy targeting deposits the state does not have
        // projects its real (zero) yield rather than its nameplate rate.
        const cappedSupply = applyExtractionResourceCapacityToSupply(
          sectorType,
          s.supply,
          stateResources === undefined ? undefined : (stateResources ?? {})
        );
        const { inputMod, surplusMod } = computeBlendedMarginModifiers(
          sectorType,
          marginProjection.globalBalances,
          marginProjection.nationalBalances,
          marginProjection.stateBalances,
          marginProjection.globalWeight,
          marginProjection.nationalWeight,
          marginProjection.localWeight,
          cappedSupply,
          s.demand
        );
        const projectedCommodityMod = inputMod + surplusMod;
        const projectedRealization = computePriceRealization(cappedSupply, priceRatioMapTyped);
        return {
          // Percentage points the effective margin would move by.
          marginDelta:
            Math.round((projectedCommodityMod - marginProjection.currentCommodityModifier) * 10) /
            10,
          // Fractional change in realized revenue (0.08 = +8%).
          realizationDelta:
            marginProjection.currentRealization != null && marginProjection.currentRealization > 0
              ? Math.round(
                  (projectedRealization / marginProjection.currentRealization - 1) * 1000
                ) / 1000
              : null,
        };
      };

      return (
        getSectorStrategies(
          sectorType,
          mediaOperatingModelsEnabled,
          sector.mediaDiscriminator,
          args.preset
        ).map((s, _index, strategies) => {
          const availability = getStrategyAvailability(
            techCorpView,
            s,
            techCurrentYear,
            techTreesEnabled,
            args.strategyWorld
          );
          const projection = projectStrategy(s);
          return {
            id: s.id,
            name: s.name,
            description: s.description,
            locked: availability.locked,
            lockReason: availability.reason ?? null,
            lockOpensYear: availability.opensYear ?? null,
            minDecade: s.minDecade ?? null,
            ...strategyRetoolPricing(args, strategies, s.id),
            // Margin points this strategy would move, at today's prices. null when redacted.
            projectedMarginDelta: projection.marginDelta,
            // Fractional change to realized revenue via price realization.
            projectedRealizationDelta: projection.realizationDelta,
            // D9 capacity rescale preview (plants tier): retooling re-denominates
            // capacity into the new output mix at equal value, so the unit count
            // moves though nothing was built or scrapped. Shipped for every mode
            // (unread below plants) using the retool command's `capacityRescaleRatio`.
            capacityRescaleRatio: capacityRescaleRatio(
              sectorType,
              sector.strategyId,
              s.id,
              sector.industryModel,
              sector.mediaDiscriminator
            ),
            capacityAfterRetool:
              typeof sector.capitalStock === "number" && Number.isFinite(sector.capitalStock)
                ? sector.capitalStock *
                  capacityRescaleRatio(
                    sectorType,
                    sector.strategyId,
                    s.id,
                    sector.industryModel,
                    sector.mediaDiscriminator
                  )
                : null,
            // ₳/turn preview; null when redacted or not an extraction sector.
            projectedRevenuePerTurn:
              sectorType === "extraction" && !shouldRedact
                ? Math.round(
                    projectStrategyRevenuePerTurn({
                      revenueAnchor: sectorRevenueForPreview,
                      supply: s.supply,
                      priceRatioByCommodity: previewPriceRatioByCommodity,
                      capacityMultipliers:
                        stateResources === undefined
                          ? undefined // no cap doc, uncapped legacy state
                          : stateResources === null
                            ? null // cap doc with no resources, zero capacity
                            : (strategyCapacityMultipliers?.get(s.id) ?? {}),
                    })
                  )
                : null,
          };
        }) ?? []
      );
    })(),
    currentTurn,
  };
}
