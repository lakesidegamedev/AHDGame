import { financialAusteritySpending } from "@/lib/livingConflict/rules/financialFiscal";
import {
  caProvincialServiceClaims,
  caProvincialGrantDistribution,
} from "@/lib/countries/ca/rules/provincialServices";
import type { RegionalProgramClaim } from "@/lib/governmentFinance/rules/regionalSettlement";
import type { AnyBulkWriteOperation, Db } from "mongodb";
import type {
  FederalBudget,
  StateBudget,
  EconomicGrowthFactors,
  FederalBudgetSnapshot,
  EnactedLaw,
  FiscalConsolidationRecord,
} from "@/lib/db/types/budget";
import type { LegislationType } from "@/lib/db/types/legislation";
import type { GameState } from "@/lib/db/types/gameState";
import type { State } from "@/lib/db/types/state";
import {
  calculateFederalRevenue,
  calculateStateRevenue,
  normalizeFederalTaxRates,
  normalizeStateTaxRates,
  loadLatestSourcedImportAggregates,
} from "./revenue";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import { calculateFederalSpending, calculateStateSpendingDetail } from "./spending";
import { applyLegacyTrustDelta } from "@/lib/sovereignDefault/sideEffects/trustHit";
import { processAnnualDebt, resolveDebtCeilingCrisis, getDebtThreshold } from "./debt";
import { raisedDebtCeiling } from "./rules/debtCeilingRaise";
import { loadSovereignCouponBooks } from "@/lib/bonds/sovereignCouponBook";
import { processFormulaGrants, updateStateGrantRevenue } from "./grants";
import { calculateCountryInflation } from "./inflation";
import {
  countryTurnTariffInflationExposure,
  loadTurnTariffInflationExposure,
} from "@/lib/tariffs/tariffInflationExposure";
import type { StateMetrics } from "@/lib/db/types/stateMetrics";
import { getNationalDocId, NATIONAL_SCOPE_IDS } from "@/lib/constants/nationalScope";
import { resolvePipelineGdpGrowth } from "@/lib/country/nationalGdpGrowth";
import { smoothNationalGdp } from "@/lib/metricEngine/gdpLevel";
import { GDP_SMOOTHING_INERTIA, smoothNationalGdpPerTurn } from "@/lib/metricEngine/priceLevel";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import {
  getSharedFiscalYearStartTurnInYear,
  getTurnInYear,
} from "@/lib/countrySystems/fiscalCalendar";
import { evaluateSovereignAuctionForCountry } from "@/lib/sovereignDefault/crisisDetection";
import { getRegisteredCountryIds } from "@/lib/country/registeredCountries";
import { applyAusterityCap } from "@/lib/sovereignDefault/austerity";
import { restructureForInterestSpiral } from "@/lib/sovereignDefault/interestSpiralRestructure";
import { getAllCountryAccess } from "@/lib/countryAccess";
import {
  applyFiscalStabilizer,
  emitFiscalConsolidationNews,
  loadRulingEconomicPositions,
} from "./fiscalStabilizer";
import { shouldRestructureForInterest } from "./rules/fiscalStabilizer";
import { backgroundBudgetDocuments, loadBackgroundBudgetSources } from "./backgroundBudget";
import {
  backgroundAnnualGdp,
  closeBackgroundFiscalYear,
} from "@/lib/world/macro/rules/backgroundBudget";
import type { MacroCountryState } from "@/lib/world/macro/types";
import { loadFxRatesByCurrency } from "@/lib/currency/corporationCapital";
import { ensureBudgetDraftForFiscalYear } from "@/lib/db/collections/ukBudgets";
import { resolveRegionalSpending } from "./rules/regionalSpending";
import { regionalLawClaims } from "./rules/regionalLawClaims";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import {
  distributeAnnualRegionalGrantPool,
  resolveAnnualRegionalGrantPool,
} from "@/lib/governmentFinance/grantTransfers";
import { withLawAdministration } from "@/lib/governmentFinance/lawAdministrationCatalog";
import type { ResetLawProgramDocument } from "@/lib/resetLegislation/program";
import { buildResetRegionalProgramClaims } from "@/lib/resetLegislation/rules/regionalClaims";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import { resetSystemVersionsForCountry } from "@/lib/resetVersions/rules";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import type { Document } from "mongodb";
import { statesCollection } from "@/lib/db/repositories/states";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";
import { legislationTypesCollection } from "@/lib/db/repositories/legislationTypes";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";
import { enactedLawsCollection } from "@/lib/db/repositories/enactedLaws";
import { federalBudgetSnapshotsCollection } from "@/lib/db/repositories/federalBudgetSnapshots";
import { macroCountriesCollection } from "@/lib/db/repositories/macroCountries";
import { resetLawProgramsCollection } from "@/lib/db/repositories/resetLawPrograms";
import type { ResetRegionalOpeningBoard } from "@/lib/resetFinance/rules/regionalOpeningBoard";
import { regionalOpeningServiceClaims } from "@/lib/resetFinance/rules/regionalServiceClaims";

// The current turn engine still processes fiscal-year rollover as one shared phase.
// Pulling the anchor from country-systems makes the rule source explicit now, while
// preserving existing behavior until a later wave teaches the engine divergent calendars.
export const FISCAL_YEAR_START_TURN_IN_YEAR = getSharedFiscalYearStartTurnInYear();

/**
 * Check if the current turn marks the end of a fiscal year.
 * Fiscal year ends at turn 39 (September) and new fiscal year starts at turn 40 (October).
 */
export function isFiscalYearEnd(currentTurn: number): boolean {
  return getTurnInYear(currentTurn) === FISCAL_YEAR_START_TURN_IN_YEAR;
}

/**
 * Calculate the fiscal year for a given calendar year and turn.
 * Federal fiscal year 2021 runs from October 2020 to September 2021.
 * So in October 2020 (turn 40), we're in FY2021.
 */
export function calculateFiscalYear(currentYear: number, currentTurn: number): number {
  const turnInYear = getTurnInYear(currentTurn);
  // If we're at or past the fiscal year start turn (October), fiscal year is currentYear + 1
  return turnInYear >= FISCAL_YEAR_START_TURN_IN_YEAR ? currentYear + 1 : currentYear;
}

function resolveBudgetCountryId(budget: Pick<FederalBudget, "_id" | "countryId">): CountryId {
  if (budget.countryId && budget.countryId in COUNTRY_CONFIGS) {
    return budget.countryId as CountryId;
  }
  if (budget._id === "federal") {
    return COUNTRY_CONFIGS.US.id;
  }
  if (String(budget._id) in COUNTRY_CONFIGS) {
    return String(budget._id) as CountryId;
  }
  return COUNTRY_CONFIGS.US.id;
}

/**
 * Process the annual fiscal year transition.
 * This recalculates all revenue, spending, debt, and grants for the new fiscal year.
 * Tax bases grow annually based on economic factors (GDP growth, wage growth, etc.)
 */
export async function processFiscalYear(
  db: Db,
  newFiscalYear: number,
  currentTurn: number
): Promise<void> {
  const federalBudgets = await federalBudgetCollection(db).find({}).toArray();
  if (federalBudgets.length === 0) {
    console.log("[FiscalYear] No federal budget found, skipping fiscal year processing");
    return;
  }

  const financeState = await gameStateCollection(db).findOne(
    { _id: "current" },
    {
      projection: {
        resetWorldId: 1,
        metricsSystemVersion: 1,
        legislationSystemVersion: 1,
        resetVersionSeeds: 1,
        preset: 1,
      },
    }
  );
  const usResetLegislationV2 =
    resetSystemVersionsForCountry(financeState, RESET_V2_READY, "US").legislation === "v2";
  const regionalLegislationTypes = await legislationTypesCollection(db)
    .find(
      {
        $or: [
          { countryScope: { $in: ["us", "uk", "jp", "ca"] } },
          // Legacy records without a countryScope are US laws throughout
          // the existing policy pipeline and receive administration
          // metadata from the same compatibility rule.
          { countryScope: { $exists: false } },
        ],
      },
      { projection: { _id: 1, name: 1, administration: 1, policyOptions: 1 } }
    )
    .toArray();
  const regionalLegislationTypeMap = new Map(
    withLawAdministration(regionalLegislationTypes).map((type) => [type._id, type])
  );

  // Open the UK's annual authoring window only in worlds with a UK ledger. The
  // helper is idempotent, so a retried fiscal turn cannot replace a saved draft.
  if (federalBudgets.some((budget) => countryHasFeature("ukLib", resolveBudgetCountryId(budget)))) {
    await ensureBudgetDraftForFiscalYear(db, newFiscalYear, new Date());
  }

  const [states, allStateMetrics] = await Promise.all([
    statesCollection(db).find({}).toArray(),
    macroMetricsCollection(db).find({}).toArray(),
  ]);
  const usResetRegionalPrograms =
    usResetLegislationV2 && financeState?.resetWorldId
      ? await resetLawProgramsCollection<ResetLawProgramDocument>(db)
          .find(
            { country: "US", scope: "regional", worldId: financeState.resetWorldId },
            {
              projection: {
                _id: 1,
                regionId: 1,
                familyId: 1,
                choice: 1,
                annualAgencyAllocation: 1,
              },
            }
          )
          .toArray()
      : [];
  const usResetProgramsByRegion = new Map<string, ResetLawProgramDocument[]>();
  // One world-scoped preload, never a lookup per region. Other presets retain their rules.
  const openingServices =
    usResetLegislationV2 && financeState?.preset === "2027-default"
      ? await resetRegionalOpeningBoardsCollection<ResetRegionalOpeningBoard>(db)
          .find(
            { countryId: "US", worldId: financeState.resetWorldId },
            {
              projection: {
                _id: 1,
                countryId: 1,
                worldId: 1,
                regionId: 1,
                sourceTurn: 1,
                annualSpending: 1,
                familyOwned: 1,
                otherExistingServices: 1,
                allocatedClaims: 1,
                estimateKind: 1,
                existingServicesByCategory: 1,
              },
            }
          )
          .toArray()
      : [];
  const openingServicesByRegion = new Map(openingServices.map((board) => [board.regionId, board]));
  for (const board of openingServices) regionalOpeningServiceClaims(board);
  if (
    usResetLegislationV2 &&
    financeState?.preset === "2027-default" &&
    states.some(
      (s) => countryHasFeature("usLib", s.countryId) && !openingServicesByRegion.has(String(s._id))
    )
  )
    throw new Error("US 2027 rollover requires current-world regional service baselines");
  for (const program of usResetRegionalPrograms) {
    if (!program.regionId) continue;
    const programs = usResetProgramsByRegion.get(program.regionId) ?? [];
    programs.push(program);
    usResetProgramsByRegion.set(program.regionId, programs);
  }
  const stateGdpGrowthMap = new Map(
    allStateMetrics
      .filter((m) => typeof m.economic?.gdpGrowth?.value === "number")
      .map((m) => [String(m._id), m.economic.gdpGrowth.value])
  );
  const processedBudgetIds = new Set<string>();
  const interestSpiralCountries = new Set<string>();
  // Background countries keep their spiral count in macro state, so the years
  // that tripped the restructuring travel with the country to the restructure call.
  const backgroundSpiralYears = new Map<string, number>();
  // Stabilizer state is written in one batch after the loop, never per country.
  const stabilizerWrites: AnyBulkWriteOperation<FederalBudget>[] = [];
  const consolidationNews: Array<{
    countryId: string;
    record: FiscalConsolidationRecord;
    gdp: number;
  }> = [];

  // Money wiring (interstate-logistics plan step 5, phase B): one flag check,
  // one FX table, one sourcingNetworkLoad read for the whole annual pass -
  // same hoist-once pattern as `refreshNationalBudgetRevenue`, never one read
  // per country in this per-budget loop.
  const [moneyWiringConfig, fxByCurrency, tariffExposureSnapshot, couponBooks] = await Promise.all([
    gameConfigCollection(db).findOne(
      { _id: "default" },
      { projection: { interstateMoneyWiringEnabled: 1, fiscalStabilizerEnabled: 1 } }
    ),
    loadFxRatesByCurrency(db),
    loadTurnTariffInflationExposure(db, currentTurn),
    // Debt interest is charged on the coupons the stock carries: one
    // projected read for the annual pass, never one per country.
    loadSovereignCouponBooks(db),
  ]);
  const moneyWiringEnabled = moneyWiringConfig?.interstateMoneyWiringEnabled === true;
  const fiscalStabilizerEnabled = moneyWiringConfig?.fiscalStabilizerEnabled === true;
  const sourcedImportsByCountry = moneyWiringEnabled
    ? await loadLatestSourcedImportAggregates(db, currentTurn)
    : new Map<string, { tariffPaid: number; importValue: number }>();

  // A dissolved country's budget doc survives for history but must not run
  // fiscal years: with its bases and treasury merged into its successor, a
  // ghost rollover would recompute revenue over nothing, evaluate sovereign
  // auctions for a state that no longer exists, and write snapshots for it.
  const registeredCountries = new Set<string>(await getRegisteredCountryIds(db));

  // Fiscal stabilizer: AI-run countries enact a consolidation package at
  // fiscal close. Player countries are never touched.
  const countryAccess = await getAllCountryAccess(db);
  const nppGovernedCountries = new Set<string>(
    Object.entries(countryAccess)
      .filter(([, access]) => access.nppGoverned)
      .map(([id]) => id)
  );
  const rulingEconomicPositions = await loadRulingEconomicPositions(db, [...nppGovernedCountries]);
  // Background countries: budget derived from the macro economy, stabilizer
  // paid for by their own politics. Fiscal state is written back in one batch.
  const backgroundSources = await loadBackgroundBudgetSources(db);
  const backgroundFiscalWrites: AnyBulkWriteOperation<MacroCountryState>[] = [];

  for (const federalBudget of federalBudgets) {
    const budgetId = String(federalBudget._id);
    const countryId = resolveBudgetCountryId(federalBudget);
    if (!registeredCountries.has(countryId)) continue;
    const normalizedTaxRates = normalizeFederalTaxRates(federalBudget.taxRates);
    // The fiscal-year phase iterates every country's budget in one shared turn
    // step, so one malformed document must not abort rollover for the
    // rest of the world. Skip and surface the bad budget instead.
    if (!normalizedTaxRates || !federalBudget.debt) {
      console.warn(
        `[FiscalYear] Skipping ${countryId} budget ${budgetId} because required fiscal fields are missing`
      );
      continue;
    }
    const nationalDocId = getNationalDocId(countryId);
    const nationalMetrics = nationalDocId
      ? (allStateMetrics.find((metric) => String(metric._id) === nationalDocId) ?? null)
      : null;
    // Canonical national growth, not a flat 2.5: the no-metrics fallback
    // misrecorded +2.5% for contracting economies. `states` and
    // `allStateMetrics` are already loaded, so reuse them. The only live
    // consumer is `moneySupply/nppPolicy.ts` (NPP open-market decisions).
    const countryRegionGdp = new Map(
      states
        .filter((s) => s.countryId === countryId && !NATIONAL_SCOPE_IDS.has(String(s._id)))
        .map((s) => [String(s._id), s.gdp ?? 0])
    );
    const pipelineGdpGrowth = resolvePipelineGdpGrowth({
      nationalDocGrowth: nationalMetrics?.economic?.gdpGrowth?.value,
      regions: allStateMetrics
        .filter((m) => countryRegionGdp.has(String(m._id)))
        .map((m) => ({
          growth: m.economic?.gdpGrowth?.value,
          gdp: countryRegionGdp.get(String(m._id)) ?? 0,
        })),
    });

    const economicFactors = federalBudget.economicFactors || {
      gdpGrowth: pipelineGdpGrowth,
      wageGrowth: 3.0,
      inflationRate: 2.5,
      tradeGrowth: 2.0,
      lastUpdated: new Date(),
    };
    economicFactors.gdpGrowth = pipelineGdpGrowth;

    const newInflation = await calculateCountryInflation(
      db,
      countryId,
      federalBudget,
      0,
      0,
      0,
      0,
      undefined,
      undefined,
      countryTurnTariffInflationExposure(tariffExposureSnapshot, countryId).tariffRate
    );
    economicFactors.inflationRate = newInflation;

    const newTaxBases = federalBudget.taxBases;
    const background = backgroundSources.get(countryId) ?? null;
    const backgroundGdp = background
      ? backgroundAnnualGdp(background.fiscal, background.output)
      : null;
    let newGdp = backgroundGdp ?? (federalBudget.gdp || 27_000_000_000_000);
    // EMA-smoothed national GDP for the debt-to-GDP ratio (design §5.4) — dampens
    // year-over-year GDP swings so they can't trip a sovereign-default threshold.
    let newGdpSmoothed = smoothNationalGdp(
      federalBudget.gdpSmoothed,
      newGdp,
      GDP_SMOOTHING_INERTIA
    );
    if (federalBudget.taxBases) {
      // Base growth happens in the per-turn fiscalBaseGrowth phase; growing here
      // would double-count. newTaxBases stays the current bases.
      // GDP derives from Σ regional state.gdp; fall back to annual compounding
      // only when states carry no SSOT gdp yet.
      const countryStateGdpMillions = states
        .filter((s) => s.countryId === countryId && !NATIONAL_SCOPE_IDS.has(String(s._id)))
        .reduce((sum, s) => sum + (s.gdp || 0), 0);
      newGdp =
        backgroundGdp ??
        (countryStateGdpMillions > 0
          ? countryStateGdpMillions * 1_000_000
          : newGdp * (1 + economicFactors.gdpGrowth / 100));
      newGdpSmoothed = smoothNationalGdp(federalBudget.gdpSmoothed, newGdp, GDP_SMOOTHING_INERTIA);
      if (backgroundGdp === null && countryStateGdpMillions > 0) {
        // One basis for every budget GDP reader: the per-turn smoothed level the
        // metric engine keeps current, stepped once more from the live sum.
        newGdpSmoothed = smoothNationalGdpPerTurn(
          federalBudget.gdpSmoothed ?? federalBudget.gdp,
          newGdp,
          GDP_SMOOTHING_INERTIA,
          TURNS_PER_YEAR
        );
        newGdp = newGdpSmoothed;
      }

      await federalBudgetCollection(db).updateOne(
        { _id: federalBudget._id },
        {
          $set: {
            taxBases: newTaxBases,
            gdp: newGdp,
            gdpSmoothed: newGdpSmoothed,
            "economicFactors.gdpGrowth": pipelineGdpGrowth,
            "economicFactors.inflationRate": newInflation,
            "economicFactors.lastUpdated": new Date(),
          },
        }
      );

      console.log(
        `[FiscalYear] ${countryId} annual reconciliation: GDP ${economicFactors.gdpGrowth}%, ` +
          `inflation ${economicFactors.inflationRate}% (tax bases grow per-turn via fiscalBaseGrowth)`
      );
    }

    const sourcedAgg = sourcedImportsByCountry.get(countryId);
    // A background budget is derived after the debt pass below; skip pricing
    // its laws and tax bases here.
    const backgroundOpening =
      background && backgroundGdp !== null ? backgroundBudgetDocuments(background, 0) : null;
    let federalRevenue = backgroundOpening
      ? backgroundOpening.revenue
      : await calculateFederalRevenue(
          db,
          normalizedTaxRates,
          budgetId,
          undefined,
          undefined,
          undefined,
          fxByCurrency,
          sourcedAgg
            ? { tariffPaidAnchor: sourcedAgg.tariffPaid, importValueAnchor: sourcedAgg.importValue }
            : undefined
        );

    // Formula-grant programs (Medicaid, Highway Trust Fund, Education Block,
    // SNAP) are US-only — running them for UK/JP/DE wedges 27% of national
    // revenue into a phantom "Westminster Funding"/"Local Allocation Tax"
    // line that doesn't actually reach the country's regional pools. Other
    // countries route central-to-regional grants through their own enacted
    // legislation (uk_local_government_funding, jp_local_allocation_tax),
    // which is folded into spending.stateGrants by calculateFederalSpending
    // via the isGrant flag on enacted laws.
    const isUS = countryId === COUNTRY_CONFIGS.US.id;
    const formulaGrantDistribution = isUS
      ? await processFormulaGrants(db, federalRevenue.total, countryId)
      : caProvincialGrantDistribution(
          countryId,
          financeState?.preset,
          states
            .filter((state) => state.countryId === countryId)
            .map((state) => ({ id: String(state._id), gdp: state.gdp ?? 0 }))
        );
    const departmentGrant = isUS
      ? resolveAnnualRegionalGrantPool({
          accounts: federalBudget.departmentAccounts ?? {},
          currentTurn,
        })
      : { hasProgram: false, annualPool: 0 };
    const departmentGrantDistribution = departmentGrant.hasProgram
      ? distributeAnnualRegionalGrantPool(
          departmentGrant.annualPool,
          states
            .filter(
              (state) => state.countryId === countryId && !NATIONAL_SCOPE_IDS.has(String(state._id))
            )
            .map((state) => ({ id: String(state._id), population: state.population ?? 0 }))
        )
      : {};
    const grantStateIds = new Set([
      ...Object.keys(formulaGrantDistribution),
      ...Object.keys(departmentGrantDistribution),
    ]);
    const grantDistribution = Object.fromEntries(
      [...grantStateIds].map((stateId) => [
        stateId,
        (formulaGrantDistribution[stateId] ?? 0) + (departmentGrantDistribution[stateId] ?? 0),
      ])
    );

    if (Object.keys(grantDistribution).length > 0) {
      for (const [stateId, grantAmount] of Object.entries(grantDistribution)) {
        await updateStateGrantRevenue(db, stateId, countryId, grantAmount);
      }
    }

    // Debt-to-GDP uses the SMOOTHED national GDP (not the raw Σ) — default-stability guard.
    const debtResult = await processAnnualDebt(
      db,
      federalBudget,
      newGdpSmoothed,
      couponBooks.get(countryId) ?? null
    );
    let federalSpending = backgroundOpening
      ? backgroundOpening.spending
      : await calculateFederalSpending(
          db,
          {
            ...federalBudget,
            revenue: federalRevenue,
            gdp: newGdp,
          },
          debtResult.interestPayment
        );

    // Background country: close its derived budget instead. The stabilizer
    // plans against the macro budget and its approval cost is charged by the
    // country's politics on the next kernel tick.
    let backgroundPackage: FiscalConsolidationRecord | null = null;
    if (background && backgroundGdp !== null) {
      const closed = closeBackgroundFiscalYear({
        fiscal: background.fiscal,
        gdp: newGdp,
        fiscalCapacity: background.fiscalCapacity,
        debtInterest: debtResult.interestPayment,
        debtToGdpRatio: debtResult.debtToGdpRatio,
        debtThreshold: getDebtThreshold(
          debtResult.debtToGdpRatio,
          federalBudget.sovereignRiskAnchor
        ),
        governmentEconomicPosition: background.governmentEconomicPosition,
        fiscalYear: newFiscalYear,
        turn: currentTurn,
        consolidate:
          fiscalStabilizerEnabled &&
          (federalBudget.financialCrisisAusterityUntilTurn ?? -1) < currentTurn &&
          !federalBudget.imfSovereignBailoutActive,
      });
      const derived = backgroundBudgetDocuments(
        background,
        debtResult.interestPayment,
        closed.fiscal
      );
      if (derived) {
        federalRevenue = derived.revenue;
        federalSpending = derived.spending;
      }
      backgroundFiscalWrites.push({
        updateOne: {
          filter: {
            entityId: countryId,
            simulationTier: "background-macro",
            "dataQuality.provenance": "authored-2027",
          },
          update: { $set: { nationalFiscal: closed.fiscal } },
        },
      });
      if (fiscalStabilizerEnabled && closed.restructure) {
        interestSpiralCountries.add(countryId);
        backgroundSpiralYears.set(countryId, closed.interestSpiralYears);
      }
      if (closed.package) {
        backgroundPackage = {
          fiscalYear: newFiscalYear,
          appliedTurn: currentTurn,
          primaryBalanceGdpShare: closed.package.primaryBalanceGdpShare,
          targetPrimaryBalanceGdpShare: closed.package.targetPrimaryBalanceGdpShare,
          size: closed.package.size,
          sizeGdpShare: closed.package.sizeGdpShare,
          plannedTaxShare: closed.package.plannedTaxShare,
          taxRise: closed.package.taxRise,
          spendingCut: closed.package.spendingCut,
          unfunded: closed.package.unfunded,
          categoryCuts: closed.package.categoryCuts,
          taxRateTargets: closed.package.taxRateTargets,
          approvalCost: closed.package.approvalCost,
        };
      }
    }

    if (Object.keys(formulaGrantDistribution).length > 0) {
      // Book the annual US formula or Canadian modeled pool with its regional receipts.
      // Department-delivered grants remain charged through their enacted category.
      const totalStateGrants = Object.values(formulaGrantDistribution).reduce((a, b) => a + b, 0);
      federalSpending.total += totalStateGrants - federalSpending.stateGrants;
      federalSpending.stateGrants = totalStateGrants;
    }

    const surplus = federalRevenue.total - federalSpending.total;

    let finalSpending = federalSpending;
    let finalSurplus = surplus;
    if ((federalBudget.financialCrisisAusterityUntilTurn ?? -1) >= currentTurn) {
      finalSpending = financialAusteritySpending(federalSpending, federalRevenue.total);
      finalSurplus = federalRevenue.total - finalSpending.total;
    } else if (federalBudget.imfSovereignBailoutActive) {
      const austerity = applyAusterityCap(
        {
          byCategory: federalSpending.byCategory ?? {},
          stateGrants: federalSpending.stateGrants ?? 0,
          debtInterest: federalSpending.debtInterest ?? 0,
          total: federalSpending.total,
        },
        federalRevenue.total
      );
      finalSpending = {
        byCategory: austerity.scaledByCategory,
        stateGrants: austerity.scaledStateGrants,
        debtInterest: austerity.scaledDebtInterest,
        total: austerity.scaledTotal,
      };
      finalSurplus = federalRevenue.total - austerity.scaledTotal;
      if (austerity.scaleFactor < 1) {
        console.log(
          `[FiscalYear] ${countryId} austerity cap applied: factor ${austerity.scaleFactor.toFixed(3)} ` +
            `(spending $${(federalSpending.total / 1e9).toFixed(1)}B → $${(austerity.scaledTotal / 1e9).toFixed(1)}B)`
        );
      }
    }

    // Crisis austerity already forces the budget toward balance; the stabilizer
    // runs only for AI-run countries outside it, and is cleared once players
    // run the country so their budget is exactly what their laws price.
    const financialAusterityActive =
      (federalBudget.financialCrisisAusterityUntilTurn ?? -1) >= currentTurn;
    let stabilizerSet: Record<string, unknown> = {};
    let consolidationPackage: FiscalConsolidationRecord | null = backgroundPackage;
    const stabilizerUnset: Record<string, ""> = {};
    if (background) {
      // Handled above against the derived budget.
    } else if (!fiscalStabilizerEnabled) {
      // Switched off: no package, no restructuring, stored state left as is.
    } else if (nppGovernedCountries.has(countryId)) {
      const stabilized = applyFiscalStabilizer({
        budget: federalBudget,
        revenue: federalRevenue,
        spending: finalSpending,
        gdp: newGdp,
        debtToGdpRatio: debtResult.debtToGdpRatio,
        rulingEconomicPosition: rulingEconomicPositions.get(countryId) ?? null,
        fiscalYear: newFiscalYear,
        currentTurn,
        consolidate: !financialAusterityActive && !federalBudget.imfSovereignBailoutActive,
      });
      finalSpending = stabilized.spending;
      finalSurplus = federalRevenue.total - finalSpending.total;
      stabilizerSet = stabilized.set;
      consolidationPackage = stabilized.package;
      if (shouldRestructureForInterest(stabilized.interestSpiralYears)) {
        interestSpiralCountries.add(countryId);
      }
    } else if (federalBudget.fiscalConsolidation) {
      stabilizerUnset.fiscalConsolidation = "";
    }

    // The legislature raises the statutory ceiling as the stock nears it; no law
    // does, so the stored limit would otherwise only ever be breached.
    const raisedCeiling = raisedDebtCeiling({
      principal: debtResult.newPrincipal,
      ceiling: federalBudget.debt.ceiling,
    });

    // `debt.principal` is owned by the bond ledger (bonds/sovereignPrincipal.ts);
    // never re-derive it from the balance here, or same-turn issuance/maturity is
    // clobbered. Rate/ratio/rating below refresh off the bond-owned stock.
    await federalBudgetCollection(db).updateOne(
      { _id: federalBudget._id },
      {
        $set: {
          fiscalYear: newFiscalYear,
          taxRates: normalizedTaxRates,
          revenue: federalRevenue,
          spending: finalSpending,
          ...((federalBudget.financialCrisisAusterityUntilTurn ?? -1) >= currentTurn
            ? { financialCrisisAusterityBaseSpending: federalSpending }
            : {}),
          "debt.interestRate": debtResult.interestRate,
          ...(raisedCeiling !== null
            ? { "debt.ceiling": raisedCeiling, "debt.ceilingLastRaisedYear": newFiscalYear }
            : {}),
          debtToGdpRatio: debtResult.debtToGdpRatio,
          creditRating: debtResult.creditRating,
          surplus: finalSurplus,
          updatedAt: new Date(),
        },
      }
    );
    if (Object.keys(stabilizerSet).length > 0 || Object.keys(stabilizerUnset).length > 0) {
      stabilizerWrites.push({
        updateOne: {
          filter: { _id: federalBudget._id },
          update: {
            ...(Object.keys(stabilizerSet).length > 0 ? { $set: stabilizerSet } : {}),
            ...(Object.keys(stabilizerUnset).length > 0 ? { $unset: stabilizerUnset } : {}),
          },
        },
      });
    }
    if (consolidationPackage) {
      consolidationNews.push({ countryId, record: consolidationPackage, gdp: newGdp });
    }

    console.log(
      `[FiscalYear] ${countryId} FY${newFiscalYear} processed: Revenue $${(federalRevenue.total / 1e9).toFixed(1)}B, ` +
        `Spending $${(finalSpending.total / 1e9).toFixed(1)}B, ` +
        `${finalSurplus >= 0 ? "Surplus" : "Deficit"} $${(Math.abs(finalSurplus) / 1e9).toFixed(1)}B, ` +
        `Debt/GDP ${(debtResult.debtToGdpRatio * 100).toFixed(1)}% (${debtResult.creditRating})`
    );

    if (countryId === COUNTRY_CONFIGS.US.id && raisedCeiling !== null) {
      // Any breach is cured by the raise above, which is the resolution the
      // crisis flag was waiting for (nothing else ever cleared it).
      await resolveDebtCeilingCrisis(db);
      console.log(`[FiscalYear] US debt ceiling raised to ${raisedCeiling} for FY${newFiscalYear}`);
    }

    // Background countries run no regional budgets.
    const countryStates = background ? [] : states.filter((state) => state.countryId === countryId);
    for (const state of countryStates) {
      const stateId = String(state._id);
      const stateGrantAmount = grantDistribution[stateId] || 0;
      const stateGdpGrowth = stateGdpGrowthMap.get(stateId) ?? economicFactors.gdpGrowth;
      const stateFactors = { ...economicFactors, gdpGrowth: stateGdpGrowth };
      await processStateFiscalYear(
        db,
        stateId,
        countryId,
        newFiscalYear,
        stateGrantAmount,
        stateFactors,
        state.gdp,
        currentTurn,
        countryId === COUNTRY_CONFIGS.US.id,
        regionalLegislationTypeMap,
        countryId === COUNTRY_CONFIGS.US.id ? (usResetProgramsByRegion.get(stateId) ?? []) : [],
        countryId === COUNTRY_CONFIGS.US.id ? openingServicesByRegion.get(stateId) : undefined,
        caProvincialServiceClaims(countryId, financeState?.preset, stateId)
      );
    }

    const threshold = getDebtThreshold(
      debtResult.debtToGdpRatio,
      federalBudget.sovereignRiskAnchor
    );
    if (threshold.gdpPenalty > 0 || threshold.trustPenalty > 0) {
      await applyDebtPenalties(db, countryId, threshold.gdpPenalty, threshold.trustPenalty);
      if (threshold.gdpPenalty > 0) {
        console.log(
          `[FiscalYear] ${countryId} applied GDP penalty: -${threshold.gdpPenalty}% growth`
        );
      }
      if (threshold.trustPenalty > 0) {
        console.log(
          `[FiscalYear] ${countryId} applied public trust penalty: -${threshold.trustPenalty}`
        );
      }
    }

    processedBudgetIds.add(budgetId);
  }

  if (stabilizerWrites.length > 0) {
    await federalBudgetCollection(db).bulkWrite(stabilizerWrites);
  }
  if (backgroundFiscalWrites.length > 0) {
    await macroCountriesCollection<MacroCountryState>(db).bulkWrite(backgroundFiscalWrites);
  }
  for (const { countryId, record, gdp } of consolidationNews) {
    try {
      await emitFiscalConsolidationNews(db, countryId, record, gdp);
    } catch (err) {
      console.error(`[FiscalYear] Consolidation news failed for ${countryId}:`, err);
    }
  }

  try {
    const allBudgets = await federalBudgetCollection(db).find({}).toArray();
    for (const budget of allBudgets) {
      if (!processedBudgetIds.has(String(budget._id))) continue;
      const countryId = resolveBudgetCountryId(budget);
      await saveFiscalYearSnapshot(db, countryId, String(budget._id), newFiscalYear);
    }
  } catch (e) {
    console.error(`[FiscalYear] Failed to save budget snapshots for FY${newFiscalYear}:`, e);
  }

  // Sovereign auction outcome detection — runs once per processed country at
  // fiscal-year close. A single failure must not abort the rest of the loop.
  const realtimeMs = Date.now();
  for (const budgetIdProcessed of processedBudgetIds) {
    const matchingBudget = federalBudgets.find((b) => String(b._id) === budgetIdProcessed);
    if (!matchingBudget) continue;
    const countryId = resolveBudgetCountryId(matchingBudget);
    try {
      await evaluateSovereignAuctionForCountry(db, countryId, currentTurn, realtimeMs);
    } catch (err) {
      console.error(`[FiscalYear] Sovereign auction evaluation failed for ${countryId}:`, err);
    }
    // After the auction verdict, so a crisis the auctions fired keeps its own
    // resolution; this only fires one for a country still outside a crisis.
    if (interestSpiralCountries.has(countryId)) {
      try {
        await restructureForInterestSpiral(db, countryId, currentTurn, realtimeMs, {
          spiralYears: backgroundSpiralYears.get(countryId),
        });
      } catch (err) {
        console.error(`[FiscalYear] Interest-spiral restructuring failed for ${countryId}:`, err);
      }
    }
  }
}

/**
 * Process fiscal year for an individual state.
 * Applies economic growth to state tax bases before recalculating revenue.
 * GDP growth comes from the per-state realized-output pipeline.
 */
async function processStateFiscalYear(
  db: Db,
  stateId: string,
  countryId: CountryId,
  fiscalYear: number,
  federalGrants: number,
  stateEconomicFactors?: EconomicGrowthFactors,
  /** The region's current `state.gdp` in millions (the SSOT level the engine grew). */
  stateGdpMillions?: number,
  currentTurn = 0,
  regionalFinanceEnabled = false,
  legislationTypeMap: ReadonlyMap<string, LegislationType> = new Map(),
  resetPrograms: readonly ResetLawProgramDocument[] = [],
  openingServices?: ResetRegionalOpeningBoard,
  standingServices: readonly (RegionalProgramClaim & { category: string })[] = []
): Promise<void> {
  const stateBudget = await stateBudgetsCollection(db).findOne({ _id: stateId, countryId });
  if (!stateBudget) {
    // State budget doesn't exist yet, skip
    return;
  }

  const normalizedTaxRates = normalizeStateTaxRates(stateBudget.taxRates);
  // State budgets can briefly exist before their tax-rate payload is fully
  // seeded; skipping keeps one broken state from aborting the national
  // fiscal-year pass while still leaving a clear breadcrumb in the logs.
  if (!normalizedTaxRates) {
    console.warn(`[FiscalYear] Skipping state ${stateId} because taxRates are missing`);
    return;
  }

  // Apply economic growth to state tax bases (using per-state GDP growth)
  const economicFactors = stateEconomicFactors || {
    gdpGrowth: 2.5,
    wageGrowth: 3.0,
    inflationRate: 2.5,
    tradeGrowth: 2.0,
    lastUpdated: new Date(),
  };

  const newTaxBases = stateBudget.taxBases;
  let newStateGdp = stateBudget.stateGdp || 0;
  if (stateBudget.taxBases) {
    // stateGdp is a snapshot of `state.gdp × 1M` (SSOT, grown per turn by the
    // fiscalBaseGrowth phase). Fall back to annual compounding only when the
    // region carries no SSOT gdp yet.
    newStateGdp =
      stateGdpMillions && stateGdpMillions > 0
        ? stateGdpMillions * 1_000_000
        : newStateGdp * (1 + economicFactors.gdpGrowth / 100);

    // Update tax bases in DB before revenue calculation
    await stateBudgetsCollection(db).updateOne(
      { _id: stateId, countryId },
      {
        $set: {
          taxBases: newTaxBases,
          stateGdp: newStateGdp,
        },
      }
    );
  }

  // Calculate state revenue including federal grants (now using grown bases)
  const revenue = await calculateStateRevenue(
    db,
    stateId,
    countryId,
    normalizedTaxRates,
    federalGrants
  );

  // Calculate state spending based on enacted laws
  const spendingDetail = await calculateStateSpendingDetail(db, stateId, countryId, {
    ...stateBudget,
    revenue,
    stateGdp: newStateGdp,
  });
  const serviceClaims = [
    ...(openingServices ? regionalOpeningServiceClaims(openingServices) : []),
    ...standingServices,
  ];
  const previousIds = new Set(Object.keys(stateBudget.regionalProgramSettlements ?? {}));
  const result = resolveRegionalSpending({
    baseSpending: spendingDetail.spending,
    services: serviceClaims,
    laws: regionalLawClaims(spendingDetail.lawCosts, legislationTypeMap, previousIds),
    programs: buildResetRegionalProgramClaims({
      programs: resetPrograms,
      previousProgramIds: previousIds,
    }),
    revenue: revenue.total,
    cash: stateBudget.balance ?? 0,
    settle: regionalFinanceEnabled || resetPrograms.length > 0 || serviceClaims.length > 0,
  });
  const { spending, authorizedSpending } = result;
  const regionalSettlementEnabled = result.settlement !== undefined;
  const regionalProgramSettlements = result.settlement
    ? Object.fromEntries(
        result.settlement.programs.map((program) => [
          program.programId,
          {
            ...program,
            lastSettledTurn: currentTurn,
            validThroughTurn: currentTurn + TURNS_PER_YEAR - 1,
          },
        ])
      )
    : stateBudget.regionalProgramSettlements;

  // Calculate surplus/deficit
  const surplus = revenue.total - spending.total;

  // Update balance (accumulated surplus/deficit over time)
  const newBalance = (stateBudget.balance ?? 0) + surplus;

  await stateBudgetsCollection(db).updateOne(
    { _id: stateId, countryId },
    {
      $set: {
        fiscalYear,
        taxRates: normalizedTaxRates,
        revenue,
        spending,
        ...(regionalSettlementEnabled ? { authorizedSpending, regionalProgramSettlements } : {}),
        surplus,
        balance: newBalance,
        updatedAt: new Date(),
      },
    }
  );
}

/**
 * Apply economic penalties due to high debt levels.
 *
 * GDP growth is NOT directly mutated here — debt already reduces sector
 * profitability via the debtToGdpMod margin modifier in sectorCalculations.ts,
 * which naturally lowers revenue growth and thus GDP growth through the
 * realized-output pipeline. Directly $inc-ing gdpGrowth was double-counting.
 *
 * Public trust is still directly penalized as it has no indirect mechanism.
 */
async function applyDebtPenalties(
  db: Db,
  countryId: CountryId,
  gdpPenalty: number,
  trustPenalty: number
): Promise<void> {
  if (gdpPenalty > 0) {
    console.log(
      `[FiscalYear] Debt GDP penalty: ${gdpPenalty}% (applied via sector margin modifier, not direct metric mutation)`
    );
  }

  if (trustPenalty > 0) {
    // Debt→trust lands on the political BOARD via the same events channel as
    // the sovereign-default hit, not a legacy path.
    await applyLegacyTrustDelta(db, countryId, -trustPenalty);
  }
}

/**
 * Create a frozen snapshot of a country's federal budget at a fiscal year boundary.
 * Captures the complete budget state, state grants, and active enacted laws.
 * Uses upsert so cron retries overwrite rather than duplicate.
 */
export async function saveFiscalYearSnapshot(
  db: Db,
  countryId: string,
  budgetDocId: string,
  fiscalYear: number,
  preloaded?: { budget?: FederalBudget | null; currentTurn?: number }
): Promise<void> {
  // `preloaded` exists for callers that already hold these — the bootstrap
  // snapshot loop reads every budget in one find and the turn is the same
  // singleton for all of them, so both reads below were pure repetition there.
  // Omitted by the fiscal-year rollover caller, which fetches as before.
  const budget =
    preloaded?.budget ?? (await federalBudgetCollection(db).findOne({ _id: budgetDocId }));
  if (!budget) return;

  let turn = preloaded?.currentTurn;
  if (turn === undefined) {
    const gameState = await gameStateCollection<Document>(db).findOne(
      { _id: "current" } as Record<string, unknown>,
      { projection: { currentTurn: 1 } }
    );
    turn = (gameState as { currentTurn?: number } | null)?.currentTurn ?? 0;
  }

  // Active national-scope enacted laws (not repealed)
  const lawQuery: Record<string, unknown> = {
    scope: "national",
    repealedAt: { $exists: false },
  };
  if (countryId === COUNTRY_CONFIGS.US.id) {
    lawQuery.$or = [{ countryId }, { countryId: { $exists: false } }];
  } else {
    lawQuery.countryId = countryId;
  }
  const laws = await enactedLawsCollection(db).find(lawQuery).toArray();

  // State grants breakdown
  const [states, stateBudgets] = await Promise.all([
    statesCollection(db)
      .find({ countryId } as Record<string, unknown>)
      .toArray(),
    // Scope the budget fetch to the same country so a cross-country state-ID
    // collision (e.g. CN HB / DE HB) can't surface the wrong budget below.
    stateBudgetsCollection(db)
      .find({ countryId } as Record<string, unknown>)
      .toArray(),
  ]);
  const stateGrants = states
    .map((s) => {
      const sb = stateBudgets.find((b) => b.stateId === String(s._id));
      return {
        stateId: String(s._id),
        stateName: s.name,
        amount: sb?.revenue?.federalGrants ?? 0,
      };
    })
    .filter((g) => g.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const formatCostModel = (law: EnactedLaw): string => {
    if (law.gdpPerCapitaMultiplier !== undefined)
      return `${(law.gdpPerCapitaMultiplier * 100).toFixed(2)}% of GDP`;
    if (law.annualCostPerCapita !== undefined)
      return `$${law.annualCostPerCapita.toLocaleString()}/person`;
    if (law.annualCostUsd !== undefined) {
      const abs = Math.abs(law.annualCostUsd);
      if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(2)}B`;
      if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
      return `$${abs.toLocaleString()}`;
    }
    if (law.budgetCost !== 0) return `${law.budgetCost.toFixed(1)}% of budget`;
    return "No direct fiscal cost";
  };

  const snapshot: FederalBudgetSnapshot = {
    _id: `${countryId}:FY${fiscalYear}`,
    countryId,
    fiscalYear,
    turn,
    budget: {
      revenue: budget.revenue,
      taxRates: budget.taxRates,
      taxBases: budget.taxBases,
      spending: budget.spending,
      debt: budget.debt,
      economicFactors: budget.economicFactors,
      surplus: budget.surplus,
      gdp: budget.gdp,
      debtToGdpRatio: budget.debtToGdpRatio,
      creditRating: budget.creditRating,
      // Freeze currency at snapshot time — every money field in `budget` is
      // denominated in this code (v0.2.6). Historical viewers pair each
      // snapshot with its own code rather than relying on live country config.
      currencyCode: budget.currencyCode,
    },
    stateGrants,
    enactedLaws: laws.map((law) => ({
      title: law.title,
      budgetCategory: law.budgetCategory,
      costModel: formatCostModel(law),
      enactedYear: law.enactedYear,
    })),
    createdAt: new Date(),
  };

  await federalBudgetSnapshotsCollection(db).replaceOne({ _id: snapshot._id }, snapshot, {
    upsert: true,
  });

  console.log(`[FiscalYear] Snapshot saved: ${snapshot._id}`);
}

import { resetRegionalOpeningBoardsCollection } from "@/lib/db/repositories/resetRegionalOpeningBoards";
