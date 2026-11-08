/** Market position and margin sections of the sector detail view. */
import type {
  State,
  CorporateSector,
  Corporation,
  UnownedSector,
  StateMetrics,
  GameState,
  Tariff,
  Subsidy,
} from "@/lib/db/types";
import {
  loadFxRatesByCurrency,
  resolveSectorHostCurrencyCode,
  fxRateForSectorHostFromMap,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import { computeMarketSharePercent } from "@/lib/corporations/marketShare";
import { isNppOwned } from "@/lib/corporations/nppOwned";
import { calculatePlantSectorSplit } from "@/lib/corporations/plantSectorSplit";
import {
  type OperatingSectorType,
  type StateMetricValues,
  type MacroEconomicValues,
  getHomeLocationMarginBonus,
  getStateSectorSpecializationMarginBonus,
  TYPE_SWITCH_PENALTY_TURNS,
  computeAllMarginModifiers,
  softCapEffectiveMargin,
} from "@/lib/constants/corporations";
import type { CountryId } from "@/lib/constants/countries";
import type { FtaCoverage } from "@/lib/tariffs/ftaOverrides";
import { type CommodityType, computeBlendedMarginModifiers } from "@/lib/constants/commodities";
import {
  type EffectiveStrategyRates,
  STRATEGY_TRANSITION_TURNS,
  STRATEGY_TRANSITION_MARGIN_PENALTY,
  getOperatingSectorType,
} from "@/lib/constants/sectorStrategies";
import {
  getForeignTariffMarginModifier,
  getDomesticTariffMalus,
} from "@/lib/tariffs/tariffEffects";
import { getSubsidyMarginModifier } from "@/lib/subsidies/subsidyEffects";
import { computeStateMetricMarginModifier } from "@/lib/corporations/sectorMetricMarginProfiles";
import { resolveGameYear } from "@/lib/era/era";
import { evaluateModifiers } from "@/lib/utils/approvalModifiers";
import { buildFlatMetrics } from "@/lib/utils/governmentApproval";
import { computeRegionalConditionMargin } from "@/lib/states/conditions/marginEffects";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import { sectorEconomicRevenue } from "@/lib/corporations/sectorRevenueBasis";
import { readPlantsPnl } from "@/lib/corporations/plantsPnlBasis";
import {
  sectorMaintenanceAndProfit,
  fundedSectorProfit,
} from "@/lib/corporations/rules/plantlessSector";

/**
 * Market position for the sector's (state, sectorType) bucket: effective
 * market size, market share, competitor rows, and the unowned pool.
 */
export function computeSectorMarketPosition(args: {
  state: State | null;
  sector: CorporateSector;
  sectorCountryId: string;
  corporation: Corporation;
  siblingCorps: Pick<
    Corporation,
    | "_id"
    | "name"
    | "sequentialId"
    | "brandColor"
    | "countryId"
    | "liquidCurrencyCode"
    | "ceoType"
    | "caretakerCeo"
    | "marketingStrength"
  >[];
  siblingsSectors: CorporateSector[];
  siblingFxByCurrency: Awaited<ReturnType<typeof loadFxRatesByCurrency>>;
  unownedDoc: UnownedSector | null;
  /**
   * Active world preset, for the era-correct GDP→₳ normalization of the
   * GDP-derived market size. Omitted = modern base config.
   */
  preset?: string;
}) {
  const {
    sector,
    sectorCountryId,
    corporation,
    siblingCorps,
    siblingsSectors,
    siblingFxByCurrency,
  } = args;
  const siblingCorpMap = new Map(siblingCorps.map((c) => [c._id.toString(), c]));

  // Each sibling sector's `revenue` is denominated in its HOST-state currency
  // (the market it operates in), not its owner's. Every sibling here is in the
  // same state as `sector` (same host country), so they share one host currency
  // — normalize each to ₳ at the host rate. Summing LOCAL values across mixed
  // currencies would produce wildly wrong market totals (e.g. a JPY-host sector's
  // ¥246M next to a USD-host sector's $204K). `unownedSectors.revenue` is already
  // ₳-native, so it sums directly below.
  const hostCode = resolveSectorHostCurrencyCode({ countryId: sectorCountryId }, corporation);
  const hostRate = fxRateForSectorHostFromMap(
    { countryId: sectorCountryId },
    corporation,
    siblingFxByCurrency
  );
  const siblingRevenueAnchorById = new Map<string, number>();
  for (const s of siblingsSectors) {
    // A loss-making or unsettled row must not shrink the market below a
    // producer's own revenue, or that producer reads as more than 100%.
    siblingRevenueAnchorById.set(
      s._id.toString(),
      Math.max(0, readCorpEconomicAnchor(s.revenue, hostCode, hostRate))
    );
  }
  const totalOwnedRevenue = siblingsSectors.reduce(
    (sum, s) => sum + (siblingRevenueAnchorById.get(s._id.toString()) ?? 0),
    0
  );

  // Market = the TOTAL real revenue produced in this (state, sectorType) cell
  //. No unowned pool, no GDP floor: a sector's share is its
  // revenue over what every producer actually earns, and the shares add to 100%.
  const effectiveMarket = Math.max(0, Math.round(totalOwnedRevenue));
  // Focal sector's own revenue in ₳ for market-share + competitor ratios.
  const sectorRevenueAnchor = siblingRevenueAnchorById.get(sector._id.toString()) ?? 0;
  // Ratio against the unrounded total so rounding the displayed market size
  // down cannot push a sole producer past 100%; clamped as a backstop.
  const shareOf = (revAnchor: number): number =>
    Math.round(computeMarketSharePercent(revAnchor, totalOwnedRevenue) * 100) / 100;
  const marketShare = shareOf(sectorRevenueAnchor);

  const competitors = siblingsSectors
    .filter((s) => s.corporationId.toString() !== corporation._id.toString())
    .map((s) => {
      const comp = siblingCorpMap.get(s.corporationId.toString());
      const revAnchor = siblingRevenueAnchorById.get(s._id.toString()) ?? 0;
      return {
        corporationName: comp?.name ?? "Unknown",
        corporationId: comp?._id.toString(),
        corporationSequentialId: comp?.sequentialId,
        brandColor: comp?.brandColor,
        // Which side of the market this rival sits on. The panel groups the NPP
        // field into one arc so a player's own share is legible against it; an
        // unresolved corp (`comp` missing) is treated as player-owned rather
        // than swept into the NPP mass, because guessing the other way would
        // quietly hide a real rival.
        isNpp: isNppOwned(comp),
        // Return revenue in ₳ so the UI's `formatAmountIn(value, sectorCurrency)`
        // formats to the sector's country-home currency consistently across
        // cross-currency competitors. Pre-fix this was LOCAL (each competitor's
        // own corp currency), which compared incoherently against the anchor-
        // denominated `totalMarket` / `unownedRevenue`.
        revenue: Math.round(revAnchor),
        marketShare: shareOf(revAnchor),
      };
    });

  // No unclaimed market any more: every bit of the cell's revenue belongs to a
  // real producer, so the "unowned" slice is gone.
  const unownedRevenue = 0;
  const unownedPercent = 0;

  // The defender's side of a sector split: what the strongest-marketing rival
  // in this market would take from this sector, and its odds, with the same
  // quote the attacker sees. Needs the persisted whole-plant ledger.
  let attackExposure: {
    rivalName: string;
    plantsAtRisk: number;
    plantCount: number;
    successProbability: number;
  } | null = null;
  const ownId = corporation._id.toString();
  const strongest = siblingCorps
    .filter((c) => c._id.toString() !== ownId)
    .reduce<(typeof siblingCorps)[number] | null>(
      (best, c) => ((c.marketingStrength ?? 0) > (best?.marketingStrength ?? -1) ? c : best),
      null
    );
  if (
    strongest &&
    Number.isInteger(sector.plantCount) &&
    (sector.plantCount ?? 0) >= 2 &&
    typeof sector.capacityBookAnchor === "number" &&
    Number.isFinite(sector.capacityBookAnchor)
  ) {
    const quote = calculatePlantSectorSplit({
      defenderPlantCount: sector.plantCount as number,
      defenderBookValueAnchor: sector.capacityBookAnchor,
      attackerMarketingStrength: strongest.marketingStrength ?? 0,
      defenderMarketingStrength: corporation.marketingStrength ?? 0,
    });
    if (quote.plantsAtRisk > 0) {
      attackExposure = {
        rivalName: strongest.name,
        plantsAtRisk: quote.plantsAtRisk,
        plantCount: sector.plantCount as number,
        successProbability: Math.round(quote.successProbability * 100) / 100,
      };
    }
  }

  return {
    effectiveMarket,
    marketShare,
    competitors,
    attackExposure,
    unownedRevenue,
    unownedPercent,
    siblingRevenueAnchorById,
  };
}

/**
 * Margin modifier stack for the sector: commodity blend, tariffs, subsidies,
 * strategy transition, state metrics, regional conditions — combined via the
 * shared computeAllMarginModifiers single source of truth.
 */
export function computeSectorMarginSection(args: {
  sector: CorporateSector;
  sectorType: OperatingSectorType;
  sectorCountryId: CountryId;
  corporation: Corporation;
  state: State | null;
  stateMetrics: StateMetrics | null;
  /** SP4 §4a: political margin overlay for playable regions (null elsewhere). */
  politicalBaseModifiers?: ReadonlyMap<string, { modifier: number; rawValue: number }> | null;
  gameState: GameState | null;
  metrics: StateMetricValues;
  macroEcon: MacroEconomicValues;
  currentTurn: number;
  totalCorpSectors: number;
  marketShare: number;
  allTariffs: Tariff[];
  activeFtaPairs: Set<string>;
  ftaCoverage: FtaCoverage;
  activeSubsidies: Subsidy[];
  tariffBlend: { globalWeight: number; nationalWeight: number; localWeight: number };
  effectiveSupply: Partial<Record<CommodityType, number>>;
  effectiveRates: EffectiveStrategyRates;
  globalBalances: Map<CommodityType, { supply: number; demand: number }>;
  nationalBalancesByCountry: Map<string, Map<CommodityType, { supply: number; demand: number }>>;
  stateBalances: Map<CommodityType, { supply: number; demand: number }>;
  /** Dynamic modifiers computed outside the shared static stack (tech, risk, crises). */
  additionalMarginModifier?: number;
}) {
  const {
    sector,
    sectorType,
    sectorCountryId,
    corporation,
    state,
    stateMetrics,
    gameState,
    metrics,
    macroEcon,
    currentTurn,
    totalCorpSectors,
    marketShare,
    allTariffs,
    activeFtaPairs,
    ftaCoverage,
    activeSubsidies,
    tariffBlend,
    effectiveSupply,
    effectiveRates,
    globalBalances,
    nationalBalancesByCountry,
    stateBalances,
    additionalMarginModifier = 0,
  } = args;
  // Commodity shortage margin modifier (authoritative total). Pass the
  // sector's effective strategy rates so the blended net matches the per-row
  // `priceImpact` sum for non-standard strategies (e.g. telecom on "cloud"
  // only consumes energy/electronics/real_estate — the default
  // SECTOR_DEMAND table would penalize it for copper and building_materials
  // it never actually buys).
  const { inputMod, surplusMod } = computeBlendedMarginModifiers(
    sectorType,
    globalBalances,
    nationalBalancesByCountry.get(sectorCountryId) ?? new Map(),
    stateBalances,
    tariffBlend.globalWeight,
    tariffBlend.nationalWeight,
    tariffBlend.localWeight,
    effectiveSupply,
    effectiveRates.demand
  );
  const commodityMarginMod = inputMod + surplusMod;

  const homeLocationBonus = getHomeLocationMarginBonus(
    sector.stateId,
    corporation.headquartersState,
    sectorCountryId,
    corporation.countryId
  );
  const stateSectorSpecializationMod = getStateSectorSpecializationMarginBonus(
    state?.sectorSpecializations,
    sectorType
  );

  // Use shared single-source-of-truth modifier computation
  const typeSwitchPenaltyActive =
    corporation.typeSwitchTurn != null &&
    currentTurn - corporation.typeSwitchTurn < TYPE_SWITCH_PENALTY_TURNS;

  const corpCountryId = corporation.countryId;
  const foreignTariffMod = getForeignTariffMarginModifier(
    allTariffs,
    sectorCountryId,
    sectorType,
    corpCountryId,
    corporation._id,
    activeFtaPairs
  );
  const domesticTariffMod = getDomesticTariffMalus(
    allTariffs,
    sectorCountryId,
    sectorType,
    corpCountryId,
    ftaCoverage
  );

  const subsidyMod = getSubsidyMarginModifier(
    activeSubsidies,
    corporation.headquartersState,
    sectorType,
    sector.stateId,
    sector.strategyId,
    sectorCountryId,
    corpCountryId
  );

  const transitionProgress =
    effectiveRates.isTransitioning && sector.transitionStartTurn != null
      ? Math.min(
          1,
          Math.max(0, (currentTurn - sector.transitionStartTurn) / STRATEGY_TRANSITION_TURNS)
        )
      : 0;
  // Penalty scales with progress: no disruption at turn 0, full −5% at turn 12
  const strategyTransitionMod = effectiveRates.isTransitioning
    ? sector.transitionStartTurn != null
      ? transitionProgress * STRATEGY_TRANSITION_MARGIN_PENALTY
      : STRATEGY_TRANSITION_MARGIN_PENALTY
    : 0;
  const stateMetricMargin = computeStateMetricMarginModifier({
    sectorType,
    strategyId: sector.strategyId ?? "standard",
    transitionFromStrategyId: sector.transitionFromStrategyId,
    transitionProgress,
    stateMetrics,
    countryId: sectorCountryId,
    // Live year for the era existence gate; null while the flag is off.
    year: gameState ? resolveGameYear(gameState) : null,
    // SP4 §4a: political margin overlay for playable regions.
    politicalBaseModifiers: args.politicalBaseModifiers ?? null,
  });
  const regionalConditionsModifiers = stateMetrics
    ? evaluateModifiers(buildFlatMetrics(stateMetrics), {
        preset: gameState?.preset,
        countryId: stateMetrics.countryId,
        // Live year for era-aware margins; null while the flag is off.
        year: gameState ? resolveGameYear(gameState) : null,
      })
        .filter((m) => m.marginEffect !== 0 && m.marginEffect !== undefined)
        .map((m) => ({
          id: m.id,
          label: m.label,
          effect: m.effect,
          marginEffect: m.marginEffect!,
          source: m.source,
        }))
    : [];
  const regionalConditionsModifier = computeRegionalConditionMargin(regionalConditionsModifiers);
  const mods = computeAllMarginModifiers(
    sectorType,
    sector.profitMargin,
    metrics,
    commodityMarginMod,
    homeLocationBonus,
    getOperatingSectorType(
      corporation.type,
      corporation.industryModel,
      corporation.mediaDiscriminator
    ),
    totalCorpSectors,
    macroEcon,
    corporation.logisticsStrength ?? 0,
    corporation.secondaryType,
    typeSwitchPenaltyActive,
    foreignTariffMod,
    domesticTariffMod,
    subsidyMod,
    strategyTransitionMod,
    stateSectorSpecializationMod,
    marketShare,
    sector.negativeProductionSustainedTurns ?? 0,
    sector.productionPolicyLevel ?? 0,
    {
      total: stateMetricMargin.cappedTotal,
      legacyTotal: stateMetricMargin.legacyTotal,
      contributions: stateMetricMargin.contributions,
      headlineModifiers: stateMetricMargin.headlineModifiers,
    },
    isStateOwned(corporation),
    regionalConditionsModifier,
    regionalConditionsModifiers,
    sector.sprawlMarginPp ?? null,
    sector.dominanceMarginPenaltyPp ?? null
  );
  // Compute profit off the REALIZED (embargo/haircut-adjusted) revenue basis —
  // the same `sectorEconomicRevenue` the corp list and Financials page already
  // use — instead of raw nameplate `sector.revenue`. On nameplate an
  // embargoed or suppressed sector would show a healthy net here while the
  // sector list (realized basis) shows a loss.
  const economicRevenue = sectorEconomicRevenue(sector);
  const stackMargin = softCapEffectiveMargin(mods.effective + additionalMarginModifier);
  // Money uses the margin the engine ACTUALLY applied last turn, exactly as the
  // corp page does (see corporationDetail.ts). Under plants the
  // stored field is derived from the physical P&L — inputs at live commodity
  // prices, labor, upkeep — which the stack recomputed above knows nothing
  // about. Observed on prod: a farm the engine paid −6.19% (input shortage x
  // output glut) rendered here at +48%, so this page showed +238K/day profit
  // on a sector losing money, directly contradicting the corp page one tap
  // away. The stack remains the advisory modifier breakdown and the fallback
  // for never-processed sectors; below plants stored == last turn's stack.
  const engineMargin =
    typeof sector.effectiveProfitMargin === "number" ? sector.effectiveProfitMargin : null;
  const effectiveMargin = engineMargin ?? stackMargin;
  const effectiveMods = { ...mods, effective: effectiveMargin };
  // Prefer the P&L the turn actually booked over inverting the
  // margin. `effectiveProfitMargin` is that P&L's OUTPUT, capped at 100, so
  // inverting it recovers a zero operating cost from a genuinely negative one
  // (profit == revenue, the reported defect) and drops upkeep + compliance on
  // every plants sector because they sit outside the margin's scope. See
  // `plantsPnlBasis.ts`. The inversion below stays as the fallback for sectors
  // with no persisted P&L yet, where it is the pre-existing behaviour exactly.
  const enginePnl = readPlantsPnl(sector);
  // A funded settlement row carries its booked profit but not the engine's cost
  // lines. Inverting the margin there gave zero cost to a sector that sold
  // nothing, so a plant losing its whole bill read as losing only its growth
  // charge. Use the booked profit, and size the bill so the page's lines
  // (maintenance + growth) still sum back to it.
  const { maintenance, profit } = sectorMaintenanceAndProfit({
    engine: enginePnl,
    fundedProfit: fundedSectorProfit(sector.plantsPnl),
    economicRevenue,
    effectiveMarginPct: effectiveMargin,
    growthCost: sector.currentGrowthCost,
    freightNet: (sector.freightBillingCredit ?? 0) - (sector.freightBillingCharge ?? 0),
  });

  return {
    mods: effectiveMods,
    maintenance,
    profit,
    enginePnl,
    transitionProgress,
    strategyTransitionMod,
  };
}
