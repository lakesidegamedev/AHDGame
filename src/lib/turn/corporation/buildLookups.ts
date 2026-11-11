import type { Db } from "mongodb";
import { employmentStaffingTightness } from "@/lib/labour/rules/employment";
import type { CorporateSector, FederalBudget, CentralBank, Bond, GameState } from "@/lib/db/types";
import { excludePendingFederationFirms } from "@/lib/world/succession/rules/pendingFirmActivity";
import {
  HONEST_LOANS_STAGE,
  loadConstructionLoanDebtAnchorByCorpId,
} from "@/lib/corporations/honestBalanceSheets";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import { soeSizeCostByCorpId as soeSizeCostByCorpIdRule } from "@/lib/corporations/rules/soeSizeCost";
import { buildGroupDominanceShares } from "@/lib/corporations/groups/groupDominanceShares";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { COUNTRY_CURRENCY_MAP, eraRateForCurrency } from "@/lib/constants/currencies";
import { readFreightBillingSnapshot } from "@/lib/logistics/freightBillingSnapshot";
import type { CommodityType } from "@/lib/constants/commodities";
import type { CountryId } from "@/lib/constants/countries";
import { isCorporateIssuerBond } from "@/lib/bonds/corporateCredit";
import { buildPrimeRateByCountry } from "@/lib/centralBank/helpers";
import { isCurtained } from "@/lib/constants/commandEconomy";
import { reconcileSignedTariffBills } from "@/lib/tariffs/reconcileTariffs";
import { reconcileSignedEmbargoBills } from "@/lib/trade/reconcileEmbargoes";
import { buildTradeAffinity } from "@/lib/trade/tradeAffinity";
import {
  buildCountryClearingBooks,
  overlayReachableClearingBooks,
} from "@/lib/market/tradePartition";
import { sectorCountryForClearing } from "./sectorCountry";
import { getRegisteredCountryIds } from "@/lib/country/registeredCountries";
import { type ManufacturingProductProject } from "@/lib/products/manufacturingProject";
import { type MediaProductProject } from "@/lib/products/mediaProduct";
import type { TradeEmbargo } from "@/lib/db/types/tradeEmbargo";
import {
  getUnemploymentMarginModifier,
  getGridReliabilityMarginModifier,
  getCorruptionMarginModifier,
  getWorkforceSkillMarginModifier,
  getCrimeRateMarginModifier,
  getBroadbandMarginModifier,
  getRoadConditionMarginModifier,
  getCarbonEmissionsMarginModifier,
  getCostOfLivingMarginModifier,
  getInflationMarginModifier,
  getDebtToGdpMarginModifier,
  getDeficitToGdpMarginModifier,
  SECTOR_MARGIN_LEVEL_TRIM_PP,
  managementOverheadPp,
} from "@/lib/constants/corporations";
import { controlGroupRootByCorpId, groupTotals } from "@/lib/corporations/groups/controlGroups";
import { INVESTOR_CONFIDENCE_BASELINE } from "@/lib/nationalization/constants";
import { NATIONAL_SCOPE } from "@/lib/constants/nationalScope";
import type { EconomicModelState } from "@/lib/constants/economicModels";
import type { CorporationLookups } from "./types";
import { corpCapitalToAnchor } from "@/lib/currency/corporationCapital";
import { buildSectorShareMaps } from "@/lib/corporations/marketShare";
import { buildSovereignDefaultMarginByCorpId } from "@/lib/sovereignDefault/marginPenalty/buildPerCorpMap";
import { getCurrentTurn } from "@/lib/turn/currentTurn";
import { NEUTRAL_STAT } from "@/lib/stats/statsConstants";
import { getOperatingSectorType } from "@/lib/constants/sectorStrategies";
import { retoolProductionMeasurements } from "@/lib/corporations/retooling/rules";
import { getEraUnitScale } from "@/lib/constants/sectorSeedEra";
import type { SourcingNetworkDoc } from "@/lib/logistics/sourcingLedger";
import { ownRouteKey, recordedGroupRouteMembers } from "@/lib/market/internalSupply/rules";
import { countBlockEmbargoes, tradeEligibilityScope } from "./rules/tradeEligibilityScope";
import { loadBlockadeClosure } from "@/lib/turn/commodity/blockadeClosure";
import { loadCorporationLookupInputs } from "./buildLookupsLoad";
import { buildCommodityBalanceLookups } from "./buildLookupsCommodityBalances";
import { buildExtractionAndPortfolioLookups } from "./buildLookupsExtraction";
import { loadAutomationPolicies } from "@/lib/automationPolicy/policies";
import { presetUsesSocietyPressures } from "@/lib/societyPressures/preset";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { sourcingNetworkLoadCollection } from "@/lib/db/repositories/sourcingNetworkLoad";
import { tradeEmbargoesCollection } from "@/lib/db/repositories/tradeEmbargoes";

export async function buildCorporationLookups(
  db: Db,
  options?: {
    /**
     * Skip the per-sector `buildQueue` (30% of every sector document). Only
     * the corporation turn advances build orders; the share-price recompute
     * reads none of it. Never set this on the corporation turn: sectorTurn
     * rebuilds the queue from what it loaded and writes it back.
     */
    omitBuildQueue?: boolean;
    /**
     * Plants tier (marketSystemMode >= "plants"): compute per-sector market
     * share on the owned-capacity basis instead of revenue. Omitted/false
     * keeps the legacy revenue-based share exactly.
     */
    plantsEnabled?: boolean;
    explicitPlantCostsEnabled?: boolean;
    /** Target turn for production and the blended recipe; stored turn for read-only callers. */
    productionTurn?: number;
    /**
     * Money wiring (interstate-logistics plan step 5, phase A):
     * gameConfig.interstateMoneyWiringEnabled. When true, loads last turn's
     * sourcingNetworkLoad doc and exposes its landedPremiums as
     * `landedPremiumByState`. Omitted/false keeps that map empty.
     */
    moneyWiringEnabled?: boolean;
    /** Read product output maps only while the corporation product gate is on. */
    productLinesV2Enabled?: boolean;
    /** Read durable media projects and receipts only while the feature gate is on. */
    mediaProductSlatesEnabled?: boolean;
    /** Use lagged freight-delivery availability as a local input constraint. */
    freightSettlementActive?: boolean;
    /**
     * Canonical freight billing v1 (issue #897):
     * gameConfig.canonicalFreightBillingEnabled. When true, loads last turn's
     * sourcingNetworkLoad billing aggregates as `freightChargesByDestState` /
     * `freightHaulRevenueByOriginState`. Omitted/false keeps both maps empty,
     * so the corporation turn computes and writes nothing.
     */
    canonicalFreightBillingEnabled?: boolean;
    /** Project editorial positions and audience lean only while the rule is enabled. */
    mediaEditorialEnabled?: boolean;
    /** Project treasury currency only while political-media settlement is active. */
    politicalMediaMarketEnabled?: boolean;
  }
): Promise<CorporationLookups> {
  await reconcileSignedTariffBills(db);

  // Corporate-presence suppression: a COMPREHENSIVE embargo (all commodities,
  // block, BOTH directions) by country S against country T means T-national
  // corporations may not operate in S — their sectors located in S are suspended
  // (revenue frozen, no income) while the embargo is active. Targeted
  // single-commodity embargoes keep their trade-lane-only effect, and — per
  // ticket 984 — so do one-directional embargoes: a US *import* ban on Japan
  // blocks goods crossing the border but must NOT shut a Japanese corp's
  // US-based factories (the "Toyota plants in Kentucky are American factories"
  // case). Only a both-direction embargo (a total severing of relations) freezes
  // in-country foreign operations. Keyed "operatingCountry|nationality".
  const embargoTurn = await getCurrentTurn(db);
  await reconcileSignedEmbargoBills(db, embargoTurn);
  const corporateEmbargoSuppression = new Set<string>();
  const totalEmbargoes = await tradeEmbargoesCollection(db)
    .find({
      commodity: "all",
      mode: "block",
      $and: [
        // Active = no expiry, or expiry still in the future (matches commodityPriceTurn).
        { $or: [{ expiresTurn: { $exists: false } }, { expiresTurn: { $gte: embargoTurn } }] },
        // Comprehensive only: import/export-directional embargoes don't suppress a
        // foreign corp's in-country production. Legacy rows predating the
        // `direction` field were authored as total embargoes → treat as "both".
        { $or: [{ direction: "both" }, { direction: { $exists: false } }] },
      ],
    })
    .toArray();
  for (const e of totalEmbargoes) {
    if (e.sourceCountry && e.targetCountry) {
      corporateEmbargoSuppression.add(`${e.sourceCountry}|${e.targetCountry}`);
    }
  }

  const {
    loadedCorporations,
    loadedSectors,
    activeManufacturingProjects,
    activeMediaProductProjects,
    states,
    activeBonds,
    exchangeRateDocs,
    worldPreset,
    centralBanks,
    federalBudgets,
    allStateMetrics,
    stateBudgets,
    commodityPrices,
    latestTradeSnapshot,
    activeEmbargoDocs,
    orgMembershipDocs,
    activeFtaPairs,
    allTariffs,
    unownedSectorDocs,
    stateResourceCapacityDocs,
    activeSubsidies,
  } = await loadCorporationLookupInputs({ db, options, embargoTurn });

  // A split can preserve a player's corporation while its owner chooses a new
  // playable headquarters. Its retained facilities pause with the company;
  // background facilities have already moved to compensated claims.
  const { firms: corporations, facilities: allSectors } = excludePendingFederationFirms(
    loadedCorporations,
    loadedSectors
  );
  const manufacturingProductByCorpId = new Map<string, ManufacturingProductProject>(
    activeManufacturingProjects.map((project) => [project.corporationId, project])
  );
  const mediaProductProjectsByCorpId = new Map<string, MediaProductProject[]>();
  const mediaProductProjectsBySectorId = new Map<string, MediaProductProject[]>();
  const mediaProductDevelopmentByCorpId = new Map<string, MediaProductProject>();
  for (const project of activeMediaProductProjects) {
    const corpProjects = mediaProductProjectsByCorpId.get(project.corporationId) ?? [];
    corpProjects.push(project);
    mediaProductProjectsByCorpId.set(project.corporationId, corpProjects);
    const sectorProjects = mediaProductProjectsBySectorId.get(project.sectorId) ?? [];
    sectorProjects.push(project);
    mediaProductProjectsBySectorId.set(project.sectorId, sectorProjects);
    if (project.activeDevelopmentCorporationId) {
      mediaProductDevelopmentByCorpId.set(project.corporationId, project);
    }
  }

  // Backfill countryId on corporations and sectors missing it (pre-migration data)
  const stateCountryMap = new Map(states.map((s) => [s._id, s.countryId]));
  const stateSectorSpecializationByState = new Map(
    states
      .filter((s) => s.sectorSpecializations)
      .map((s) => [
        s._id,
        {
          primary: s.sectorSpecializations!.primary,
          secondary: s.sectorSpecializations!.secondary,
        },
      ])
  );
  for (const corp of corporations) {
    if (!corp.countryId) {
      (corp as { countryId: string }).countryId =
        stateCountryMap.get(corp.headquartersState) ?? "US";
    }
  }
  for (const sector of allSectors) {
    if (options?.plantsEnabled && sector.transitionFromStrategyId) {
      Object.assign(
        sector,
        // The retool basis reads a dozen fields; spreading the whole sector
        // document copied every telemetry block it carries, per retooling
        // sector, on a 14,000-row world.
        retoolProductionMeasurements({
          sectorType: sector.sectorType,
          industryModel: sector.industryModel,
          mediaDiscriminator: sector.mediaDiscriminator,
          strategyId: sector.strategyId,
          transitionFromStrategyId: sector.transitionFromStrategyId,
          transitionStartTurn: sector.transitionStartTurn,
          retoolRescaleApplied: sector.retoolRescaleApplied,
          currentTurn: options.productionTurn ?? embargoTurn,
          operatingCapacityTurn: sector.operatingCapacityTurn,
          operatingCapacityUnits: sector.operatingCapacityUnits,
          capitalStock: sector.capitalStock,
          producedUnits: sector.producedUnits,
          soldUnits: sector.soldUnits,
          contractAchievableUnits: sector.contractAchievableUnits,
        })
      );
    }
    (sector as { countryId: string }).countryId = sectorCountryForClearing(sector, stateCountryMap);
  }

  // Issuer-side map: corporate bonds only. Sovereign issuers are synthetic IDs
  // and don't participate in the corporate credit-rating system that consumes
  // bondsByCorpId downstream.
  const bondsByCorpId = new Map<string, Bond[]>();
  for (const b of activeBonds) {
    if (!isCorporateIssuerBond(b)) continue;
    const cid = b.corporationId.toString();
    const list = bondsByCorpId.get(cid) ?? [];
    list.push(b);
    bondsByCorpId.set(cid, list);
  }

  // Holder-side map: ALL active bonds, including sovereigns. A corp parking cash
  // in US Treasuries holds a real liquidatable asset; the corporation API counts
  // it via heldBondsRaw, the share-price formula must too. Excluding sovereigns
  // here was the root cause of corps appearing artificially "broke" after
  // moving cash into safe sovereign debt (Aurora -38.4% incident, 2026-04-19).
  const bondsHeldByCorpId = new Map<string, { bond: Bond; units: number }[]>();
  for (const b of activeBonds) {
    for (const h of b.holders ?? []) {
      const holderCorpId = h.corporationId?.toString();
      if (!holderCorpId) continue;
      const held = bondsHeldByCorpId.get(holderCorpId) ?? [];
      held.push({ bond: b, units: h.units });
      bondsHeldByCorpId.set(holderCorpId, held);
    }
  }

  const corpById = new Map(corporations.map((c) => [c._id.toString(), c]));

  // Business Acumen: load the player CEO's stat for each character-run, non-vacant
  // corp and key it by corp. A skilled CEO grows their sectors more cheaply and is
  // less exposed to high interest rates (applied in calculateDailyGrowthCost).
  // NPP/imperial CEOs and vacant seats are skipped (treated as neutral downstream).
  const playerCeoIds = corporations
    .filter((c) => c.ceoId && !c.ceoVacant && (c.ceoType === "character" || c.ceoType == null))
    .map((c) => c.ceoId!)
    .filter((id, i, arr) => arr.findIndex((x) => x.equals(id)) === i);
  const ceoStatByCharId = new Map<string, number>();
  if (playerCeoIds.length > 0) {
    const ceoChars = await charactersCollection(db)
      .find({ _id: { $in: playerCeoIds } }, { projection: { _id: 1, stats: 1 } })
      .toArray();
    for (const ch of ceoChars) {
      ceoStatByCharId.set(ch._id.toString(), ch.stats?.businessAcumen ?? NEUTRAL_STAT);
    }
  }
  const ceoBusinessAcumenByCorpId = new Map<string, number>();
  for (const corp of corporations) {
    if (!corp.ceoId || corp.ceoVacant || (corp.ceoType !== "character" && corp.ceoType != null)) {
      continue;
    }
    const stat = ceoStatByCharId.get(corp.ceoId.toString());
    if (stat != null) {
      ceoBusinessAcumenByCorpId.set(corp._id.toString(), stat);
    }
  }

  // Sum of `totalIssued` for each corp's active (non-defaulted) corporate bonds —
  // subtracted from balance-sheet equity in the share-price formula so issuing a
  // bond is neutral on share price (cash up, debt up, net zero). Natcorps are
  // exempt: their interest is government-subsidized (perTurnBondDragOnNetIncome=0)
  // and their principal is treated as sovereign-backed. Defaulted bonds are
  // excluded — they no longer represent a payable obligation.
  // Issued bond debt per corp, ₳-normalized. Each bond's `totalIssued` is
  // LOCAL in `bond.currencyCode` (Task-18B); for a same-currency issuer this
  // is a single-currency sum, but for corps whose bonds span currencies the
  // raw sum mixes denominations (and the share-price formula reads this map
  // as ₳). Normalize per-bond. (A27)
  const exchangeRatesByCurrency = new Map<CurrencyCode, number>(
    exchangeRateDocs.map((r) => [r.currencyCode as CurrencyCode, r.rate])
  );
  // The corporation turn needs an economic conversion rate even when a
  // currency is deliberately not player-traded. Six 1953 command-economy
  // currencies have no exchangeRates document, but their sector revenue,
  // profit, cash, debt, and share values are still stored in local units.
  // Falling back to 1.0 inflated every anchor value by 13.5x to 27x. Preserve
  // every live rate and fill only absent currencies from the authored preset.
  for (const code of Object.values(COUNTRY_CURRENCY_MAP) as CurrencyCode[]) {
    if (exchangeRatesByCurrency.has(code)) continue;
    const authoredRate = eraRateForCurrency(code, worldPreset);
    if (authoredRate !== undefined) exchangeRatesByCurrency.set(code, authoredRate);
  }
  const issuedBondDebtByCorpId = new Map<string, number>();
  for (const [corpId, bonds] of bondsByCorpId) {
    const issuer = corpById.get(corpId);
    if (issuer?.countryOwnerId) continue; // natcorp — government backstops principal
    let totalAnchor = 0;
    for (const b of bonds) {
      if (b.defaulted) continue;
      const bondCcy = (b.currencyCode ??
        (b.countryId && b.countryId in COUNTRY_CURRENCY_MAP
          ? COUNTRY_CURRENCY_MAP[b.countryId as keyof typeof COUNTRY_CURRENCY_MAP]
          : undefined)) as CurrencyCode | undefined;
      const bondFxRate = bondCcy ? (exchangeRatesByCurrency.get(bondCcy) ?? 1) : 1;
      totalAnchor += corpCapitalToAnchor(b.totalIssued, bondCcy, bondFxRate);
    }
    if (totalAnchor > 0) issuedBondDebtByCorpId.set(corpId, totalAnchor);
  }

  // Build sector presence keys for tariff blend weight computation.
  // getTariffBlendWeights uses these to decide whether origin_country and corp-specific
  // tariffs should shift the global/local commodity blend for a given (country, sectorType).
  const sectorPresenceKeys = new Set<string>();
  for (const sector of allSectors) {
    const sectorCountry = sector.countryId;
    const corp = corpById.get(sector.corporationId.toString());
    if (!corp) continue;
    const corpCountry = corp.countryId;
    // Only cross-border presence shifts the blend; domestic sectors don't need keys
    if (sectorCountry === corpCountry) continue;
    // Keyed by operating lane, the type getTariffBlendWeights is asked about.
    const lane = getOperatingSectorType(
      sector.sectorType,
      sector.industryModel,
      sector.mediaDiscriminator
    );
    sectorPresenceKeys.add(`${sectorCountry}:${corpCountry}:${lane}`);
    sectorPresenceKeys.add(`${sectorCountry}:corp:${corp._id.toString()}:${lane}`);
  }

  // Member-aware: the ECB doc carries countryId "DE"; keying by bank.countryId
  // would make IE sectors fall back to the configured default prime rate.
  const primeRateByCountry = buildPrimeRateByCountry(centralBanks);
  // EMA of the prime rate (fomcMeetingTurn advances it each turn). Consumed by
  // the share-price formula ONLY — loans/coupons/growth costs stay on spot.
  const primeRateSmoothedByCountry = buildPrimeRateByCountry(
    centralBanks.map((b) => ({
      ...b,
      primeRate:
        typeof (b as CentralBank).primeRateSmoothed === "number" &&
        Number.isFinite((b as CentralBank).primeRateSmoothed)
          ? ((b as CentralBank).primeRateSmoothed as number)
          : b.primeRate,
    }))
  );

  // Build per-country macroeconomic modifier lookups from federal budgets
  const macroInflationByCountry = new Map<string, number>();
  const macroDebtToGdpByCountry = new Map<string, number>();
  const macroDeficitByCountry = new Map<string, number>();
  // Per-country investor confidence (spec §12.4 feed 1). Absent ⇒ baseline.
  const investorConfidenceByCountry = new Map<string, number>();
  // Per-country State Ownership Concentration Index (SOCI, 0–100). Absent ⇒ 0.
  const stateOwnershipConcentrationByCountry = new Map<string, number>();
  // Domestic rate applies to corps HQ'd in the same country as the sector; foreign rate
  // applies to all other corps. Per-sector selection happens in sectorCalculations.ts.
  const domesticCorpTaxRateByCountry = new Map<string, number>();
  const foreignCorpTaxRateByCountry = new Map<string, number>();
  const personalTopIncomeTaxRateByCountry = new Map<string, number>();
  for (const budget of federalBudgets) {
    const cid = budget.countryId;
    if (!cid) continue;
    const inflationRate = budget.economicFactors?.inflationRate ?? null;
    if (inflationRate != null) {
      macroInflationByCountry.set(cid, getInflationMarginModifier(inflationRate));
    }
    const debtRatio = budget.debtToGdpRatio ?? null;
    if (debtRatio != null) {
      macroDebtToGdpByCountry.set(cid, getDebtToGdpMarginModifier(debtRatio));
    }
    const gdp = budget.gdp || 1;
    const surplusToGdp = (budget.surplus ?? 0) / gdp;
    macroDeficitByCountry.set(cid, getDeficitToGdpMarginModifier(surplusToGdp));
    const domRate = budget.taxRates?.domesticCorporateTax;
    if (typeof domRate === "number") domesticCorpTaxRateByCountry.set(cid, domRate);
    const forRate = budget.taxRates?.foreignCorporateTax;
    if (typeof forRate === "number") foreignCorpTaxRateByCountry.set(cid, forRate);
    const topIncome = budget.taxRates?.incomeTaxHigh ?? budget.taxRates?.incomeTax;
    if (typeof topIncome === "number") personalTopIncomeTaxRateByCountry.set(cid, topIncome);
    investorConfidenceByCountry.set(cid, budget.investorConfidence ?? INVESTOR_CONFIDENCE_BASELINE);
    stateOwnershipConcentrationByCountry.set(cid, budget.stateOwnershipConcentration ?? 0);
  }

  // §6.2 (P7b): per-country LAGGED economic model, from the national-scope metric
  // docs. The corp turn runs BEFORE this turn's classification phase, so the stored
  // value is last turn's (the §7 lag). Used for the corp alignment margin modifier.
  const economicModelByCountry = new Map<string, EconomicModelState>();
  for (const m of allStateMetrics) {
    const cid = NATIONAL_SCOPE[String(m._id)];
    if (cid && m.economicModel) economicModelByCountry.set(cid, m.economicModel);
  }

  // Sovereign-default sector margin penalty (Phase 7): per-corp lookup combining
  // local + global contagion contributions from every recovering country.
  //
  // FX FIX: federalBudget.gdp is denominated in the country's local currency
  // (USD for US, JPY for JP, etc. — see budget.ts comment). Comparing
  // defaultingCountry.gdp / globalGdp without conversion mixes denominations
  // and skews the contagion factor by whichever currency has larger nominal
  // numbers (yen-denominated GDP would dominate a raw sum). Normalize each
  // budget's GDP into anchor units before passing through.
  const gdpToAnchor = (b: Pick<FederalBudget, "countryId" | "gdp">): number => {
    const local = b.gdp ?? 0;
    if (local <= 0) return 0;
    const ccy = b.countryId ? COUNTRY_CURRENCY_MAP[b.countryId as CountryId] : undefined;
    const rate = ccy ? exchangeRatesByCurrency.get(ccy) : undefined;
    return rate && rate > 0 ? local / rate : local;
  };
  const recoveringBudgets = federalBudgets.filter(
    (b) =>
      b.sovereignCrisisState === "recovering" &&
      typeof b.lastDefaultTurn === "number" &&
      b.crisisChoice
  );
  const sovereignDefaultMarginByCorpId =
    recoveringBudgets.length > 0
      ? buildSovereignDefaultMarginByCorpId({
          recoveringBudgets: recoveringBudgets.map((b) => ({ ...b, gdp: gdpToAnchor(b) })),
          corps: corporations.map((c) => ({
            _id: c._id,
            countryId: c.countryId,
            type: c.type,
            industryModel: c.industryModel,
            mediaDiscriminator: c.mediaDiscriminator,
          })),
          currentTurn: await getCurrentTurn(db),
          globalGdp: federalBudgets.reduce((acc, b) => acc + gdpToAnchor(b), 0),
        })
      : new Map<string, number>();

  // Build per-state domestic/foreign corporate tax rate maps for per-sector state tax.
  const domesticStateCorpTaxRateByState = new Map<string, number>();
  const foreignStateCorpTaxRateByState = new Map<string, number>();
  const personalTopIncomeTaxRateByState = new Map<string, number>();
  for (const sb of stateBudgets) {
    const dom = sb.taxRates?.domesticCorporateTax;
    if (typeof dom === "number") domesticStateCorpTaxRateByState.set(sb._id, dom);
    const fgn = sb.taxRates?.foreignCorporateTax;
    if (typeof fgn === "number") foreignStateCorpTaxRateByState.set(sb._id, fgn);
    const topIncome = sb.taxRates?.incomeTaxHigh ?? sb.taxRates?.incomeTax;
    if (typeof topIncome === "number") personalTopIncomeTaxRateByState.set(sb._id, topIncome);
  }

  // Build global, national, and per-state commodity balance lookups for margin modifiers.
  // Margin modifiers start at 50% global + 25% national + 25% state and shift toward
  // the national bucket as tariff pressure rises. National totals prefer
  // cp.nationalSupply/nationalDemand so federal injections (e.g. govt healthcare)
  // that never land in any state still flow into the modifier math.
  const globalCommodityBalances = new Map<CommodityType, { supply: number; demand: number }>();
  const {
    nationalCommodityBalancesByCountry,
    tradeSnapshotDoc,
    initializedLaggedBooks,
    stateInputAvailabilityByState,
    statePlacementRatioByState,
    stateDeliveryLimitedRatioByState,
    ownerDeliveryLimitedRatioByCorp,
    priceRatioByCommodity,
    latentDemandFactorByCommodity,
    reachablePriceRatioByCountry,
    reachableInputPriceRatiosByCountry,
    exportIntensityByCountry,
    rawStateBalances,
    statePriceRatioByState,
  } = buildCommodityBalanceLookups({
    commodityPrices,
    globalCommodityBalances,
    options,
    stateCountryMap,
    latestTradeSnapshot,
  });

  // Build per-state margin modifier lookups
  const unemploymentByState = new Map<string, number>();
  const gridReliabilityByState = new Map<string, number>();
  const corruptionByState = new Map<string, number>();
  const workforceSkillByState = new Map<string, number>();
  const rawWorkforceSkillByState = new Map<string, number>();
  // Phase 2 labour rationing: prior-turn labour market tightness, written by
  // the previous corporation turn's telemetry pass. Read LAGGED by one turn on
  // purpose. Rationing needs each state's TOTAL demand before it can allocate,
  // and the sector loop only learns the total after it has finished, so a
  // same-turn figure would mean a second pass over every sector. Lagging is the
  // same trade the smoothed prime rate and the inflation passthrough already
  // make, and labour supply does not move fast enough for one turn to matter.
  const labourTightnessByState = new Map<string, number>();
  const labourDemandWageIndexByState = new Map<string, number>();
  const crimeRateByState = new Map<string, number>();
  const broadbandByState = new Map<string, number>();
  const roadConditionByState = new Map<string, number>();
  const carbonEmissionsByState = new Map<string, number>();
  const costOfLivingByState = new Map<string, number>();

  for (const sm of allStateMetrics) {
    const stateId = String(sm._id);
    const uRate = sm.economic?.unemploymentRate?.value;
    if (typeof uRate === "number") {
      unemploymentByState.set(stateId, getUnemploymentMarginModifier(uRate));
    }
    const gridVal = sm.infrastructure?.powerGridReliability?.value;
    if (typeof gridVal === "number") {
      gridReliabilityByState.set(stateId, getGridReliabilityMarginModifier(gridVal));
    }
    const corrVal = sm.governance?.corruptionIndex?.value;
    if (typeof corrVal === "number") {
      corruptionByState.set(stateId, getCorruptionMarginModifier(corrVal));
    }
    const allocatedTightness = employmentStaffingTightness(sm.labourEmployment);
    const coverageTightness = sm.economic?.labourTightness?.value;
    const tightnessVal =
      allocatedTightness === undefined
        ? coverageTightness
        : Math.max(Number.isFinite(coverageTightness) ? coverageTightness! : 0, allocatedTightness);
    if (typeof tightnessVal === "number" && Number.isFinite(tightnessVal)) {
      labourTightnessByState.set(stateId, tightnessVal);
    }
    const demandWageIndex = sm.economic?.labourDemandWageIndex?.value;
    if (typeof demandWageIndex === "number" && Number.isFinite(demandWageIndex)) {
      labourDemandWageIndexByState.set(stateId, demandWageIndex);
    }
    const skillVal = sm.education?.workforceSkill?.value;
    if (typeof skillVal === "number") {
      workforceSkillByState.set(stateId, getWorkforceSkillMarginModifier(skillVal));
      rawWorkforceSkillByState.set(stateId, skillVal);
    }
    const crimeVal = sm.publicSafety?.crimeRate?.value;
    if (typeof crimeVal === "number") {
      crimeRateByState.set(stateId, getCrimeRateMarginModifier(crimeVal));
    }
    const bbVal = sm.infrastructure?.broadbandAccess?.value;
    if (typeof bbVal === "number") {
      broadbandByState.set(stateId, getBroadbandMarginModifier(bbVal));
    }
    const roadVal = sm.infrastructure?.roadCondition?.value;
    if (typeof roadVal === "number") {
      roadConditionByState.set(stateId, getRoadConditionMarginModifier(roadVal));
    }
    const carbonVal = sm.environment?.carbonEmissions?.value;
    if (typeof carbonVal === "number") {
      carbonEmissionsByState.set(stateId, getCarbonEmissionsMarginModifier(carbonVal));
    }
    const colVal = sm.economic?.costOfLiving?.value;
    if (typeof colVal === "number") {
      costOfLivingByState.set(stateId, getCostOfLivingMarginModifier(colVal));
    }
  }

  // Group sectors by corporation
  const sectorsByCorp = new Map<string, CorporateSector[]>();
  for (const sector of allSectors) {
    const key = sector.corporationId.toString();
    const list = sectorsByCorp.get(key) ?? [];
    list.push(sector);
    sectorsByCorp.set(key, list);
  }

  // Management overhead: a margin charge on every sector of a corporation that
  // grows with its total whole-plant count (snowball brake). Off unless the
  // gameConfig knob is set.
  const overheadCfg = await gameConfigCollection<{
    _id: string;
    managementOverheadPpPerDoubling?: number;
    strengthUpkeepStage?: number;
    groupSizeCostsStage?: number;
    soeSizeCostScale?: number;
    dominanceRunningCostScale?: number;
    honestBalanceSheetsStage?: number;
    fundedOverheadStage?: number;
    fundedHeadcountStage?: number;
    fundedValuationStage?: number;
    producerTariffStage?: number;
  }>(db).findOne(
    { _id: "default" },
    {
      projection: {
        managementOverheadPpPerDoubling: 1,
        strengthUpkeepStage: 1,
        groupSizeCostsStage: 1,
        soeSizeCostScale: 1,
        dominanceRunningCostScale: 1,
        honestBalanceSheetsStage: 1,
        fundedOverheadStage: 1,
        fundedHeadcountStage: 1,
        fundedValuationStage: 1,
        producerTariffStage: 1,
      },
    }
  );
  const overheadPpPerDoubling = overheadCfg?.managementOverheadPpPerDoubling ?? 0;
  const fundedTariffsOn = (overheadCfg?.producerTariffStage ?? 0) >= 1;
  const strengthUpkeepStage =
    typeof overheadCfg?.strengthUpkeepStage === "number" ? overheadCfg.strengthUpkeepStage : 0;
  const groupSizeCostsStage =
    typeof overheadCfg?.groupSizeCostsStage === "number" ? overheadCfg.groupSizeCostsStage : 0;
  const honestBalanceSheetsStage =
    typeof overheadCfg?.honestBalanceSheetsStage === "number"
      ? overheadCfg.honestBalanceSheetsStage
      : 0;
  const constructionLoanDebtByCorpId =
    honestBalanceSheetsStage >= HONEST_LOANS_STAGE
      ? await loadConstructionLoanDebtAnchorByCorpId(db, exchangeRatesByCurrency)
      : new Map<string, number>();
  // Control-group roots for size costs (contestability plan): every corp
  // resolved to its ultimate controlling owner. Only built when a group size
  // cost is on.
  const dominanceRunningCostScale =
    typeof overheadCfg?.dominanceRunningCostScale === "number"
      ? Math.max(0, overheadCfg.dominanceRunningCostScale)
      : 0;
  const controlRootByCorpId =
    groupSizeCostsStage >= 1 || dominanceRunningCostScale > 0
      ? controlGroupRootByCorpId(loadedCorporations)
      : null;
  const managementOverheadPpByCorpId = new Map<string, number>();
  if (overheadPpPerDoubling > 0) {
    const plantsByCorpId = new Map<string, number>();
    for (const [corpId, sectors] of sectorsByCorp) {
      let plants = 0;
      for (const s of sectors)
        plants += Number.isFinite(s.plantCount) ? (s.plantCount as number) : 0;
      plantsByCorpId.set(corpId, plants);
    }
    // Stage 1: measure overhead on the whole control group, so splitting a
    // business into subsidiaries does not dodge it. Every member pays the
    // group's rate on its own sectors.
    const basis =
      groupSizeCostsStage >= 1 && controlRootByCorpId
        ? groupTotals(controlRootByCorpId, plantsByCorpId)
        : plantsByCorpId;
    for (const [corpId, plants] of basis) {
      const pp = managementOverheadPp(plants, overheadPpPerDoubling);
      if (pp > 0) managementOverheadPpByCorpId.set(corpId, pp);
    }
  }

  // State-owned corporations: overhead and sprawl on the whole country's
  // holdings (gameConfig.soeSizeCostScale). Empty when off.
  const soeSizeCostScale =
    typeof overheadCfg?.soeSizeCostScale === "number" ? overheadCfg.soeSizeCostScale : 0;
  const soeSizeCostByCorpId =
    soeSizeCostScale > 0
      ? soeSizeCostByCorpIdRule({
          corps: loadedCorporations
            .filter((c) => isStateOwned(c))
            .map((c) => {
              const sectors = sectorsByCorp.get(c._id.toString()) ?? [];
              return {
                id: c._id.toString(),
                country: c.countryOwnerId ?? c.countryId,
                sectorCount: sectors.length,
                plantCount: sectors.reduce(
                  (sum, s) => sum + (Number.isFinite(s.plantCount) ? (s.plantCount as number) : 0),
                  0
                ),
              };
            }),
          overheadPpPerDoubling,
          scale: soeSizeCostScale,
        })
      : undefined;

  // Per-sector market share (₳-normalized) drives the dominance growth-cost
  // multiplier in calculateDailyGrowthCost. Built once per turn so every sector
  // pays the same dominance penalty the player-facing routes display.
  const stateById = new Map(states.map((s) => [s._id, s]));
  // Era-correct GDP→₳ normalization for the GDP-derived market fallback (refs
  // #3778). Read here rather than reusing the `gameState` fetch further down:
  // that one happens after this block, and reordering it would move several
  // unrelated reads inside the same turn phase.
  const marketSharePreset = worldPreset;
  // One era unit scale per world per turn: every ₳↔unit conversion downstream
  // reads this value from the lookups rather than re-resolving the preset.
  const eraUnitScale = getEraUnitScale(marketSharePreset);

  // Market partition (era worlds only): scope each seller's clearing book to
  // the demand its home country can actually reach under the live trade graph
  // (embargoes block, tariffs/geography drag, caps clamp — legislated autarky
  // lands here as embargo/tariff walls). Modern worlds (eraUnitScale === 1)
  // keep the single worldwide book: postwar-integrated trade is the modern
  // baseline, and partitioning it would only re-derive the same world market
  // with extra moving parts. See market/tradePartition.ts for book semantics.
  //
  // Route eligibility is a different question from book partitioning: it says
  // who may buy from whom inside whatever book clears the sale. That is where
  // an embargo belongs, and it is not era-specific, so a modern world with an
  // active block embargo now builds the affinity graph too. A modern world without
  // one still builds nothing, which keeps this a no-op there.
  const tradeScope = tradeEligibilityScope({
    eraUnitScale,
    activeBlockEmbargoCount: countBlockEmbargoes(activeEmbargoDocs),
    fundedTariffs: fundedTariffsOn,
  });
  let countryClearingBooks: ReturnType<typeof buildCountryClearingBooks> | null = null;
  let tradeRoutes: CorporationLookups["tradeRoutes"] = null;
  if (tradeScope.routes) {
    const blocsByCountry = new Map<string, Set<string>>();
    for (const m of orgMembershipDocs) {
      if (!m.countryId || !m.organizationId) continue;
      if (!blocsByCountry.has(m.countryId)) blocsByCountry.set(m.countryId, new Set());
      blocsByCountry.get(m.countryId)!.add(String(m.organizationId));
    }
    let countries: CountryId[] = [];
    let curtainedCountries: ReadonlySet<string> | undefined;
    if (tradeScope.countryBooks) {
      // Iron curtain (mirrors commodityPriceTurn): planned economies trade only
      // among themselves; membership from the engine's MARKETIZATION_SCHEDULE via
      // isCurtained, so the curtain lifts on the historical marketization dates
      // and the Tito-split exemption keeps Yugoslavia trading with the open world.
      const [curtainCfg, curtainState, registeredCountries] = await Promise.all([
        gameConfigCollection<{ _id: string; commandEconomyEnabled?: boolean }>(db).findOne(
          { _id: "default" },
          { projection: { commandEconomyEnabled: 1 } }
        ),
        gameStateCollection(db).findOne({ _id: "current" }, { projection: { currentYear: 1 } }),
        getRegisteredCountryIds(db),
      ]);
      const curtainEnabled = curtainCfg?.commandEconomyEnabled === true;
      const curtainYear = curtainState?.currentYear ?? null;
      countries = registeredCountries;
      curtainedCountries = new Set<string>(
        countries.filter((c) => isCurtained(c, curtainYear, curtainEnabled))
      );
    }
    // Funded tariffs also close the routes a full naval blockade shuts, read
    // fresh as the commodity turn does. Off, the graph is built without it.
    const blockadeClosure = fundedTariffsOn ? await loadBlockadeClosure(db) : undefined;
    const { affinityFor, capUnitsFor, importCostMultiplierFor } = buildTradeAffinity({
      ftaPairs: activeFtaPairs,
      blocsByCountry,
      tariffs: allTariffs,
      embargoes: activeEmbargoDocs,
      ...(curtainedCountries ? { curtainedCountries } : {}),
      ...(blockadeClosure && blockadeClosure.size > 0 ? { blockadeClosure } : {}),
    });
    tradeRoutes = { affinityFor, importCostMultiplierFor };
    if (tradeScope.countryBooks) {
      countryClearingBooks = buildCountryClearingBooks({
        countries,
        nationalBalances: nationalCommodityBalancesByCountry,
        affinityFor,
        capUnitsFor,
        importCostMultiplierFor,
      });
      // The stored national balances are post-trade; the price turn's persisted
      // reachable books are the pre-trade clearing the books are meant to be.
      overlayReachableClearingBooks(countryClearingBooks, tradeSnapshotDoc?.books);
    }
  }
  const unmetForeignDemandByCountry = new Map<string, Map<CommodityType, number>>();
  for (const [countryId, byCommodity] of Object.entries(tradeSnapshotDoc?.books ?? {})) {
    const row = new Map<CommodityType, number>();
    for (const [commodity, entry] of Object.entries(byCommodity ?? {})) {
      const unmet = entry?.unmetForeignDemand;
      if (typeof unmet === "number" && Number.isFinite(unmet) && unmet > 0) {
        row.set(commodity as CommodityType, unmet);
      }
    }
    if (row.size > 0) unmetForeignDemandByCountry.set(countryId, row);
  }
  const { marketShareBySectorId, nationalDominanceShareBySectorId } = buildSectorShareMaps({
    sectors: allSectors,
    corpById,
    stateById,
    unownedSectors: unownedSectorDocs,
    exchangeRatesByCurrency,
    preset: marketSharePreset,
    plantsEnabled: options?.plantsEnabled === true,
  });
  // Running dominance cost reads the control group's combined shares.
  const dominanceRunningCost =
    dominanceRunningCostScale > 0 && controlRootByCorpId
      ? (() => {
          const g = buildGroupDominanceShares({
            sectors: allSectors,
            rootByCorpId: controlRootByCorpId,
            localShareBySectorId: marketShareBySectorId,
            nationalShareBySectorId: nationalDominanceShareBySectorId,
            countryOf: (s) => s.countryId ?? stateById.get(s.stateId)?.countryId ?? "",
          });
          return {
            scale: dominanceRunningCostScale,
            localShareBySectorId: g.local,
            nationalShareBySectorId: g.national,
          };
        })()
      : null;

  // Extraction capacity utilization (sectorId → { utilization, bindingResource }).
  // Computed here, in the corp phase, because commodityPriceTurn (which computes
  // the identical clamp for market supply) runs AFTER sector income is
  // calculated — the capacity revenue haircut needs these while processing
  // sectors. Mirrors the revenueBasedOutput construction in commodityPriceTurn.
  const {
    gameState,
    eraYear,
    portfolioAnchorValueByCorpId,
    bondAndImfPortfolioAnchorByCorpId,
    crossCorpStockHoldingsByHolderCorpId,
    politicalBaseModifiersByState,
    politicalBoardByState,
    ftaCoverage,
    extractionCapacityUtilBySector,
    activeDisasterEffectsByState,
    climateProfile,
    climateEnergyDemandByState,
    energyTransition,
    regionalConditionMarginByState,
  } = await buildExtractionAndPortfolioLookups({
    allSectors,
    options,
    db,
    eraUnitScale,
    corpById,
    exchangeRatesByCurrency,
    stateResourceCapacityDocs,
    globalCommodityBalances,
    corporations,
    bondsHeldByCorpId,
    activeFtaPairs,
    states,
    allStateMetrics,
  });

  // Money wiring (interstate-logistics plan step 5, phase A): LAST turn's
  // landed-price premiums, loaded only when the flag is on. `embargoTurn`
  // above is this turn's number (getCurrentTurn), so "last turn" is the
  // latest sourcingNetworkLoad doc at or before it - the sourcing pass writes
  // its doc for `turn`, so on a normal cadence that's turn - 1, but reading
  // <= current turn survives a doc gap without going in-turn-mutation-order
  // sensitive.
  //
  // Canonical freight billing (issue #897) shares the same doc and the same
  // lag, so one fetch serves both flags.
  const landedPremiumByState = new Map<string, Map<CommodityType, number>>();
  const freightChargesByDestState = new Map<string, Map<CommodityType, number>>();
  const freightHaulRevenueByOriginState = new Map<string, number>();
  const freightDemandByDestState = new Map<string, Map<CommodityType, number>>();
  const freightUnitPriceByDestState = new Map<string, Map<CommodityType, number>>();
  const freightSupplyByOriginState = new Map<string, number>();
  const ownRouteDeliveredByKey = new Map<string, number>();
  const ownRouteFreightByCorp = new Map<string, Map<string, Map<CommodityType, number>>>();
  let ownRouteGroupMembersByRoot = new Map<string, Set<string>>();
  if (
    options?.moneyWiringEnabled ||
    options?.canonicalFreightBillingEnabled ||
    options?.freightSettlementActive
  ) {
    const networkDoc = await sourcingNetworkLoadCollection<SourcingNetworkDoc>(db)
      .find({ turn: { $lte: embargoTurn } })
      .sort({ turn: -1 })
      .limit(1)
      .toArray();
    const doc = networkDoc[0];
    if (options?.canonicalFreightBillingEnabled) {
      ownRouteGroupMembersByRoot = recordedGroupRouteMembers(
        corporations.map((corp) => ({
          id: corp._id.toString(),
          totalShares: corp.totalShares,
          holders: (corp.shareholders ?? []).map((holder) => ({
            corporationId: holder.corporationId?.toString(),
            shares: holder.shares,
          })),
          policy: corp.internalSupplyPolicy,
        })),
        (doc?.ownRouteDelivered ?? []).map((route) => route.corporationId)
      );
    }
    if (options?.freightSettlementActive) {
      for (const r of doc?.ownRouteDelivered ?? []) {
        if (!(typeof r.units === "number" && r.units > 0)) continue;
        const key = ownRouteKey(r.commodity, r.corporationId, r.originStateId, r.destStateId);
        ownRouteDeliveredByKey.set(key, (ownRouteDeliveredByKey.get(key) ?? 0) + r.units);
      }
    }
    if (options?.moneyWiringEnabled && doc?.landedPremiums) {
      for (const [stateId, byCommodity] of Object.entries(doc.landedPremiums)) {
        const m = new Map<CommodityType, number>();
        for (const [commodity, premium] of Object.entries(byCommodity)) {
          if (typeof premium === "number" && premium > 0)
            m.set(commodity as CommodityType, premium);
        }
        if (m.size > 0) landedPremiumByState.set(stateId, m);
      }
    }
    if (options?.canonicalFreightBillingEnabled) {
      const priceBookByCommodity = new Map(commodityPrices.map((cp) => [cp.commodity, cp]));
      for (const [stateId, byCommodity] of Object.entries(doc?.freightCharges ?? {})) {
        const m = new Map<CommodityType, number>();
        for (const [commodity, charge] of Object.entries(byCommodity)) {
          if (typeof charge === "number" && charge > 0) m.set(commodity as CommodityType, charge);
        }
        if (m.size > 0) freightChargesByDestState.set(stateId, m);
        const prices = new Map<CommodityType, number>();
        for (const commodity of m.keys()) {
          const book = priceBookByCommodity.get(commodity);
          const price = book?.statePrices?.[stateId] ?? book?.globalPrice;
          if (typeof price === "number" && price > 0) prices.set(commodity, price);
        }
        if (prices.size > 0) freightUnitPriceByDestState.set(stateId, prices);
      }
      for (const [stateId, revenue] of Object.entries(doc?.freightHaulRevenue ?? {})) {
        if (typeof revenue === "number" && revenue > 0)
          freightHaulRevenueByOriginState.set(stateId, revenue);
      }
      for (const r of doc?.ownRouteDelivered ?? []) {
        const charge = r.freightCharge;
        if (!(typeof charge === "number" && Number.isFinite(charge) && charge > 0)) continue;
        let byDest = ownRouteFreightByCorp.get(r.corporationId);
        if (!byDest) ownRouteFreightByCorp.set(r.corporationId, (byDest = new Map()));
        let byCommodity = byDest.get(r.destStateId);
        if (!byCommodity) byDest.set(r.destStateId, (byCommodity = new Map()));
        byCommodity.set(r.commodity, (byCommodity.get(r.commodity) ?? 0) + charge);
      }
      const billingSnapshot = readFreightBillingSnapshot(doc, commodityPrices);
      for (const [stateId, demand] of billingSnapshot.demandByDestState)
        freightDemandByDestState.set(stateId, demand);
      for (const [stateId, supply] of billingSnapshot.supplyByOriginState)
        freightSupplyByOriginState.set(stateId, supply);
    }
  }

  return {
    preset: marketSharePreset,
    hardwareInputReliefStartTurn: gameState?.hardwareInputReliefStartTurn,
    stockHoldingTaxStartTurn: gameState?.stockHoldingTaxStartTurn,
    passThroughOwnerTaxStartTurn: gameState?.passThroughOwnerTaxStartTurn,
    personalTopIncomeTaxRateByCountry,
    personalTopIncomeTaxRateByState,
    nppCeoPayStartTurn: gameState?.nppCeoPayStartTurn,
    eraYear,
    eraUnitScale,
    corporations,
    sectorsByCorp,
    productLinesV2Enabled: options?.productLinesV2Enabled === true,
    manufacturingProductByCorpId,
    mediaProductSlatesEnabled: options?.mediaProductSlatesEnabled === true,
    mediaProductProjectsByCorpId,
    mediaProductProjectsBySectorId,
    mediaProductDevelopmentByCorpId,
    corpById,
    editorialAudienceLeanByState:
      options?.mediaEditorialEnabled === true
        ? new Map(
            states.map((state) => [
              state._id,
              {
                economic: state.cachedEconomicLean ?? 0,
                social: state.cachedSocialLean ?? 0,
              },
            ])
          )
        : undefined,
    ceoBusinessAcumenByCorpId,
    bondsByCorpId,
    bondsHeldByCorpId,
    portfolioAnchorValueByCorpId,
    bondAndImfPortfolioAnchorByCorpId,
    issuedBondDebtByCorpId,
    crossCorpStockHoldingsByHolderCorpId,
    primeRateByCountry,
    primeRateSmoothedByCountry,
    macroInflationByCountry,
    investorConfidenceByCountry,
    stateOwnershipConcentrationByCountry,
    economicModelByCountry,
    macroDebtToGdpByCountry,
    macroDeficitByCountry,
    sovereignDefaultMarginByCorpId,
    stateMetricsByState: new Map(allStateMetrics.map((metrics) => [String(metrics._id), metrics])),
    politicalBaseModifiersByState,
    politicalBoardByState,
    unemploymentByState,
    gridReliabilityByState,
    corruptionByState,
    workforceSkillByState,
    rawWorkforceSkillByState,
    labourTightnessByState,
    labourDemandWageIndexByState,
    crimeRateByState,
    broadbandByState,
    roadConditionByState,
    carbonEmissionsByState,
    costOfLivingByState,
    globalCommodityBalances,
    initializedLaggedBooks,
    stateInputAvailabilityByState,
    statePlacementRatioByState,
    stateDeliveryLimitedRatioByState,
    ownerDeliveryLimitedRatioByCorp,
    priceRatioByCommodity,
    latentDemandFactorByCommodity,
    marginLevelTrimPp: SECTOR_MARGIN_LEVEL_TRIM_PP,
    managementOverheadPpByCorpId,
    honestBalanceSheetsStage,
    constructionLoanDebtByCorpId,
    fundedOverheadStage:
      typeof overheadCfg?.fundedOverheadStage === "number" ? overheadCfg.fundedOverheadStage : 0,
    fundedHeadcountStage:
      typeof overheadCfg?.fundedHeadcountStage === "number" ? overheadCfg.fundedHeadcountStage : 0,
    fundedValuationStage:
      typeof overheadCfg?.fundedValuationStage === "number" ? overheadCfg.fundedValuationStage : 0,
    dumpingGuardRootByCorpId: groupSizeCostsStage >= 3 ? controlRootByCorpId : null,
    soeSizeCostByCorpId,
    dominanceRunningCost,
    strengthUpkeepStage,
    reachablePriceRatioByCountry,
    reachableInputPriceRatiosByCountry,
    landedPremiumByState,
    freightChargesByDestState,
    freightDemandByDestState,
    freightUnitPriceByDestState,
    freightSupplyByOriginState,
    ownRouteDeliveredByKey,
    ownRouteFreightByCorp,
    ownRouteGroupMembersByRoot,
    freightHaulRevenueByOriginState,
    nationalCommodityBalancesByCountry,
    countryClearingBooks,
    tradeRoutes,
    unmetForeignDemandByCountry,
    exportIntensityByCountry,
    rawStateBalances,
    statePriceRatioByState,
    sectorPresenceKeys,
    allTariffs,
    activeFtaPairs,
    ftaCoverage,
    activeSubsidies,
    federalBudgets,
    domesticCorpTaxRateByCountry,
    foreignCorpTaxRateByCountry,
    domesticStateCorpTaxRateByState,
    foreignStateCorpTaxRateByState,
    exchangeRatesByCurrency,
    stateCountryMap,
    stateResourceCapacityByState: new Map(
      stateResourceCapacityDocs.map((doc) => [doc.stateId, doc.resources])
    ),
    extractionCapacityUtilBySector,
    marketShareBySectorId,
    nationalDominanceShareBySectorId,
    stateSectorSpecializationByState,
    activeDisasterEffectsByState,
    ...(climateProfile.broaderEffects ? { climateEnergyDemandByState, energyTransition } : {}),
    regionalConditionMarginByState,
    corporateEmbargoSuppression,
    // Legacy full-mothball embargo model DISABLED (ticket 984): always use the
    // trade-exposure model, which strips only the cross-border (export-exposed)
    // share of an embargoed sector's revenue and leaves domestic host-country
    // sales operating normally. The old model zeroed a foreign corp's entire
    // domestic production (realizedRevenue -> 0) even when its export exposure
    // was 0, wrongly bankrupting purely-domestic sectors under an import embargo.
    embargoTradeExposureEnabled: true,
    // 2027 world: enacted automation laws, one read for all countries.
    ...(presetUsesSocietyPressures(marketSharePreset)
      ? { automationPolicyByCountry: await loadAutomationPolicies(db) }
      : {}),
  };
}
