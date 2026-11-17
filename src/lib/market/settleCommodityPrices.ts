import type { CommodityPriceTurnResult } from "@/lib/turn/commodityPriceTurn";
import { loadFinancialCrisisDemand } from "@/lib/livingConflict/financialDemand";

import type { CommodityPrice } from "@/lib/db/types";

import { COMMODITY_TYPES, type CommodityType } from "@/lib/constants/commodities";

import { plantsHouseholdUnitScale } from "@/lib/turn/householdConsumption";
import { stockCoverCapTurnsForStage } from "@/lib/market/commodityFixStages";
import { normalizeMarketRecoveryStage } from "@/lib/market/marketRecoveryStages";

import { STOCK_COVER_CAP_TURNS } from "@/lib/market/inventory";

import {
  fundedLedgers,
  withStatelessCountryDemand,
  type FundedLedgerRow,
} from "@/lib/market/producerMarket/fundedLedgerRules";
import {
  selectFundedReachableBooks,
  type FundedCountryBookRow,
} from "@/lib/market/producerMarket/fundedBookRules";
import { clearAllCommodities } from "@/lib/trade/snapshot";
import { buildReachableBooks } from "@/lib/trade/reachableBook";
import {
  applyTradeConvergence,
  capClearingToSourcedTrade,
  tradeConvergenceK,
} from "@/lib/trade/convergence";
import { buildTradeAffinity } from "@/lib/trade/tradeAffinity";
import { loadActiveFtaPairs } from "@/lib/tariffs/ftaOverrides";
import { reconcileSignedEmbargoBills } from "@/lib/trade/reconcileEmbargoes";

import {
  addBackgroundBooksToCountries,
  backgroundCountryContributions,
  placeBackgroundBooksInStates,
} from "@/lib/world/macro/rules/countryBooks";

import { persistCommodityNominalIndex } from "@/lib/turn/commodityNominalIndexPersistence";

import {
  applyAdvertisingDemand,
  applyDemographicsUplift,
  applyHouseholdDemand,
  applyLatentFinancialDemand,
  applyRateSensitiveDemand,
  aggregateByCountry,
  applyGovernmentDemand,
  capHealthcareDemandToLocalSupply,
  globalDemandCapSupply,
  applyDemandCalibration,
  buildStatesByCountry,
  collectHouseholdSignals,
  sumHouseholdDemand,
} from "@/lib/turn/commodity/demandLegs";
import {
  buildNudgeMap,
  buildLaggedRatios,
  priceCommodity,
  type CommodityPricingContext,
} from "@/lib/turn/commodity/pricing";
import { buildBlocsByCountry, buildCurtainedCountries } from "@/lib/turn/commodity/tradeContext";
import { runFreightSettlementPhase } from "@/lib/turn/commodity/sourcingSettlement";
import {
  buildOwnFreightCapacity,
  buildOwnMarketSupply,
  buildOwnRoutes,
} from "@/lib/logistics/ownRoutes";
import { stateHops } from "@/lib/logistics/stateDistance";
import { ownRouteIdentity, resolveSupplyPolicies } from "@/lib/market/internalSupply/rules";
import { persistTurnOutputs } from "@/lib/turn/commodity/persistence";
import { loadBlockadeClosure } from "@/lib/turn/commodity/blockadeClosure";

import { getGameStateCollection } from "@/lib/db/collections/gameState";
import { TREATY_TRADE_DIRECTIVE_KEYS } from "@/lib/trade/rules/treatyTrade";

import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";

import { commodityPricesCollection } from "@/lib/db/repositories/commodityPrices";
import type { Document } from "mongodb";
import { organizationMembershipsCollection } from "@/lib/db/repositories/organizationMemberships";
import { tariffsCollection } from "@/lib/db/repositories/tariffs";
import { tradeEmbargoesCollection } from "@/lib/db/repositories/tradeEmbargoes";
import { organizationLegislationCollection } from "@/lib/db/repositories/organizationLegislation";
import { producerMarketOutcomesCollection } from "@/lib/db/repositories/producerMarketOutcomes";
import type { ProcessCommodityPriceTurnStageContext } from "@/lib/turn/commodityPriceTurn";

export async function settleCommodityPrices(
  context: ProcessCommodityPriceTurnStageContext
): Promise<CommodityPriceTurnResult> {
  // Background countries: their regions hold no sectors or modelled
  // households, so their book is their macro economy. The world total already
  // carries it; here the same units land in the country's own regions so the
  // national book, freight sourcing and trade clearing treat it as a buyer and
  // seller. State-built demand legs run over market states only, so these
  // regions and budgets are not counted twice.
  const marketStates =
    context.backgroundCountryIds.size === 0
      ? context.allStates
      : context.allStates.filter((state) => !context.backgroundCountryIds.has(state.countryId));
  const unplacedBackgroundBooks =
    context.backgroundCountryIds.size === 0
      ? []
      : placeBackgroundBooksInStates(
          backgroundCountryContributions(
            context.macroApplied.background,
            context.backgroundCountryIds
          ),
          buildStatesByCountry(
            context.allStates.filter((state) => context.backgroundCountryIds.has(state.countryId))
          ),
          context.byState
        );

  // ── Demand legs ───────────────────────────────────────────────────────
  applyAdvertisingDemand(
    {
      allCorporations: context.allCorporations,
      currencyByCorpId: context.currencyByCorpId,
      advertisingBasePrice: context.LEDGER_BASE_PRICES["advertising"],
    },
    context.global,
    context.byState
  );

  if (context.demographicsDemandEnabled) {
    applyDemographicsUplift(marketStates, context.global, context.byState);
  }

  const healthcareOtherDemandByState = new Map(
    [...context.byState].map(([stateId, balances]) => [
      stateId,
      balances.get("healthcare_services")?.demand ?? 0,
    ])
  );
  let householdFinalDemandByState = new Map<string, Map<CommodityType, number>>();
  if (context.householdConsumptionEnabled) {
    // Optional per-world sizing override (sandbox tuning without a redeploy).
    const pcCfg = await gameConfigCollection(context.db).findOne(
      { _id: "default" },
      { projection: { householdConsumptionPerCapita: 1 } }
    );
    const perCapitaOverride =
      typeof pcCfg?.householdConsumptionPerCapita === "number" &&
      pcCfg.householdConsumptionPerCapita > 0
        ? pcCfg.householdConsumptionPerCapita
        : undefined;
    const { metricsByState, priorGlobalPrice, priorGlobalSupply } = collectHouseholdSignals({
      allStateMetrics: context.allStateMetrics,
      existingPrices: context.existingPrices,
    });
    householdFinalDemandByState = applyHouseholdDemand(
      {
        eraUnitScale: context.ledgerEraUnitScale,
        supplyCapMultiple: context.householdSupplyCap,
        // Plants worlds: re-anchor household demand onto the physical unit basis
        // plants supply uses, clamped per commodity against prior supply. Legacy
        // worlds pass 1/undefined and are byte-identical (ticket #1027).
        plantsUnitScale: context.plantsLedgerEnabled
          ? plantsHouseholdUnitScale(context.worldPreset)
          : 1,
        priorGlobalSupply: context.plantsLedgerEnabled
          ? globalDemandCapSupply(priorGlobalSupply)
          : undefined,
        states: marketStates.map((s) => ({
          stateId: s._id,
          countryId: s.countryId,
          gdp: s.gdp ?? 0,
          population: s.population ?? 0,
        })),
        metricsByState,
        priorGlobalPrice,
        perCapita: perCapitaOverride,
        financialDemandByCountry: await loadFinancialCrisisDemand(
          context.db,
          context.turn,
          context.allCorporations,
          context.federalBudgets
        ),
        demandCalibration: context.demandCalibration,
      },
      context.global,
      context.byState,
      context.demandTruncated
    );
  }

  // Built once here: sovereign issuance allocation (latent financial leg) and
  // government regional distribution read the same country → state-GDP shares.
  const statesByCountry = buildStatesByCountry(marketStates);

  applyLatentFinancialDemand(
    {
      statesByCountry,
      allCorporations: context.allCorporations,
      recentBonds: context.recentBonds,
      centralBankByCountry: context.centralBankByCountry,
      // Bonds without a currency stamp predate multi-currency issuance and are in ₳.
      fxRateForBond: (bond) =>
        bond.currencyCode
          ? (context.fxByCurrency.get(bond.currencyCode) ??
            (bond.issuerType === "sovereign" ? (0, context.fxRateForCountry)(bond.countryId) : 1))
          : 1,
    },
    context.global,
    context.byState
  );

  applyRateSensitiveDemand(
    {
      allStateBudgets:
        context.backgroundCountryIds.size === 0
          ? context.allStateBudgets
          : context.allStateBudgets.filter(
              (budget) =>
                !context.backgroundCountryIds.has(context.stateToCountry.get(budget.stateId) ?? "")
            ),
      stateToCountry: context.stateToCountry,
      fxRateForCountry: context.fxRateForCountry,
      centralBankByCountry: context.centralBankByCountry,
      ledgerBasePrices: context.LEDGER_BASE_PRICES,
    },
    context.global,
    context.byState
  );

  // ── National (country-aggregate) commodity balances ───────────────────
  // Sector-allocated S/D (including advertising, latent financial). Healthcare
  // govt demand is applied after this block so it can be attributed per country.
  const byCountry = aggregateByCountry(context.byState, context.stateToCountry);
  addBackgroundBooksToCountries(unplacedBackgroundBooks, byCountry);

  // ── Government spending → commodity demand ────────────────────────────
  applyGovernmentDemand(
    {
      federalBudgets:
        context.backgroundCountryIds.size === 0
          ? context.federalBudgets
          : context.federalBudgets.filter(
              (budget) => !context.backgroundCountryIds.has(budget.countryId)
            ),
      supplyCapMultiple: context.governmentSupplyCap,
      ledgerBasePrices: context.LEDGER_BASE_PRICES,
      fxRateForCountry: context.fxRateForCountry,
      ledgerCurrentYear: context.ledgerCurrentYear,
      ledgerCommandEconomyEnabled: context.ledgerCommandEconomyEnabled,
      statesByCountry,
      stateToCountry: context.stateToCountry,
      // Healthcare is capped below against the same state supply the clearing pre-pass reads.
      // Other commodities retain their prior-world-supply ceiling.
      priorGlobalSupply: context.plantsLedgerEnabled
        ? globalDemandCapSupply(
            new Map(
              context.existingPrices
                .filter((p) => typeof p.globalSupply === "number")
                .map((p) => [p.commodity as CommodityType, p.globalSupply as number])
            )
          )
        : undefined,
      householdDemand: sumHouseholdDemand(householdFinalDemandByState),
      demandCalibration: context.demandCalibration,
    },
    context.global,
    byCountry,
    context.byState,
    context.demandTruncated
  );

  if (context.plantsLedgerEnabled) {
    capHealthcareDemandToLocalSupply({
      global: context.global,
      byCountry,
      byState: context.byState,
      stateToCountry: context.stateToCountry,
      householdDemandByState: householdFinalDemandByState,
      otherDemandByState: healthcareOtherDemandByState,
      truncated: context.demandTruncated,
      demandCalibration: context.demandCalibration,
      supplyCapMultiple: context.governmentSupplyCap,
    });
  }

  // ── Era-aware demand calibration ──────────────────────────────────────
  // Applied once, after the last demand generator and BEFORE freight sourcing,
  // trade clearing and the reachable books, so every downstream book carries
  // the same corrected figure. Calibration must precede book construction or
  // the books quote demand 1/m too high for every calibrated commodity.
  applyDemandCalibration(
    { activePreset: context.activePreset },
    context.global,
    byCountry,
    context.byState
  );

  // ── Inter-country trade clearing + whole-market dampened convergence ──
  // (Ordering and influence-lever notes live with the original; the WTO/FTA /
  // embargo loads stay here, separate from the main parallel block to keep the
  // positional test fetches stable.)
  // Replay signed durable-embargo bills into legislation-origin embargo records
  // before reading them (mirrors tariff-bill reconcile). Minister embargoes are
  // untouched.
  await reconcileSignedEmbargoBills(context.db, context.turn);
  const [ftaPairs, orgMembershipDocs, tariffDocs, embargoDocs, treatyTermDocs] = await Promise.all([
    loadActiveFtaPairs(context.db),
    organizationMembershipsCollection(context.db)
      .find({}, { projection: { countryId: 1, organizationId: 1 } })
      .toArray(),
    tariffsCollection(context.db).find({}).toArray(),
    tradeEmbargoesCollection(context.db)
      .find({ $or: [{ expiresTurn: { $exists: false } }, { expiresTurn: { $gte: context.turn } }] })
      .toArray(),
    organizationLegislationCollection<{ directiveKey?: string }>(context.db)
      .find(
        {
          type: "directive",
          status: "active",
          directiveKey: { $in: Object.keys(TREATY_TRADE_DIRECTIVE_KEYS) },
        } as never,
        { projection: { directiveKey: 1 } }
      )
      .toArray(),
  ]);
  const activeTreaties = new Set(
    treatyTermDocs.flatMap((d) => {
      const org = d.directiveKey ? TREATY_TRADE_DIRECTIVE_KEYS[d.directiveKey] : undefined;
      return org ? [org] : [];
    })
  );
  const blocsByCountry = buildBlocsByCountry(orgMembershipDocs);
  const curtainedCountries = buildCurtainedCountries(
    context.ledgerCurrentYear,
    context.ledgerCommandEconomyEnabled
  );
  // Naval blockade pressure, read fresh rather than from persisted navair state.
  //
  // `commodityPrices` runs EARLIER in the turn than `navairOperations`, so reading the
  // persisted channels here would silently use last turn's dispositions: a blockade
  // would take a turn to bite and nothing in the output would say so. The read is one
  // indexed query (militaryUnits_domain) and returns an empty map whenever nobody is
  // blockading anybody, which is the common case.
  const blockadeClosure = await loadBlockadeClosure(context.db);

  const { affinityFor, capUnitsFor, importCostMultiplierFor } = buildTradeAffinity({
    ftaPairs,
    blocsByCountry,
    tariffs: tariffDocs,
    embargoes: embargoDocs,
    curtainedCountries,
    blockadeClosure,
    activeTreaties,
  });

  // Build existing price map early: the sourcing pass uses LAST turn's stored
  // prices as fixed asks, and the drift baseline below reuses the same map.
  const existingPriceMap = new Map<string, CommodityPrice>(
    context.existingPrices.map((p) => [p.commodity, p])
  );

  // The market ledger merges buyers by state and commodity. Keep modeled
  // household and sector-input intent alongside it so the sourcing seam can
  // allocate accepted purchases proportionally; all remaining demand stays
  // explicitly in the residual "other" cohort.
  const demandUsesByState = new Map<
    string,
    Map<CommodityType, { householdFinal: number; productionInput: number }>
  >();
  for (const stateId of context.byState.keys()) {
    const byCommodity = new Map<
      CommodityType,
      { householdFinal: number; productionInput: number }
    >();
    for (const commodity of COMMODITY_TYPES) {
      byCommodity.set(commodity, {
        householdFinal: householdFinalDemandByState.get(stateId)?.get(commodity) ?? 0,
        productionInput: context.productionInputDemandByState.get(stateId)?.get(commodity) ?? 0,
      });
    }
    demandUsesByState.set(stateId, byCommodity);
  }

  const ownRouteSectors = context.sectorData
    .filter((s) => !!s.corporationId && !!s.sectorId && !!s.stateId)
    .map((s) => ({
      sectorId: s.sectorId,
      corporationId: s.corporationId!.toString(),
      stateId: s.stateId,
    }));
  const ownRoutePolicies = resolveSupplyPolicies(
    context.allCorporations.map((c) => ({
      id: c._id.toString(),
      totalShares: c.totalShares,
      holders: (c.shareholders ?? []).map((h) => ({
        corporationId: h.corporationId?.toString(),
        shares: h.shares,
      })),
      policy: c.internalSupplyPolicy,
    }))
  );
  const ownRoutes = buildOwnRoutes({
    sectors: ownRouteSectors,
    supplyBySector: context.sectorUnits.supplyBySector,
    inputDemandBySector: context.sectorUnits.inputDemandBySector,
    policies: ownRoutePolicies,
    stateToCountry: context.stateToCountry,
    hops: stateHops,
  });
  const ownFreightCapacityByState = buildOwnFreightCapacity({
    sectors: ownRouteSectors,
    supplyBySector: context.sectorUnits.supplyBySector,
    policies: ownRoutePolicies,
  });

  // ── Landed-price freight settlement ─────────────────────────────────────
  const { freightSettlement, freightRampFraction } = await runFreightSettlementPhase(
    context.db,
    {
      worldEpoch: context.presetState?.worldEpochId,
      marketSystemMode: context.marketSystemMode,
      allStates: context.allStates,
      stateToCountry: context.stateToCountry,
      roadConditionByState: context.roadConditionByState,
      existingPriceMap,
      ledgerBasePrices: context.LEDGER_BASE_PRICES,
      ledgerEraUnitScale: context.ledgerEraUnitScale,
      tariffDocs,
      ftaPairs,
      affinityFor,
      demandUsesByState,
      ownRoutes,
      ownFreightCapacityByState,
      ownFreightMarketSupply: buildOwnMarketSupply({
        sectors: ownRouteSectors,
        supplyBySector: context.sectorUnits.supplyBySector,
        policies: ownRoutePolicies,
      }),
    },
    context.turn,
    context.now,
    context.global,
    context.byState,
    byCountry
  );

  const tradeClearing = clearAllCommodities(
    context.countries,
    byCountry,
    affinityFor,
    capUnitsFor,
    importCostMultiplierFor
  );
  // Books and convergence count only trade the sourcing pass actually shipped.
  // The raw clearing result is still what the flow snapshot persists.
  const shippedClearing = capClearingToSourcedTrade(tradeClearing, freightSettlement?.sourcing);
  // Reachable books, built from the SAME pre-convergence balances the clearing
  // ran on. `applyTradeConvergence` mutates `byCountry` in place on the next
  // line, so this cannot move below it: post-convergence an importer's demand
  // has already been relieved by k x imports and every deficit reads short by
  // that factor. Persisted with the flow snapshot so read surfaces quote the
  // book the engine actually clears on.
  const reachableBooks = buildReachableBooks({
    countries: context.countries,
    balances: byCountry,
    clearing: shippedClearing,
    commodities: COMMODITY_TYPES,
    affinity: affinityFor,
  });
  applyTradeConvergence(
    context.countries,
    byCountry,
    shippedClearing,
    tradeConvergenceK(context.ledgerConfig?.tradeConvergenceFullStartTurn, context.turn)
  );

  // Build nudge map from the parallel-fetched nudge docs
  const nudgeMap = buildNudgeMap(context.nudgeDocs);

  // Scarcity drift (persistent-imbalance integrator): config-gated so it can
  // be flipped live without a deploy. When off, multipliers reset to 1 so the
  // economy returns to the memoryless baseline within one turn.
  const marketFlagsConfig = await gameConfigCollection(context.db).findOne(
    { _id: "default" } as Record<string, unknown>,
    {
      projection: {
        commodityScarcityDriftEnabled: 1,
        stockCoverCapEnabled: 1,
        commandEconomyEnabled: 1,
        producerFundedBookStage: 1,
      },
    }
  );
  const scarcityDriftEnabled = marketFlagsConfig?.commodityScarcityDriftEnabled === true;
  // Administered pricing for planned economies (P2). Country-scoped to the
  // NATIONAL leg only — never the shared global leg.
  const commandEconomyEnabled = marketFlagsConfig?.commandEconomyEnabled === true;
  const priceGameState = commandEconomyEnabled
    ? await (
        await getGameStateCollection(context.db)
      ).findOne({ _id: "current" }, { projection: { currentYear: 1 } })
    : null;
  const priceCurrentYear = priceGameState?.currentYear ?? null;
  // Legacy-stockpile cover cap: accelerated spoilage on shadow stock above
  // STOCK_COVER_CAP_TURNS × demand. Config-gated so it can be flipped live.
  const stockCoverCapEnabled = marketFlagsConfig?.stockCoverCapEnabled === true;
  const scarcityMultByCommodity = new Map<CommodityType, number>();

  // Calculate prices for each commodity
  const ops: {
    updateOne: {
      filter: { commodity: CommodityType };
      update: { $set: Omit<CommodityPrice, "commodity"> };
      upsert: boolean;
    };
  }[] = [];

  const statesWithActivity = new Set<string>();
  // Collect actual applied prices for history snapshots
  const appliedGlobalPrices = new Map<CommodityType, number>();
  const appliedStatePrices = new Map<CommodityType, Record<string, number>>();
  const appliedNationalPrices = new Map<CommodityType, Record<string, number>>();

  // Lagged price ratios for producer cost pass-through (see module).
  const laggedRatios = buildLaggedRatios(
    context.LEDGER_BASE_PRICES,
    existingPriceMap,
    context.nominalIndices.lagged
  );

  let fundedBookRows: readonly FundedCountryBookRow[] | undefined;
  if (context.producerPath === "funded") {
    const outcomes = await producerMarketOutcomesCollection<{
      _id: string;
      rows: FundedLedgerRow[];
      books?: FundedCountryBookRow[];
    }>(context.db).findOne({ _id: `${context.presetState?.worldEpochId}:${context.turn}` });
    if (!outcomes) throw new Error(`Funded turn ${context.turn} has no settled supply and demand`);
    const funded = fundedLedgers(outcomes.rows);
    context.global.clear();
    for (const [c, b] of funded.global) context.global.set(c as CommodityType, b);
    context.byState.clear();
    for (const [stateId, m] of funded.byState)
      context.byState.set(stateId, new Map([...m].map(([c, b]) => [c as CommodityType, b])));
    byCountry.clear();
    // Public, military and investment buyers order from national wallets with
    // no state. Their rows name a country only when the producer turn ran with
    // producerNationalPublicDemandStage on; otherwise this adds nothing.
    for (const [countryId, m] of withStatelessCountryDemand(
      aggregateByCountry(context.byState, context.stateToCountry),
      funded.statelessByCountry
    ))
      byCountry.set(countryId, m);
    fundedBookRows = outcomes.books;
  }
  // The funded market already knows which country's buyers ordered and which
  // units actually crossed a border. Price from that measured book when the
  // stage is on; the persisted snapshot keeps the modelled book so the
  // clearing and room signals that read it are unchanged.
  const pricingBooks = selectFundedReachableBooks({
    stage: marketFlagsConfig?.producerFundedBookStage,
    rows: fundedBookRows,
    countries: context.countries,
    commodities: COMMODITY_TYPES,
    modelled: reachableBooks,
  });
  const pricingCtx: CommodityPricingContext = {
    ledgerBasePrices: context.LEDGER_BASE_PRICES,
    commodityNominalPriceIndex: context.commodityNominalPriceIndex,
    scarcityDriftEnabled,
    commodityFixStage: context.commodityFixStage,
    fundedPricing: context.producerPath === "funded",
    fundedPricePace: {
      maxMove: context.fixStageCfg?.producerPriceMaxMove,
      maxMultiplier: context.fixStageCfg?.producerPriceMaxMultiplier,
      softCeiling: (context.fixStageCfg?.producerSoftPriceCeilingStage ?? 0) >= 1,
    },
    marketRecoveryStage:
      context.producerPath === "funded"
        ? 0
        : normalizeMarketRecoveryStage(context.fixStageCfg?.marketRecoveryStage),
    commandEconomyEnabled,
    priceCurrentYear,
    freightRampFraction,
    ownRouteCorporationIds: (() => {
      const byRoute = new Map<string, string[]>();
      for (const sector of ownRouteSectors) {
        const routeId = ownRouteIdentity(
          sector.corporationId,
          ownRoutePolicies.get(sector.corporationId)
        );
        const list = byRoute.get(routeId) ?? [];
        if (!list.includes(sector.corporationId)) list.push(sector.corporationId);
        byRoute.set(routeId, list);
      }
      return byRoute;
    })(),
    freightSettlement,
    existingPriceMap,
    nudgeMap,
    laggedRatios,
    reachableBooks: pricingBooks,
    global: context.global,
    byCountry,
    byState: context.byState,
    allStates: context.allStates,
    stateToCountry: context.stateToCountry,
    demandTruncated: context.demandTruncated,
    scarcityMultByCommodity,
    appliedGlobalPrices,
    appliedStatePrices,
    appliedNationalPrices,
    turn: context.turn,
    now: context.now,
  };
  for (const commodity of COMMODITY_TYPES) {
    const { priceOp } = priceCommodity(pricingCtx, commodity, statesWithActivity);
    ops.push(
      priceOp as {
        updateOne: {
          filter: { commodity: CommodityType };
          update: { $set: Omit<CommodityPrice, "commodity"> };
          upsert: boolean;
        };
      }
    );
  }

  if (ops.length > 0) {
    await commodityPricesCollection<Document>(context.db).bulkWrite(ops);
  }
  await persistCommodityNominalIndex(context.db, context.commodityNominalPriceIndex, context.turn);

  // ── Persistence tail: history, flow ledger, trade snapshot ────────────
  const { tradeClearedVolume } = await persistTurnOutputs(
    context.db,
    {
      marketSystemMode: context.marketSystemMode,
      global: context.global,
      byCountry,
      corporationIds: context.allCorporations.map((corporation) => corporation._id),
      supplyByCorporation: context.supplyByCorporation,
      demandTruncated: context.demandTruncated,
      appliedGlobalPrices,
      appliedStatePrices,
      appliedNationalPrices,
      scarcityMultByCommodity,
      ledgerBasePrices: context.LEDGER_BASE_PRICES,
      commodityNominalPriceIndex: context.commodityNominalPriceIndex,
      stockCoverCapEnabled,
      coverCapTurnsFor: (commodity) =>
        stockCoverCapTurnsForStage(context.commodityFixStage, commodity, STOCK_COVER_CAP_TURNS),
      plantsUnitsByCommodity: context.plantsLedgerEnabled
        ? context.plantsUnitsByCommodity
        : undefined,
      tradeClearing,
      reachableBooks,
      countries: context.countries,
      tradeLanes: { affinityFor, importCostMultiplierFor },
    },
    context.turn,
    context.now
  );

  return {
    commoditiesUpdated: COMMODITY_TYPES.length,
    statesWithActivity: statesWithActivity.size,
    tradeClearedVolume,
  };
}
