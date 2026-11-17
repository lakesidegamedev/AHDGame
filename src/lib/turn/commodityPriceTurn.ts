import { settleCommodityPrices } from "@/lib/market/settleCommodityPrices";

/**
 * How commodity prices move each turn. processCommodityPriceTurn sums supply
 * and demand from owned sectors, prices each commodity as 50% global + 25%
 * national + 25% state, scales retail demand by GDP growth, and books
 * extraction depletion from realized output (realizedOutputFraction). A naval
 * blockade closes a country's seaborne trade lanes for the turn.
 *
 * Orchestration only: every DB read/write stays here, in the original order,
 * so the turn's query count and positional fetch sequence are unchanged. Phase
 * logic lives in ./commodity/.
 */

import { getDb } from "@/lib/mongodb";
import type { Corporation, CentralBank, ExchangeRate } from "@/lib/db/types";
import {
  COUNTRY_CURRENCY_MAP,
  INITIAL_RATES,
  eraRateForCurrency,
  getRuntimeInitialRates,
} from "@/lib/constants/currencies";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  fxRateForCorpFromMap,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import {
  eraScaledBasePrices,
  computeRawSupplyDemand,
  type SectorUnitsOut,
  type CommodityType,
  type ExtractableResource,
  RETAIL_GDP_DEMAND_SCALE,
  RETAIL_GDP_MULTIPLIER_MAX,
} from "@/lib/constants/commodities";
import { retailLegacyDemandFactor } from "@/lib/market/retailDemandTransition";
import {
  loadActiveSectorDemandModifierPctMap,
  loadActiveSectorOutputDemandModifierPctMap,
} from "@/lib/events/worldEvents/sectorDemandModifierMap";
import {
  getMarketSystemMode,
  marketAtLeast,
  getExtractionOutputScaleEnabled,
  getDemographicsDemandEnabled,
  getHouseholdConsumptionEnabled,
} from "@/lib/market/featureFlag";
import { PLANTS_HOUSEHOLD_SUPPLY_CAP } from "@/lib/turn/householdConsumption";
import {
  demandSupplyCapForStage,
  normalizeCommodityFixStage,
  retailGdpParamsForStage,
} from "@/lib/market/commodityFixStages";

import {
  inputDemandRealPhaseProgress,
  inputDemandRealPhaseStartTurnFrom,
} from "@/lib/market/inputDemandRealPhase";
import { GOVERNMENT_DEMAND_SUPPLY_CAP } from "@/lib/turn/commodity/rules/healthcareDemandCap";

import { computeExtractionCapacityMultipliers } from "@/lib/turn/extraction/extractionCapacity";
import { getStateResourceCapacityCollection } from "@/lib/db/collections/stateResourceCapacity";
import {
  getExtractionContractsCollection,
  activeExtractionContractFilter,
} from "@/lib/db/collections/extractionContracts";
import { loadCountryTiers } from "@/lib/country/countryTier";
import type { CountryId } from "@/lib/constants/countries";
import { readProducerPathClaim } from "@/lib/market/producerMarket/liveMode";

import { applySphereRoutedMacroContributions } from "@/lib/world/spheres";

import { depletedCapacityDoc } from "@/lib/extraction/depletion";
import { loadWorldPreset } from "@/lib/currency/gdpAnchorRate";
import { getEraUnitScale } from "@/lib/constants/sectorSeedEra";
import { resolveCommodityNominalIndices } from "@/lib/market/commodityNominalIndex";

export { realizedOutputFraction } from "@/lib/extraction/realizedOutputFraction";
import {
  buildStateLookups,
  stateGdpAnchorBlend,
  buildSectorRows,
  buildGdpGrowthData,
  buildPrimeRateByState,
  buildExtractionRevenueInputs,
  withRealizedOutputCaps,
  accumulatePlantsUnits,
} from "./commodity/sectorLedger";
import { demandCalibrationFor } from "./commodity/demandLegs";

import { bookExtractionDepletion } from "./commodity/extractionDepletion";
import { getCorporateSectorsCollection } from "@/lib/db/collections/corporateSectors";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { getStatesCollection } from "@/lib/db/collections/states";
import { getFederalBudgetCollection } from "@/lib/db/collections/federalBudget";
import { getGameStateCollection } from "@/lib/db/collections/gameState";

import { bondsCollection } from "@/lib/db/repositories/bonds";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";
import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";
import { commodityPricesCollection } from "@/lib/db/repositories/commodityPrices";

export interface CommodityPriceTurnResult {
  commoditiesUpdated: number;
  statesWithActivity: number;
  /** Total ₳ value of inter-country trade cleared this turn. */
  tradeClearedVolume: number;
}

/**
 * Compute and store commodity prices based on current owned sector supply/demand.
 * Called each turn after corporation turn processing.
 *
 * Retail sector demand is scaled by GDP growth (50% national average + 50% regional)
 * using the previous turn's GDP growth values from stateMetrics.
 *
 * Price formula per commodity:
 *   globalPrice  = computeMarketPrice(basePrice, globalSupply, globalDemand)
 *   nationalRaw  = computeMarketPrice(basePrice, countrySupply + stab, countryDemand + stab)
 *   regionalRaw  = computeMarketPrice(basePrice, stateSupply, stateDemand)
 *   blendedPrice = 0.5 × globalPrice + 0.25 × nationalRaw + 0.25 × regionalRaw
 *
 * COMMODITIES_NATIONAL_REGIONAL_PRICE_BLEND: regionalRaw falls through to nationalRaw
 * (financial, healthcare, advertising, real estate services), making the effective
 * blend 50% global + 50% national. State-level S/D is meaningless for these markets
 * because activity is driven by nationwide budgets, campaigns, or bond issuance.
 *
 * Only OWNED sectors count for supply/demand. Unowned does not participate.
 */
/** Turns of debt issuance that feed latent financial-services demand (one game year). */
export const DEBT_ISSUANCE_WINDOW_TURNS = 48;

/**
 * Bonds counted as recent debt issuance for the turn being processed.
 *
 * The window is the completed year before this turn, [turn - 48, turn), and a
 * bond still counts if it was matured or redeemed during this turn. Both rules
 * matter because bond issuance and maturity run in parallel with commodity
 * pricing: the old `issuedAtTurn > turn - 48 && matured: false` filter dropped
 * the cohort issued a year ago before this turn's replacement issue was
 * visible, so financial-services demand dipped every quarter.
 */
export function recentDebtIssuanceFilter(turn: number) {
  return {
    issuedAtTurn: { $gte: Math.max(0, turn - DEBT_ISSUANCE_WINDOW_TURNS), $lt: turn },
    $or: [{ matured: false }, { redeemedAtTurn: { $gte: turn } }],
  };
}

async function prepareProcessCommodityPriceTurn(turn: number) {
  const db = await getDb();
  const now = new Date();
  // Window covers one game year (48 turns). Latent financial demand derives from
  // sovereign and corporate debt issuance within this window. Short windows (e.g. 12)
  // leave countries whose only bonds were seeded at game start with zero demand once
  // those bonds age out — the 1-year window keeps demand stable across countries with
  // infrequent sovereign issuance (JP, CA, DE).
  // The tier snapshot is the registry read plus the background flag, in the
  // same round trip: `registeredIds` is exactly what getRegisteredCountryIds
  // returned, and `backgroundIds` names the countries whose book comes from
  // their macro economy (#5702). Empty on every world without the flag.
  const [countryTiers, ledgerConfig] = await Promise.all([
    loadCountryTiers(db),
    gameConfigCollection(db).findOne(
      { _id: "default" },
      {
        projection: {
          marketSystemMode: 1,
          productLinesV2Enabled: 1,
          commandEconomyEnabled: 1,
          retailDemandTransitionStartTurn: 1,
          retailDemandTransitionTurns: 1,
          commodityNominalPriceIndex: 1,
          commodityNominalPriceIndexTurn: 1,
          stateGdpAnchorPhaseStartTurn: 1,
          tradeConvergenceFullStartTurn: 1,
        },
      }
    ),
  ]);
  const countries = countryTiers.registeredIds;
  const backgroundCountryIds = new Set<string>(countryTiers.backgroundIds);
  const marketSystemMode = await getMarketSystemMode(ledgerConfig);
  const plantsLedgerEnabled = marketAtLeast(marketSystemMode, "plants");
  const productsEnabled = ledgerConfig?.productLinesV2Enabled === true && plantsLedgerEnabled;

  // Fetch all owned sectors, GDP growth data, corporations, central banks, states, and budgets in parallel
  const [
    allSectors,
    allStateMetrics,
    allCorporations,
    centralBanks,
    allStates,
    recentBonds,
    federalBudgets,
    exchangeRateDocs,
    nudgeDocs,
    existingPrices,
    allStateBudgets,
  ] = await Promise.all([
    (await getCorporateSectorsCollection(db))
      .find(
        {},
        {
          projection: {
            sectorType: 1,
            revenue: 1,
            // Realized price leg (clearing factor / sold fraction) for the
            // input-demand deflator (src/lib/market/inputDemandRealPhase.ts).
            clearingFactor: 1,
            soldFraction: 1,
            countryId: 1,
            stateId: 1,
            corporationId: 1,
            strategyId: 1,
            transitionFromStrategyId: 1,
            transitionStartTurn: 1,
            productionPolicyLevel: 1,
            // Plants tier: real production, capacity, cold/embargo state.
            producedUnits: 1,
            soldUnits: 1,
            capitalStock: 1,
            operatingCapacityUnits: 1,
            mothballed: 1,
            embargoSuspended: 1,
            embargoExportExposure: 1,
            militaryDivertedFraction: 1,
            militaryDivertedTurn: 1,
            ...(productsEnabled
              ? {
                  outputUnitsByCommodity: 1,
                  outputAnchorByCommodity: 1,
                  productQualityByCommodity: 1,
                }
              : {}),
          },
        }
      )
      .toArray(),
    macroMetricsCollection(db)
      .find(
        {},
        {
          projection: {
            "economic.gdpGrowth.value": 1,
            // Household Ledger signals (used only when householdConsumptionEnabled)
            "economic.medianIncome.value": 1,
            "economic.unemploymentRate.value": 1,
            "economic.consumerConfidence.value": 1,
            "infrastructure.roadCondition.value": 1,
          },
        }
      )
      .toArray(),
    (await getCorporationsCollection(db))
      .find(
        {},
        {
          projection: {
            _id: 1,
            marketingBudget: 1,
            "bankCharter.status": 1,
            "bankCharter.totalLoans": 1,
            "bankCharter.currency": 1,
            liquidCapital: 1,
            headquartersState: 1,
            countryOwnerId: 1,
            countryId: 1,
            liquidCurrencyCode: 1,
            internalSupplyPolicy: 1,
            totalShares: 1,
            "shareholders.corporationId": 1,
            "shareholders.shares": 1,
          },
        }
      )
      .toArray(),
    centralBanksCollection(db)
      .find({})
      .project<Pick<CentralBank, "_id" | "countryId" | "primeRate">>({ countryId: 1, primeRate: 1 })
      .toArray(),
    (await getStatesCollection(db))
      .find({}, { projection: { _id: 1, countryId: 1, gdp: 1, population: 1 } })
      .toArray(),
    bondsCollection(db)
      .find(recentDebtIssuanceFilter(turn), {
        projection: {
          issuerType: 1,
          countryId: 1,
          corporationId: 1,
          totalIssued: 1,
          currencyCode: 1,
        },
      })
      .toArray(),
    (await getFederalBudgetCollection(db))
      // Project the WHOLE category map, not named paths. A pinned projection
      // silently strips legs added later (and alternate spellings like
      // `health`), so a new GOVT_SPEND_DEMAND leg would read zero.
      .find(
        {},
        {
          projection: {
            countryId: 1,
            "spending.byCategory": 1,
            economicFactors: 1,
            currencyCode: 1,
            gdp: 1,
            gdpSmoothed: 1,
          },
        }
      )
      .toArray(),
    exchangeRatesCollection(db)
      .find({})
      .project<Pick<ExchangeRate, "_id" | "currencyCode" | "rate">>({ currencyCode: 1, rate: 1 })
      .toArray(),
    // Admin-set one-turn price nudges for this turn
    commodityPricesCollection(db)
      .find({ nudgeTurn: turn, nudgePrice: { $ne: null } } as Record<string, unknown>, {
        projection: { commodity: 1, nudgePrice: 1 },
      })
      .toArray(),
    // Existing commodity prices for drift baseline and peg state
    commodityPricesCollection(db)
      .find(
        {},
        {
          projection: {
            commodity: 1,
            globalPrice: 1,
            statePrices: 1,
            // Sourcing quotes these as each foreign seller's ask.
            nationalPrices: 1,
            hardPeg: 1,
            stateHardPegs: 1,
            stateNudges: 1,
            scarcityMult: 1,
            scarcityMultByCountry: 1,
            // Momentum-mode ratchet (commodityFixStage >= 1) reads its
            // trailing imbalance window back from the previous turn.
            scarcityImbalanceHistory: 1,
            scarcityImbalanceHistoryByCountry: 1,
            // Plants household re-anchor: prior global supply for the
            // PLANTS_HOUSEHOLD_SUPPLY_CAP clamp.
            globalSupply: 1,
          },
        }
      )
      .toArray(),
    stateBudgetsCollection(db)
      .find({}, { projection: { stateId: 1, stateGdp: 1 } })
      .toArray(),
  ]);

  // Build set of natcorp corporation IDs (country-owned enterprises)
  const natcorpIds = new Set(
    allCorporations
      .filter((c: Corporation) => !!c.countryOwnerId)
      .map((c: Corporation) => c._id.toString())
  );

  // Per-corp FX lookup: normalize corp-level fields such as marketingBudget
  // before feeding commodity-demand math, so corps in different home currencies
  // contribute correctly to shared supply/demand curves.
  // fxByCurrency is also used later for government healthcare-spending
  // normalization (line ~410) — declared once here and reused below.
  const fxByCurrency = new Map<CurrencyCode, number>(
    exchangeRateDocs.map((r) => [r.currencyCode as CurrencyCode, r.rate])
  );
  if (!fxByCurrency.has("USD")) fxByCurrency.set("USD", 1.0);

  // Budget-only economies (the six Warsaw Pact members of #3778 §1) are not in
  // FOREX_ACTIVE_COUNTRIES, so `seedExchangeRates` never writes them a row and
  // `fxByCurrency` has no entry. Falling straight through to 1.0 reads their
  // budgets as though 1 złoty = ₳1, inflating every ₳-normalized demand they
  // contribute. The authored era rate is the correct answer, so resolve it from
  // the preset's table before conceding to 1.0. INITIAL_RATES (2019) stays as
  // the last resort for an unknown preset, matching prior behaviour.
  const presetState = await (
    await getGameStateCollection(db)
  ).findOne(
    { _id: "current" },
    {
      // `currentYear` rides along for the planned-economy output remap below —
      // widening this projection rather than adding a read, so the positional
      // fetch order the turn tests mock stays exactly as it is.
      projection: {
        preset: 1,
        currentYear: 1,
        stateGdpAnchoredDemand: 1,
        hardwareInputReliefStartTurn: 1,
        worldEpochId: 1,
      },
    }
  );
  // The corporation phase claims this turn's producer path first. On a funded
  // turn prices come from the settled market's supply and demand, never from
  // the formula ledgers built below.
  const producerPath = await readProducerPathClaim(db, presetState?.worldEpochId, turn);
  const activePreset = presetState?.preset ?? "";
  // One calibration lookup for the whole pass: the supply caps bound the
  // calibrated demand and `applyDemandCalibration` applies it (ticket 1370).
  const demandCalibration = demandCalibrationFor(activePreset);
  const ledgerCurrentYear = presetState?.currentYear ?? null;
  for (const code of Object.values(COUNTRY_CURRENCY_MAP) as CurrencyCode[]) {
    if (fxByCurrency.has(code)) continue;
    const authoredRate = eraRateForCurrency(code, activePreset);
    if (authoredRate !== undefined) fxByCurrency.set(code, authoredRate);
  }
  // Resolved here, above the supply ledger, because a command economy's media
  // produces state information rather than sold advertising. Safe to add: every
  // positional cursor the turn tests stub is already consumed by the parallel
  // block above, so reads from here on fall through to the catch-all.
  const nominalIndices = resolveCommodityNominalIndices({
    index: ledgerConfig?.commodityNominalPriceIndex,
    lastTurn: ledgerConfig?.commodityNominalPriceIndexTurn,
    currentTurn: turn,
    countryInflationRates: federalBudgets.map(
      (budget) => budget.economicFactors?.inflationRate ?? Number.NaN
    ),
  });
  const commodityNominalPriceIndex = nominalIndices.current;
  const ledgerCommandEconomyEnabled = ledgerConfig?.commandEconomyEnabled === true;
  const eraRates = getRuntimeInitialRates(activePreset);
  /** ₳-normalizing FX rate for a country's budget, era-aware. */
  const fxRateForCountry = (countryId: string | undefined): number => {
    const code = (COUNTRY_CURRENCY_MAP[countryId as keyof typeof COUNTRY_CURRENCY_MAP] ??
      "USD") as CurrencyCode;
    return (
      fxByCurrency.get(code) ??
      eraRates[countryId as CountryId] ??
      INITIAL_RATES[countryId as CountryId] ??
      1.0
    );
  };

  const currencyByCorpId = new Map<string, { code: CurrencyCode | undefined; rate: number }>();
  const corporationById = new Map<string, Corporation>();
  for (const corp of allCorporations) {
    corporationById.set(corp._id.toString(), corp);
    currencyByCorpId.set(corp._id.toString(), {
      code: resolveCorpLiquidCurrencyCode(corp),
      rate: fxRateForCorpFromMap(corp, fxByCurrency),
    });
  }

  // ── Supply-ledger inputs ──────────────────────────────────────────────
  // Worlds reset after the state GDP unit fix read anchor GDP; older worlds keep
  // the raw stored figure so their demand does not shift mid-game.
  const gdpAnchorBlend = stateGdpAnchorBlend(
    presetState?.stateGdpAnchoredDemand === true,
    ledgerConfig?.stateGdpAnchorPhaseStartTurn,
    turn
  );
  const { stateGdpMap, stateToCountry, roadConditionByState } = buildStateLookups(
    allStates,
    allStateMetrics,
    gdpAnchorBlend > 0 ? activePreset : null,
    gdpAnchorBlend
  );

  // Plants tier: the world ledger reads real production instead of the revenue
  // nameplate. Resolved once and reused by the flow-ledger block below.
  const worldPreset = await loadWorldPreset(db);
  const ledgerEraUnitScale = getEraUnitScale(worldPreset);
  // The WHOLE ledger runs on the era base-price table: unit conversions scale,
  // mix-weight ratios cancel, and computed price LEVELS land on the same era
  // magnitudes seedCommodityPrices writes. One substitution, one basis — the
  // plants supply override (producedUnits, era units) and the demand legs below
  // must never sit on different unit bases or clearing and shortfall damages
  // compare incommensurable quantities. Identical table at scale 1.
  const LEDGER_BASE_PRICES = eraScaledBasePrices(ledgerEraUnitScale);

  // sectorId → realized ÷ nameplate extraction output. Filled by the extraction
  // block below (plants only) and read TWICE: once to book depletion, once to
  // scale the extraction SUPPLY contribution to the world ledger. Those two must
  // read the same number — see the note at the supply leg in `commodities.ts`.
  const realizedFractionBySectorId = new Map<string, number>();

  const sectorData = buildSectorRows({
    allSectors,
    corporationById,
    natcorpIds,
    fxByCurrency,
    stateToCountry,
    ledgerCurrentYear,
    ledgerCommandEconomyEnabled,
    turn,
  });

  const gdpGrowthData = buildGdpGrowthData(allStateMetrics, stateGdpMap);

  // Central bank rates by country (needed for both real estate demand and financial demand)
  const centralBankByCountry = new Map<string, number>(
    centralBanks.map((b) => [b.countryId, b.primeRate])
  );
  const primeRateByState = buildPrimeRateByState(allStates, centralBankByCountry);

  // Structural extraction-shortage stabilizer (audit t873): boosts extraction
  // supply per-resource. Read once and threaded into both the capacity-check
  // input (below) and the raw S/D accumulation so the two stay consistent.
  const extractionOutputScaleEnabled = await getExtractionOutputScaleEnabled();
  const demographicsDemandEnabled = await getDemographicsDemandEnabled();
  const householdConsumptionEnabled = await getHouseholdConsumptionEnabled();
  // Commodity treadmill fix stage (0..6), advanced one per turn by an operator.
  const fixStageCfg = await gameConfigCollection(db).findOne(
    { _id: "default" } as Record<string, unknown>,
    {
      projection: {
        commodityFixStage: 1,
        marketRecoveryStage: 1,
        inputDemandRealPhaseStartTurn: 1,
        producerPriceMaxMove: 1,
        producerPriceMaxMultiplier: 1,
        producerSoftPriceCeilingStage: 1,
      },
    }
  );
  const inputDemandRealPhase = inputDemandRealPhaseProgress(
    inputDemandRealPhaseStartTurnFrom(fixStageCfg),
    turn
  );
  const commodityFixStage = normalizeCommodityFixStage(fixStageCfg?.commodityFixStage);
  const retailGdpParams = retailGdpParamsForStage(commodityFixStage, {
    scale: RETAIL_GDP_DEMAND_SCALE,
    max: RETAIL_GDP_MULTIPLIER_MAX,
  });
  const householdSupplyCap = demandSupplyCapForStage(
    commodityFixStage,
    PLANTS_HOUSEHOLD_SUPPLY_CAP
  );
  const governmentSupplyCap = demandSupplyCapForStage(
    commodityFixStage,
    GOVERNMENT_DEMAND_SUPPLY_CAP
  );
  const retailSelfLoopFactor =
    plantsLedgerEnabled && householdConsumptionEnabled
      ? retailLegacyDemandFactor(ledgerConfig, turn)
      : 1;

  // Pre-compute extraction capacity multipliers
  const extractionSectors = sectorData.filter((s) => s.sectorType === "extraction");
  let extractionMultipliers: Map<string, Partial<Record<ExtractableResource, number>>> | undefined;

  if (extractionSectors.length > 0) {
    const stateIds = [...new Set(extractionSectors.map((s) => s.stateId))];
    const [capacityDocs, activeContracts] = await Promise.all([
      (await getStateResourceCapacityCollection(db)).find({ stateId: { $in: stateIds } }).toArray(),
      (await getExtractionContractsCollection(db))
        .find({ stateId: { $in: stateIds }, ...activeExtractionContractFilter() })
        .toArray(),
    ]);

    const extractionInputs = buildExtractionRevenueInputs(
      extractionSectors,
      turn,
      LEDGER_BASE_PRICES,
      extractionOutputScaleEnabled,
      realizedFractionBySectorId,
      plantsLedgerEnabled
    );

    // P3b (plants only): deposits are FINITE. Ration against the
    // depletion-adjusted ceiling — min(per-turn flow, units left in the ground)
    // — and then book this turn's extraction against the reserve. Below plants
    // `depletedCapacityDoc` is never called and both the rationing and the
    // (absent) depletion write are byte-identical to before.
    // Reuses `plantsLedgerEnabled` (resolved once above from `marketSystemMode`)
    // instead of re-reading gameConfig — same value, one fewer round trip, and
    // no way for the two reads to disagree mid-turn.
    const plantsEnabled = plantsLedgerEnabled;
    const rationingDocs = plantsEnabled ? capacityDocs.map(depletedCapacityDoc) : capacityDocs;
    extractionMultipliers = computeExtractionCapacityMultipliers(
      plantsEnabled
        ? withRealizedOutputCaps(extractionInputs, realizedFractionBySectorId)
        : extractionInputs,
      activeContracts,
      rationingDocs
    );
    if (plantsEnabled) {
      await bookExtractionDepletion(
        db,
        extractionInputs,
        extractionMultipliers,
        now,
        realizedFractionBySectorId
      );
    }
  }

  // World Events v1 Phase 1: active sectorDemandModifier world-event
  // effects (e.g. royal-event's tourism bump), batch-loaded once per turn.
  const [sectorDemandModifierPct, sectorOutputDemandModifierPct] = await Promise.all([
    loadActiveSectorDemandModifierPctMap(db, turn),
    loadActiveSectorOutputDemandModifierPctMap(db, turn),
  ]);

  // EXTRACTION SUPPLY = REAL RATIONED OUTPUT (plants); see the ledger note in
  // the original — depletion is booked on nameplate × rationing ×
  // realizedFraction, so the supply leg reads the SAME fraction here.
  if (plantsLedgerEnabled && realizedFractionBySectorId.size > 0) {
    for (const sector of sectorData) {
      const f = sector.sectorId ? realizedFractionBySectorId.get(sector.sectorId) : undefined;
      if (typeof f === "number") sector.extractionRealizedFraction = f;
    }
  }

  // Compute raw supply/demand in units (retail demand scaled by GDP growth)
  const sectorUnits: SectorUnitsOut = { supplyBySector: new Map(), inputDemandBySector: new Map() };
  const { global, byState, supplyByCorporation, demandTruncated, productionInputDemandByState } =
    computeRawSupplyDemand(
      sectorData,
      gdpGrowthData,
      stateGdpMap,
      turn,
      primeRateByState,
      extractionMultipliers,
      extractionOutputScaleEnabled,
      sectorDemandModifierPct,
      householdConsumptionEnabled,
      plantsLedgerEnabled,
      // Era plants worlds (ticket #1027 phase 2): express every dollars-derived
      // ledger leg in the SAME era unit basis plants `producedUnits` uses. Below
      // plants, and on modern worlds (eraUnitScale 1), this is a pure no-op.
      plantsLedgerEnabled ? ledgerEraUnitScale : 1,
      sectorOutputDemandModifierPct,
      retailSelfLoopFactor,
      // Issue #2054: the same era table the clearing offer splits on, so the
      // measured-production mix split is weight-identical on both sides.
      LEDGER_BASE_PRICES,
      // Ticket 1370: the 1.5x cap bounds CALIBRATED demand. See the parameter.
      demandCalibration,
      activePreset,
      sectorUnits,
      retailGdpParams,
      inputDemandRealPhase,
      presetState?.hardwareInputReliefStartTurn
    );

  // Plants-tier produced/sold units for the inventory advance (see module).
  const plantsUnitsByCommodity = plantsLedgerEnabled
    ? accumulatePlantsUnits(sectorData, turn, LEDGER_BASE_PRICES)
    : new Map<CommodityType, { produced: number; sold: number }>();

  // Tier-2 sphere-macro countries: last kernel tick's held contribution feeds every normal-turn global market, routed via primary-sphere rules so secondary ties cannot duplicate benefits.
  const macroApplied = await applySphereRoutedMacroContributions(db, global, turn);
  return {
    kind: "context" as const,
    context: {
      allCorporations,
      allStateBudgets,
      allStates,
      backgroundCountryIds,
      byState,
      commodityFixStage,
      commodityNominalPriceIndex,
      countries,
      db,
      demandTruncated,
      demographicsDemandEnabled,
      existingPrices,
      federalBudgets,
      fixStageCfg,
      fxByCurrency,
      fxRateForCountry,
      global,
      governmentSupplyCap,
      householdConsumptionEnabled,
      householdSupplyCap,
      LEDGER_BASE_PRICES,
      ledgerCommandEconomyEnabled,
      ledgerConfig,
      ledgerCurrentYear,
      ledgerEraUnitScale,
      macroApplied,
      nominalIndices,
      now,
      nudgeDocs,
      plantsLedgerEnabled,
      plantsUnitsByCommodity,
      presetState,
      producerPath,
      productionInputDemandByState,
      sectorData,
      sectorUnits,
      stateToCountry,
      turn,
      worldPreset,
      currencyByCorpId,
      allStateMetrics,
      demandCalibration,
      recentBonds,
      centralBankByCountry,
      activePreset,
      marketSystemMode,
      roadConditionByState,
      supplyByCorporation,
    },
  };
}
export type ProcessCommodityPriceTurnStageContext = Extract<
  Awaited<ReturnType<typeof prepareProcessCommodityPriceTurn>>,
  { kind: "context" }
>["context"];

export async function processCommodityPriceTurn(
  ...args: Parameters<typeof prepareProcessCommodityPriceTurn>
): Promise<CommodityPriceTurnResult> {
  const prepared = await prepareProcessCommodityPriceTurn(...args);
  return settleCommodityPrices(prepared.context);
}
