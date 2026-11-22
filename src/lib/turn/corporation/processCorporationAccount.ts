import { closeCorporationAccount } from "@/lib/turn/corporation/closeCorporationAccount";

import {
  hasCorporateCashPayables,
  corporatePayoutCash,
} from "@/lib/turn/corporation/rules/corporateTaxPriority";

import {
  applyLossCarryforward,
  openingCarryforward,
} from "@/lib/corporations/rules/lossCarryforward";

import { getLegalStructureForCorp } from "@/lib/corporations/legalStructure";
import { getControllingCorporateParent } from "@/lib/corporations/corporateOwnership";
import { activeParentDividendFloorPct } from "@/lib/corporations/subsidiaries/helpers";

import {
  TURNS_PER_DAY,
  MAX_DIVIDEND_RATE,
  CEO_SALARY_MAX_REVENUE_MULTIPLE,
  CORP_OVERHEAD_MAX_REVENUE_MULTIPLE,
} from "@/lib/constants/corporations";

import {
  corpCapitalToAnchor,
  fxRateForCorpFromMap,
  resolveCorpLiquidCurrencyCode,
  resolveSectorHostCurrencyCode,
  fxRateForSectorHostFromMap,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor, writeCorpEconomicLocal } from "@/lib/currency/corpEconomyFields";

import { isStateOwned } from "@/lib/nationalization/nationalCorporation";

import { fundedSectorResult } from "@/lib/market/producerMarket/fundedSectorRules";
import { processSector } from "@/lib/turn/corporation/sectorTurn";
import type { SectorTurnResult } from "@/lib/turn/corporation/sectorTurnTypes";
import { fundedSectorValuation } from "@/lib/turn/corporation/fundedSectorValuation";
import {
  perTurnIssuerBondInterestExpense,
  perTurnBondCouponIncomeAsHolder,
} from "@/lib/bonds/corpBondCashflows";

import { settledMediaAdvertisingAnchor } from "@/lib/products/rules/mediaProductRules";
import { allocateProductDevelopmentBudget } from "@/lib/products/rules/productBudgets";
import {
  addSiteCostParts,
  buildCostBreakdown,
  emptySiteCostParts,
} from "@/lib/corporations/rules/costBreakdown";

import {
  blendedOwnerRate,
  corporateTaxMultiplierFor,
  passThroughOwnerTax,
  netPassThroughProfit,
  passThroughTaxMode,
} from "@/lib/corporations/rules/passThroughTax";
import type { ProcessSectorsStageContext } from "@/lib/turn/corporation/sectorCalculations";
function prepareProcessCorporationAccount(
  context: ProcessSectorsStageContext,
  corp: ProcessSectorsStageContext["lookups"]["corporations"][number]
) {
  // Resolve corp's home currency and FX rate once per corp. Every stored
  // corp-economic field (sector revenue, corp budgets, CEO salary, liquidCapital)
  // is in this currency post-v0.2.6; turn math runs in ₳ so we normalize each
  // read at the top of the loop and re-denominate on write.
  const resolvedHomeCurrency = resolveCorpLiquidCurrencyCode(corp);
  const localFxRate = fxRateForCorpFromMap(corp, context.lookups.exchangeRatesByCurrency);

  const corpId = corp._id.toString();
  // Sector tech-tree bonuses (decade-gated R&D unlocks) — derived once per corp
  // from its unlocked node set. Inert (neutral 0pp / ×1) when the feature gate
  // is off. See lib/constants/techTree.
  const sectors = context.lookups.sectorsByCorp.get(corpId) ?? [];
  let corpRevenue = 0;
  let corpGrowthNumer = 0;
  let corpGrowthDenom = 0;
  let corpCosts = 0;
  const siteCostParts = emptySiteCostParts();
  let corpHeadcount = 0;
  // Worker-morale accumulators (#84): revenue-weighted average sector wageLevel
  // drives an R&D-efficiency multiplier below. Neutral (avg 1) when labour off.
  let corpWageWeighted = 0;
  let corpWageWeight = 0;
  let corpSectorNPV = 0; // Sum of sector NPVs for balance sheet price
  // Funded valuation: units sold at base prices, for the real growth premium.
  let corpRealOutput = 0;
  // Diagnostic accumulators (revenue-weighted)
  let diagWeightedMargin = 0;
  let diagWeightedCommodityInput = 0;
  let diagWeightedCommoditySurplus = 0;
  let diagWeightedExportPremium = 0;
  let diagWeightedMacro = 0;
  let diagWeightedStateMetrics = 0;
  let diagWeightedLegacyStateMetrics = 0;
  let diagTotalGrowthCost = 0;
  // Per-sector records for territorial tax apportionment (fed rate by sector country,
  // state rate by sector state) and for tax-base blending (Tasks 3 and 4).
  const sectorResults: Array<{
    hourlyRevenue: number;
    effectiveMargin: number;
    stateId: string;
    countryId: string;
  }> = [];

  for (const sector of sectors) {
    // Sector economic fields are stored in the sector's HOST-state functional
    // currency (the market it operates in), not the parent corp's home
    // currency — a foreign-owned sector's real (₳) value must track its host,
    // not its owner. Resolve per-sector; for domestic sectors this equals the
    // corp currency resolved above.
    const sectorCurrencyCode = resolveSectorHostCurrencyCode(sector, corp);
    const sectorFxRate = fxRateForSectorHostFromMap(
      sector,
      corp,
      context.lookups.exchangeRatesByCurrency
    );
    const sectorIdStr = sector._id.toString();
    const legacyResult =
      context.internalSupplyResults?.get(sectorIdStr) ??
      processSector(
        context.sectorTurnEnv,
        corp,
        sector,
        sectors.length,
        sectorCurrencyCode,
        sectorFxRate
      );
    const fundedReceipt = context.funded?.receiptsBySectorId.get(sectorIdStr);
    const r: SectorTurnResult = fundedReceipt
      ? fundedSectorResult<SectorTurnResult>(legacyResult, fundedReceipt)
      : legacyResult;
    if (fundedReceipt) {
      context.fundedResults.set(sectorIdStr, r);
      context.fundedDaily.set(sectorIdStr, (anchorPerTurn: number) =>
        writeCorpEconomicLocal(anchorPerTurn * TURNS_PER_DAY, sectorCurrencyCode, sectorFxRate)
      );
    }
    corpGrowthNumer += (r.newCurrentGrowthRate / 100) * r.hourlyRevenue;
    corpGrowthDenom += r.hourlyRevenue;
    // Funded valuation values the sector on what the settlement says it
    // earned, not on the legacy nameplate P&L run beside it.
    const fundedValue =
      fundedReceipt && (context.lookups.fundedValuationStage ?? 0) >= 1
        ? fundedSectorValuation({
            sector,
            receipt: fundedReceipt,
            result: r,
            currentTurn: context.currentTurn,
            currentYear: context.currentYear,
            eraUnitScale: context.lookups.eraUnitScale,
          })
        : null;
    if (fundedValue) context.fundedProfitHistory.set(sectorIdStr, fundedValue.profitHistory);
    corpSectorNPV += fundedValue ? fundedValue.valueAnchor : r.npvContribution;
    corpRealOutput += fundedValue?.realOutputAnchor ?? 0;

    // O1c: paid growth cost → the operating state's capital investment.
    if (r.growthInvestmentAnchor > 0) {
      context.growthInvestmentByOperatingState.set(
        r.stateId,
        (context.growthInvestmentByOperatingState.get(r.stateId) ?? 0) + r.growthInvestmentAnchor
      );
    }

    corpRevenue += r.hourlyRevenue;
    // Weight worker morale (wageLevel) by sector revenue for the R&D factor.
    corpWageWeighted += r.hourlyRevenue * (sector.wageLevel ?? 1);
    corpWageWeight += r.hourlyRevenue;
    // Include regulatoryBurden so it flows to corpLevelCosts (apportioned by
    // revenue share for tax) AND to incomePreDividends → earningsHistory →
    // the share-price formula's earningsPower component. Without this, the
    // burden would only hit sectorNPV and would be silently absorbed by
    // corp-level income.
    // Suspended (embargoed foreign) sectors are mothballed: no operating cost
    // either, so the corp neither earns nor bleeds while dormant.
    corpCosts += r.costs;
    if (r.costParts) addSiteCostParts(siteCostParts, r.costParts);
    const crew = r.workers ?? sector.workers;
    corpHeadcount += typeof crew === "number" && Number.isFinite(crew) ? Math.max(0, crew) : 0;
    context.sectorsProcessed++;

    // Accumulate revenue-weighted diagnostic data for margin breakdown
    diagWeightedMargin += r.effectiveMargin * r.hourlyRevenue;
    diagWeightedCommodityInput += r.commodityMod * r.hourlyRevenue;
    diagWeightedCommoditySurplus += r.surplusMod * r.hourlyRevenue;
    diagWeightedExportPremium += r.exportPremiumMod * r.hourlyRevenue;
    diagWeightedMacro += r.macroMod * r.hourlyRevenue;
    diagWeightedStateMetrics += r.stateMetricsCappedTotal * r.hourlyRevenue;
    diagWeightedLegacyStateMetrics += r.stateMetricsLegacyTotal * r.hourlyRevenue;
    diagTotalGrowthCost += r.hourlyGrowthCost;

    // Record per-sector metrics for tax apportionment and base blending (Tasks 3/4).
    sectorResults.push({
      hourlyRevenue: r.hourlyRevenue,
      effectiveMargin: r.effectiveMargin,
      stateId: r.stateId,
      countryId: r.countryId,
    });
  }

  // Corporation-level costs (daily rates divided by TURNS_PER_DAY).
  // Corp-economic fields store in local currency post-v0.2.6 — normalize to ₳
  // for the per-turn arithmetic. The anchor variants also feed the marketing/
  // logistics strength helpers below (their thresholds are ₳-calibrated).
  const imfBailoutActive = corp.imfBailoutActive === true;
  const cashPayables = hasCorporateCashPayables(corp);

  const marketingBudgetAnchor = readCorpEconomicAnchor(
    corp.marketingBudget,
    resolvedHomeCurrency,
    localFxRate
  );
  const logisticsBudgetAnchor = readCorpEconomicAnchor(
    corp.logisticsBudget ?? 0,
    resolvedHomeCurrency,
    localFxRate
  );
  const rdBudgetAnchor = readCorpEconomicAnchor(
    corp.rdBudget ?? 0,
    resolvedHomeCurrency,
    localFxRate
  );
  const ceoSalaryAnchor = readCorpEconomicAnchor(
    corp.ceoSalary ?? 0,
    resolvedHomeCurrency,
    localFxRate
  );

  const requestedHourlyMarketing = cashPayables ? 0 : marketingBudgetAnchor / TURNS_PER_DAY;
  const requestedHourlyLogistics = cashPayables ? 0 : logisticsBudgetAnchor / TURNS_PER_DAY;
  // R&D spend lives in the same daily-budget cadence as marketing/logistics
  // and counts against the 150% overhead cap. Feeds rdScore growth below.
  const requestedHourlyRd = cashPayables ? 0 : rdBudgetAnchor / TURNS_PER_DAY;
  const requestedCeoSalary = imfBailoutActive || cashPayables ? 0 : ceoSalaryAnchor / TURNS_PER_DAY;

  // Pay-time ceiling on the 150% combined-overhead rule. The set-time check
  // only binds when budgets are saved, so a corp whose revenue collapses keeps
  // charging stored budgets. Marketing and CEO salary are already clamped
  // elsewhere; logistics and R&D had no pay-time ceiling, so the overage lands
  // on them. Marketing and CEO salary are subtracted at requested size to mirror
  // the set-time check. Same per-turn gross-revenue basis as the salary cap, so
  // this ceiling is never tighter than the set-time one. Zero revenue pays $0.
  const overheadCeiling = CORP_OVERHEAD_MAX_REVENUE_MULTIPLE * Math.max(0, corpRevenue);
  const opsOverheadCeiling = Math.max(
    0,
    overheadCeiling - Math.max(0, requestedHourlyMarketing) - Math.max(0, requestedCeoSalary)
  );
  const requestedOpsOverhead = requestedHourlyLogistics + requestedHourlyRd;
  const opsOverheadScale =
    requestedOpsOverhead > opsOverheadCeiling && requestedOpsOverhead > 0
      ? opsOverheadCeiling / requestedOpsOverhead
      : 1;
  const hourlyLogistics = requestedHourlyLogistics * opsOverheadScale;
  const hourlyRd = requestedHourlyRd * opsOverheadScale;

  const activeManufacturingProject = context.lookups.productLinesV2Enabled
    ? context.lookups.manufacturingProductByCorpId?.get(corpId)
    : undefined;
  const activeMediaProductProject = context.lookups.mediaProductSlatesEnabled
    ? context.lookups.mediaProductDevelopmentByCorpId?.get(corpId)
    : undefined;
  const developmentProjects = [activeManufacturingProject, activeMediaProductProject].flatMap(
    (project) =>
      project
        ? [
            {
              id: project._id,
              stage: project.stage,
              paidAnchor: project.developmentPaidAnchor,
              thresholdAnchor: project.paidThresholdAnchor,
            },
          ]
        : []
  );
  const proposedResearchAllocation = allocateProductDevelopmentBudget({
    budgetAnchor: hourlyRd,
    projects: developmentProjects,
  });
  const genericResearchSpend = proposedResearchAllocation.genericResearchAnchor;

  // liquidCapital normalized to ₳ using the per-corp FX resolved at loop entry.
  // Every downstream comparison against liquidCapital must normalize to a common
  // denomination — the field is in home currency post-forex, every computed
  // cash flow is in ₳.
  // Guard against NaN/non-finite values (BSON Double NaN survives ?? because NaN is not null).
  const liquidCapitalAnchor = corpCapitalToAnchor(
    Number.isFinite(corp.liquidCapital) ? corp.liquidCapital : 0,
    resolvedHomeCurrency,
    localFxRate
  );

  // Under clearing, marketing is a purchase only to the extent advertising
  // was delivered. Each funded buyer receives its pro-rata share of the
  // delivered book's clearing value, capped again by its budget and cash.
  // When the world has no advertising seller, retain the cost but create no
  // settlement: marketing does not become globally free at zero supply.
  const marketingSettlementEnabled = context.market.clearingEnabled;
  const marketingCashAvailable = Math.max(
    0,
    liquidCapitalAnchor + corpRevenue - corpCosts - hourlyLogistics - hourlyRd
  );
  const deliveredValueShare =
    context.totalMarketingOrderWeight > 0
      ? context.totalAdvertisingDeliveredValueAnchor *
        ((context.marketingOrderWeightByBuyerId.get(corpId) ?? 0) /
          context.totalMarketingOrderWeight)
      : 0;
  const hourlyMarketing = marketingSettlementEnabled
    ? context.totalAdvertisingDeliveredValueAnchor > 0
      ? settledMediaAdvertisingAnchor({
          requestedAnchor: requestedHourlyMarketing,
          availableCashAnchor: marketingCashAvailable,
          deliveredValueAnchor: deliveredValueShare,
        })
      : Math.min(Math.max(0, requestedHourlyMarketing), marketingCashAvailable)
    : requestedHourlyMarketing;
  if (
    marketingSettlementEnabled &&
    context.totalAdvertisingDeliveredValueAnchor > 0 &&
    hourlyMarketing > 0
  ) {
    context.marketingSpendAnchorByBuyerId.set(corpId, hourlyMarketing);
  }

  const heldBonds = context.lookups.bondsHeldByCorpId.get(corp._id.toString()) ?? [];
  const perTurnBondCouponIncome = perTurnBondCouponIncomeAsHolder(
    heldBonds,
    context.lookups.exchangeRatesByCurrency
  );
  const corpLegalStructure = getLegalStructureForCorp(corp);
  const corpTaxMultiplier = corporateTaxMultiplierFor(
    corpLegalStructure,
    context.passThroughPhase,
    corp
  );
  const corpCountryFedRate = context.lookups.domesticCorpTaxRateByCountry.get(corp.countryId) ?? 0;
  const bondCouponFedTax =
    Math.max(0, perTurnBondCouponIncome) * corpTaxMultiplier * (corpCountryFedRate / 100);

  // Compute income before CEO salary to determine what the corp can afford
  const costsBeforeCeo =
    corpCosts +
    hourlyMarketing +
    hourlyLogistics +
    (context.lookups.productLinesV2Enabled || context.lookups.mediaProductSlatesEnabled
      ? genericResearchSpend
      : hourlyRd);
  const incomeBeforeCeo = corpRevenue - costsBeforeCeo;
  const corpCountryId = corp.countryId;

  // Cap CEO salary: only pay what the corp can cover without going below zero.
  // projectedLiquid is what liquidCapital would be after all costs except CEO salary.
  // Both sides in ₳: liquidCapital is normalized; incomeBeforeCeo is already ₳.
  const projectedLiquid = context.treasuryCashLedgerEnabled
    ? corporatePayoutCash({
        cash: liquidCapitalAnchor,
        income: incomeBeforeCeo,
        alreadySettled: context.funded?.settledProfitByCorp.get(corpId) ?? 0,
        reservedTax: corp.countryOwnerId ? 0 : bondCouponFedTax,
      })
    : liquidCapitalAnchor + incomeBeforeCeo;
  let actualCeoSalary: number;
  let shouldZeroCeoSalary = false;
  if (requestedCeoSalary <= 0 || projectedLiquid <= 0) {
    // Corp is already broke or no salary set — pay nothing, zero out salary if it was set
    actualCeoSalary = 0;
    if ((corp.ceoSalary ?? 0) > 0) shouldZeroCeoSalary = true;
  } else if (requestedCeoSalary > projectedLiquid) {
    // Salary exceeds what corp can cover — pay only what's available, then zero out
    actualCeoSalary = projectedLiquid;
    shouldZeroCeoSalary = true;
  } else {
    actualCeoSalary = requestedCeoSalary;
  }

  // CEO salary may not exceed 1.25x gross (sector) revenue. corpRevenue excludes bond proceeds and coupon income, so issuing bonds cannot raise this ceiling. Zero revenue means $0. Stored ceoSalary is kept intact so a legitimate corp resumes paying when revenue returns. Both sides per-turn ₳.
  const salaryRevenueCap = CEO_SALARY_MAX_REVENUE_MULTIPLE * Math.max(0, corpRevenue);
  if (actualCeoSalary > salaryRevenueCap) {
    actualCeoSalary = salaryRevenueCap;
  }

  const totalCorpCosts = costsBeforeCeo + actualCeoSalary;
  const costBreakdown = buildCostBreakdown(
    siteCostParts,
    totalCorpCosts - corpCosts,
    totalCorpCosts
  );
  const incomePreDividends = corpRevenue - totalCorpCosts;

  // Corporate tax (territorial, per-sector): each sector pays its country's federal rate and its state's rate on its revenue-weighted apportioned share of corp income. Corp-level overhead is allocated across sectors by revenue share. Losing sectors pay 0; profitable sectors pay even if corp total is negative (nexus-based). Loss-making corps with all-negative sectors pay 0 in both tiers.
  let sectorMaintenanceTotal = 0;
  for (const s of sectorResults) {
    sectorMaintenanceTotal += s.hourlyRevenue * (1 - s.effectiveMargin / 100);
  }
  const corpLevelCosts = totalCorpCosts - sectorMaintenanceTotal;

  // Per-turn bond cash flows (matches consolidated `income` on corporation API financials).
  // Issuer interest is waived for national enterprises (government bond subsidy).
  // Bond amounts denominate in bond.currencyCode (Task 18B); both helpers
  // normalize to ₳ via lookups.exchangeRatesByCurrency so the corp's
  // income math stays anchor-consistent across cross-currency holdings.
  const issuerBonds = context.lookups.bondsByCorpId.get(corp._id.toString());
  const perTurnBondInterestExpense = perTurnIssuerBondInterestExpense(
    issuerBonds,
    context.lookups.exchangeRatesByCurrency
  );
  const isNationalEnterprise = !!corp.countryOwnerId;
  const perTurnBondDragOnNetIncome = isNationalEnterprise ? 0 : perTurnBondInterestExpense;
  // Interest a corporation pays on its own bonds is deductible: it is a
  // corp-level cost, apportioned across sectors by revenue share like the
  // other overhead. Coupon income it earns as a holder stays taxable below,
  // so the base is no longer asymmetric. National enterprises pay no issuer
  // interest (waived above), so they deduct nothing.
  const corpLevelTaxCosts = corpLevelCosts + perTurnBondDragOnNetIncome;

  let totalFederalTax = 0;
  let totalStateTax = 0;
  // Per-jurisdiction breakdown so each turn's history snapshot can record which countries/
  // states received tax from this corp. Empty maps for single-jurisdiction corps — the
  // persist layer omits empty maps so we don't carry noisy `{}` keys on every doc.
  const taxPaidByCountry = new Map<string, number>();
  const taxPaidByState = new Map<string, number>();
  // Split breakdown for the corporationHistory diagnostic. Same total as the combined
  // maps above; splits by whether the corp is HQ'd in the sector's country (domestic)
  // or elsewhere (foreign). Populated only when non-zero, persisted only when non-empty.
  const taxPaidByCountryDomestic = new Map<string, number>();
  const taxPaidByCountryForeign = new Map<string, number>();
  const taxPaidByStateDomestic = new Map<string, number>();
  const taxPaidByStateForeign = new Map<string, number>();
  // Legal structure: preferential -> taxMultiplier x rate; standard -> 1x. A
  // pass-through pays no company tax (its owners are taxed below), except a
  // structure taxed as a company in reality, which phases in to 1x.

  // Consolidated loss offset. Taxing each sector's positive income in
  // isolation (`max(0, sectorNetIncome)`) meant a diversified corp's losses
  // offset NOTHING: live t176, Lockheed Chemicals owed 944k/turn of tax on
  // 122k/turn of consolidated revenue — its chemical plants taxed gross
  // while its farming losses were invisible to the base, ~80% of all US
  // corporate tax from one structurally loss-making company. Standard
  // consolidated filing nets losses against profits within the group, so:
  // scale every sector's taxable income by consolidated ÷ gross-positive.
  // Per-sector state/country ATTRIBUTION is preserved proportionally; a
  // corp with no losing sectors has scale = 1 and is byte-identical.
  let grossPositiveTaxable = 0;
  let consolidatedNet = 0;
  for (const s of sectorResults) {
    const revenueShare = corpRevenue > 0 ? s.hourlyRevenue / corpRevenue : 0;
    const sectorNetIncome =
      s.hourlyRevenue * (s.effectiveMargin / 100) - corpLevelTaxCosts * revenueShare;
    consolidatedNet += sectorNetIncome;
    if (sectorNetIncome > 0) grossPositiveTaxable += sectorNetIncome;
  }
  const lossOffsetScale =
    grossPositiveTaxable > 0 ? Math.max(0, Math.min(1, consolidatedNet / grossPositiveTaxable)) : 0;

  for (const s of sectorResults) {
    const revenueShare = corpRevenue > 0 ? s.hourlyRevenue / corpRevenue : 0;
    const sectorOpIncome = s.hourlyRevenue * (s.effectiveMargin / 100);
    const sectorNetIncome = sectorOpIncome - corpLevelTaxCosts * revenueShare;
    const sectorTaxable = Math.max(0, sectorNetIncome) * lossOffsetScale;
    if (sectorTaxable <= 0) continue;
    // Domestic = corp HQ'd in the same country as this sector.
    // Foreign = corp HQ'd elsewhere; pays the host country's foreign rate.
    const isDomestic = corp.countryId === s.countryId;
    const federalRate =
      corpTaxMultiplier *
      (isDomestic
        ? (context.lookups.domesticCorpTaxRateByCountry.get(s.countryId) ?? 0)
        : (context.lookups.foreignCorpTaxRateByCountry.get(s.countryId) ?? 0));
    const stateRate =
      corpTaxMultiplier *
      (isDomestic
        ? (context.lookups.domesticStateCorpTaxRateByState.get(s.stateId) ?? 0)
        : (context.lookups.foreignStateCorpTaxRateByState.get(s.stateId) ?? 0));
    const fedTax = sectorTaxable * (federalRate / 100);
    const stTax = sectorTaxable * (stateRate / 100);
    totalFederalTax += fedTax;
    totalStateTax += stTax;
    const targetCountryMap = isDomestic ? taxPaidByCountryDomestic : taxPaidByCountryForeign;
    const targetStateMap = isDomestic ? taxPaidByStateDomestic : taxPaidByStateForeign;
    if (fedTax > 0) {
      taxPaidByCountry.set(s.countryId, (taxPaidByCountry.get(s.countryId) ?? 0) + fedTax);
      targetCountryMap.set(s.countryId, (targetCountryMap.get(s.countryId) ?? 0) + fedTax);
    }
    if (stTax > 0) {
      taxPaidByState.set(s.stateId, (taxPaidByState.get(s.stateId) ?? 0) + stTax);
      targetStateMap.set(s.stateId, (targetStateMap.get(s.stateId) ?? 0) + stTax);
    }
  }

  // Bond coupon income is taxed at the corp's home-country federal rate only
  // (state/regional never taxes bond interest — standard municipal-bond
  // convention extended to corporate holdings here). Added to totalFederalTax
  // so the deduction lands in `afterTaxOperating` alongside operating tax,
  // and recorded in `taxPaidByCountry` under the corp's home country so the
  // history breakdown attributes the revenue correctly.
  // Corp's home country — bond income is always domestic from the corp's perspective.
  // pass_through structures pay no corporate tax including on bond income (corpTaxMultiplier = 0).
  if (bondCouponFedTax > 0) {
    totalFederalTax += bondCouponFedTax;
    taxPaidByCountry.set(
      corp.countryId,
      (taxPaidByCountry.get(corp.countryId) ?? 0) + bondCouponFedTax
    );
    taxPaidByCountryDomestic.set(
      corp.countryId,
      (taxPaidByCountryDomestic.get(corp.countryId) ?? 0) + bondCouponFedTax
    );
  }

  // Pass-through owner tax: the owners owe tax on their full share of the
  // profit whether or not it is distributed, collected at source at the
  // owners' rates and credited to the home country and headquarters state.
  if (
    passThroughTaxMode(corpLegalStructure, corp) === "ownerFlowThrough" &&
    context.passThroughPhase > 0
  ) {
    const hqState = corp.headquartersState;
    const ownerRates = blendedOwnerRate(
      (corp.shareholders ?? []).map((sh) => ({
        personal: !!sh.characterId || !!sh.imperialCharacterId,
        shares: sh.shares,
      })),
      corp.totalShares ?? 0,
      {
        personalNationalPct:
          context.lookups.personalTopIncomeTaxRateByCountry?.get(corp.countryId) ?? 0,
        personalStatePct: hqState
          ? (context.lookups.personalTopIncomeTaxRateByState?.get(hqState) ?? 0)
          : 0,
        corporateNationalPct: context.lookups.domesticCorpTaxRateByCountry.get(corp.countryId) ?? 0,
        corporateStatePct: hqState
          ? (context.lookups.domesticStateCorpTaxRateByState.get(hqState) ?? 0)
          : 0,
      }
    );
    const ownerTax = passThroughOwnerTax({
      taxableProfit: netPassThroughProfit(consolidatedNet, perTurnBondCouponIncome),
      phase: context.passThroughPhase,
      rates: ownerRates,
    });
    if (ownerTax.national > 0) {
      totalFederalTax += ownerTax.national;
      taxPaidByCountry.set(
        corp.countryId,
        (taxPaidByCountry.get(corp.countryId) ?? 0) + ownerTax.national
      );
      taxPaidByCountryDomestic.set(
        corp.countryId,
        (taxPaidByCountryDomestic.get(corp.countryId) ?? 0) + ownerTax.national
      );
    }
    if (ownerTax.state > 0 && hqState) {
      totalStateTax += ownerTax.state;
      taxPaidByState.set(hqState, (taxPaidByState.get(hqState) ?? 0) + ownerTax.state);
      taxPaidByStateDomestic.set(
        hqState,
        (taxPaidByStateDomestic.get(hqState) ?? 0) + ownerTax.state
      );
    }
  }

  // State-owned enterprises pay no corporate income tax: the state already
  // receives their profit via the per-turn remittance, so taxing on top
  // charges one profit twice. Zero the accumulators AND the per-country maps
  // so neither the cash debit nor the tax-revenue credit records a charge.
  if (isStateOwned(corp)) {
    totalFederalTax = 0;
    totalStateTax = 0;
    taxPaidByCountry.clear();
    taxPaidByCountryDomestic.clear();
    taxPaidByCountryForeign.clear();
  }

  // Tax loss carryforward: bank this turn's loss, or offset part of this
  // turn's profit with banked losses (scaling every tax line alike).
  if (!isStateOwned(corp)) {
    const carry = applyLossCarryforward(
      consolidatedNet + Math.max(0, perTurnBondCouponIncome),
      openingCarryforward(corp.taxLossCarryforward, context.currentTurn)
    );
    if (carry.taxScale < 1) {
      totalFederalTax *= carry.taxScale;
      totalStateTax *= carry.taxScale;
      for (const map of [
        taxPaidByCountry,
        taxPaidByState,
        taxPaidByCountryDomestic,
        taxPaidByCountryForeign,
        taxPaidByStateDomestic,
        taxPaidByStateForeign,
      ]) {
        for (const [k, v] of map) map.set(k, v * carry.taxScale);
      }
    }
    const opening = openingCarryforward(corp.taxLossCarryforward, context.currentTurn);
    if (carry.closing !== opening || corp.taxLossCarryforward?.turn === context.currentTurn) {
      context.lossCarryforwardByCorpId.set(corp._id.toString(), {
        anchor: carry.closing,
        turn: context.currentTurn,
        before: opening,
      });
    }
  }

  const corporateTaxOwed = totalFederalTax + totalStateTax;
  const afterTaxOperating = incomePreDividends - corporateTaxOwed;
  const netIncomeBeforeDividends =
    afterTaxOperating + perTurnBondCouponIncome - perTurnBondDragOnNetIncome;

  // Capture realized margin for Business-Acumen growth tiering (CEO success).
  context.profitMarginByCorpId.set(
    corp._id.toString(),
    corpRevenue > 0 ? netIncomeBeforeDividends / corpRevenue : 0
  );

  // Dividend payouts: % of net income (after tax and bond interest / coupon / subsidy),
  // capped by that same net income so a corp distributes no more than it actually
  // earned this turn. The cap uses netIncomeBeforeDividends (which INCLUDES bond
  // coupon income), NOT operating-only afterTaxOperating: capping at operating
  // profit silently zeroed the payout for a corp whose profit comes from bond
  // holdings — it would pass the eligibility gate below (net income > 0) yet pay
  // nothing, breaking pass-through structures' "profits must be distributed"
  // contract. Bond coupon/interest settle in the bond phase (see `income` note
  // below), so distributing against net income never pays out borrowed/financing
  // cash — only realized earnings.
  // Hard-clamp to MAX_DIVIDEND_RATE so legacy corps set above the new cap are contained at turn time.
  const dividendRate = Math.min(corp.dividendRate ?? 0, MAX_DIVIDEND_RATE);
  let hourlyDividendPayout = 0;

  const shouldClearDividends =
    (dividendRate > 0 && netIncomeBeforeDividends < 0) || imfBailoutActive;
  const effectiveDividendRate = shouldClearDividends ? 0 : dividendRate;
  // For pass-through structures: enforce minimum payout without overwriting the stored dividendRate.
  const minDividendPct = (corpLegalStructure.minimumDividendRate ?? 0) * 100;
  // Honor a parent-set dividend floor only while the setter still controls
  // >50% voting power of this corp.
  const parentDividendFloorPct = activeParentDividendFloorPct({
    parentDividendFloorPct: corp.parentDividendFloorPct,
    parentDividendFloorSetByCorpId: corp.parentDividendFloorSetByCorpId,
    controllingParent: getControllingCorporateParent(corp),
    maxRate: MAX_DIVIDEND_RATE,
  });
  const payoutDividendRate = shouldClearDividends
    ? 0
    : Math.max(effectiveDividendRate, minDividendPct, parentDividendFloorPct);
  return {
    kind: "context" as const,
    context: {
      activeManufacturingProject,
      activeMediaProductProject,
      actualCeoSalary,
      afterTaxOperating,
      cashPayables,
      context,
      corp,
      corpCountryId,
      corpGrowthDenom,
      corpGrowthNumer,
      corpId,
      corpLegalStructure,
      corpRealOutput,
      corpRevenue,
      corpSectorNPV,
      corpWageWeight,
      corpWageWeighted,
      developmentProjects,
      diagTotalGrowthCost,
      diagWeightedCommodityInput,
      diagWeightedCommoditySurplus,
      diagWeightedExportPremium,
      diagWeightedLegacyStateMetrics,
      diagWeightedMacro,
      diagWeightedMargin,
      diagWeightedStateMetrics,
      genericResearchSpend,
      get hourlyDividendPayout() {
        return hourlyDividendPayout;
      },
      set hourlyDividendPayout(value: typeof hourlyDividendPayout) {
        hourlyDividendPayout = value;
      },
      hourlyLogistics,
      hourlyMarketing,
      imfBailoutActive,
      liquidCapitalAnchor,
      localFxRate,
      marketingBudgetAnchor,
      marketingSettlementEnabled,
      netIncomeBeforeDividends,
      payoutDividendRate,
      proposedResearchAllocation,
      resolvedHomeCurrency,
      sectorResults,
      sectors,
      shouldZeroCeoSalary,
      taxPaidByCountry,
      totalCorpCosts,
      costBreakdown,
      corpHeadcount,
      totalFederalTax,
      totalStateTax,
      incomePreDividends,
      perTurnBondCouponIncome,
      perTurnBondInterestExpense,
      perTurnBondDragOnNetIncome,
      taxPaidByState,
      taxPaidByCountryDomestic,
      taxPaidByCountryForeign,
      taxPaidByStateDomestic,
      taxPaidByStateForeign,
    },
  };
}
export type ProcessCorporationAccountStageContext = Extract<
  ReturnType<typeof prepareProcessCorporationAccount>,
  { kind: "context" }
>["context"];

export function processCorporationAccount(
  ...args: Parameters<typeof prepareProcessCorporationAccount>
): void {
  const prepared = prepareProcessCorporationAccount(...args);
  return closeCorporationAccount(prepared.context);
}
