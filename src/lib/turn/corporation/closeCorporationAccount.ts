import { planDividendAllocation } from "@/lib/corporations/rules/dividendAllocation";
import { corporatePayoutCash } from "@/lib/turn/corporation/rules/corporateTaxPriority";

import { holdingDividendSplit, positionHoldingTerms } from "@/lib/corporations/rules/holdingTerms";
import type { AnyBulkWriteOperation } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";

import { COUNTRY_CURRENCY_MAP, SECTOR_FX_SPREAD } from "@/lib/constants/currencies";
import {
  computeCorporateCreditAtTurn,
  corporateCashArrearsAnchor,
  sumCorporateSectorConstructionInProgress,
} from "@/lib/bonds/corporateCredit";
import { ceoOwnershipFraction } from "@/lib/corporations/ceoOwnership";
import {
  calcMarketingGrowth,
  calcLogisticsStrengthAfterTurn,
  calcRdScoreAfterTurn,
  rdMoraleFactor,
  TURNS_PER_DAY,
} from "@/lib/constants/corporations";
import { marketingStrengthAfterTurn } from "@/lib/corporations/strengthUpkeep";
import { managementOverheadPpForCorp } from "@/lib/turn/corporation/managementOverhead";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import {
  anchorToCorpCapital,
  corpCapitalToAnchor,
  fxRateForCorpFromMap,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { writeCorpEconomicLocal } from "@/lib/currency/corpEconomyFields";

import { indexFundOwnershipFraction } from "@/lib/corporations/indexOwnership";
import { getShareBuybackMode } from "@/lib/corporations/shareBuybackMode";
import { computeEscrowFundingTransfer } from "@/lib/corporations/escrowFunding";
import { pushEarningsHistory } from "@/lib/turn/corporation/earningsRollingAverage";
import { fundedCashIncome } from "@/lib/market/producerMarket/fundedSectorRules";

import { capManufacturingDevelopmentSpendToCash } from "@/lib/products/rules/manufacturingRules";

import { allocateProductAdvertisingBudget } from "@/lib/products/rules/productBudgets";
import {
  productAdvertisingDenominationWitness,
  quoteFundedProductAdvertising,
} from "@/lib/products/rules/productAdvertising";
import { alreadyTaxedDistributionShare } from "@/lib/corporations/rules/passThroughTax";

import type { ProcessCorporationAccountStageContext } from "@/lib/turn/corporation/processCorporationAccount";

export function closeCorporationAccount(context: ProcessCorporationAccountStageContext): void {
  if (
    !context.imfBailoutActive &&
    !context.cashPayables &&
    context.payoutDividendRate > 0 &&
    context.netIncomeBeforeDividends > 0 &&
    ((context.corp.shareholders?.length ?? 0) > 0 || (context.corp.publicFloat ?? 0) > 0)
  ) {
    const rawDividendPool = context.netIncomeBeforeDividends * (context.payoutDividendRate / 100);
    context.hourlyDividendPayout = Math.min(
      rawDividendPool,
      Math.max(0, context.netIncomeBeforeDividends),
      context.context.treasuryCashLedgerEnabled
        ? corporatePayoutCash({
            cash: context.liquidCapitalAnchor,
            income: context.afterTaxOperating,
            alreadySettled: context.context.funded?.settledProfitByCorp.get(context.corpId) ?? 0,
          })
        : Infinity
    );
    // Shares issued for an IPO but not yet placed have no holder and earn no dividend.
    const unplacedIpoShares =
      context.corp.pendingShareIssuance?.issuedUpfront &&
      context.corp.pendingShareIssuance.source === "ipo"
        ? context.corp.pendingShareIssuance.remainingShares
        : 0;
    const holderDividends = planDividendAllocation({
      pool: context.hourlyDividendPayout,
      totalShares: context.corp.totalShares ?? 10_000_000,
      publicFloat: context.corp.publicFloat ?? 0,
      unplacedIpoShares,
      holderShares: context.corp.shareholders.map((holder) => holder.shares),
    });
    const taxedAtSourceShare = alreadyTaxedDistributionShare(
      context.corpLegalStructure,
      context.context.passThroughPhase,
      context.corp
    );
    for (const [holderIndex, sh] of context.corp.shareholders.entries()) {
      const payment = holderDividends.holders[holderIndex];
      if (payment > 0) {
        if (sh.characterId) {
          (0, context.context.addToPaymentMap)(
            context.context.dividendPayments,
            sh.characterId.toString(),
            payment,
            context.corp.countryId
          );
          if (taxedAtSourceShare > 0) {
            (0, context.context.addToPaymentMap)(
              context.context.passThroughTaxedDividendPayments,
              sh.characterId.toString(),
              payment * taxedAtSourceShare,
              context.corp.countryId
            );
          }
          const capital = holdingDividendSplit(
            positionHoldingTerms(sh, context.context.currentTurn, 0),
            payment,
            context.context.currentTurn
          ).capital;
          (0, context.context.addToPaymentMap)(
            context.context.capitalDividendPayments,
            sh.characterId.toString(),
            capital,
            context.corp.countryId
          );
        } else if (sh.imperialCharacterId) {
          (0, context.context.addToPaymentMap)(
            context.context.dividendPayments,
            `imperial:${sh.imperialCharacterId.toString()}`,
            payment,
            context.corp.countryId
          );
          if (taxedAtSourceShare > 0) {
            (0, context.context.addToPaymentMap)(
              context.context.passThroughTaxedDividendPayments,
              `imperial:${sh.imperialCharacterId.toString()}`,
              payment * taxedAtSourceShare,
              context.corp.countryId
            );
          }
          const capital = holdingDividendSplit(
            positionHoldingTerms(sh, context.context.currentTurn, 0),
            payment,
            context.context.currentTurn
          ).capital;
          (0, context.context.addToPaymentMap)(
            context.context.capitalDividendPayments,
            `imperial:${sh.imperialCharacterId.toString()}`,
            capital,
            context.corp.countryId
          );
        } else if (sh.nppId) {
          (0, context.context.addToPaymentMap)(
            context.context.dividendPayments,
            `npp:${sh.nppId.toString()}`,
            payment,
            context.corp.countryId
          );
        } else if (sh.fundId) {
          context.context.fundDividendAccruals.push({
            fundId: sh.fundId,
            corporationId: context.corp._id,
            shares: sh.shares,
            amountAnchor: payment,
          });
        } else if (sh.corporationId) {
          const hid = sh.corporationId.toString();
          context.context.corpDividendPaymentsAnchorByCorpId.set(
            hid,
            (context.context.corpDividendPaymentsAnchorByCorpId.get(hid) ?? 0) + payment
          );
          if (taxedAtSourceShare > 0) {
            context.context.corpDividendTaxedAtSourceAnchorByCorpId.set(
              hid,
              (context.context.corpDividendTaxedAtSourceAnchorByCorpId.get(hid) ?? 0) +
                payment * taxedAtSourceShare
            );
          }
          // Track the same ₳ amount keyed by the paying corp's currency so the
          // recipient's cross-currency FX spread can be charged in Phase 3c.
          const payerCcy = (resolveCorpLiquidCurrencyCode(context.corp) ?? "USD") as CurrencyCode;
          const byCcy =
            context.context.corpDividendPaymentsAnchorByCorpCurrency.get(hid) ??
            new Map<CurrencyCode, number>();
          byCcy.set(payerCcy, (byCcy.get(payerCcy) ?? 0) + payment);
          context.context.corpDividendPaymentsAnchorByCorpCurrency.set(hid, byCcy);
        }
      }
    }
    const floatDividendAnchor = holderDividends.publicFloat;
    if (floatDividendAnchor > 0) {
      context.context.equityPoolDividendAccruals.push({
        corporationId: context.corp._id,
        currency: (context.resolvedHomeCurrency ?? "USD") as CurrencyCode,
        amountLocal: writeCorpEconomicLocal(
          floatDividendAnchor,
          context.resolvedHomeCurrency,
          context.localFxRate
        ),
      });
    }
  }

  // Final income after corporate tax and dividends (bond coupon/interest settle in bond turn)
  let income = context.afterTaxOperating - context.hourlyDividendPayout;

  // Operating income per source currency (₳, this turn) for the foreign-income
  // FX spread below. Keyed by the sector country's currency.
  const opIncomeByCcy = new Map<CurrencyCode, number>();
  let totalOpIncomeForCorp = 0;

  // Accumulate annualized operating income by sector country and operating state for the corporate-profits tax-base blend. Uses sectorOpIncome (pre-cost-allocation) so the jurisdiction-level base tracks economic activity, not the corp's overhead choices.
  for (const s of context.sectorResults) {
    const sectorOpIncome = s.hourlyRevenue * (s.effectiveMargin / 100);
    if (sectorOpIncome <= 0) continue;
    // Track per-currency operating income (this turn, ₳) for the FX spread.
    const sectorCcy = (COUNTRY_CURRENCY_MAP[s.countryId as keyof typeof COUNTRY_CURRENCY_MAP] ??
      context.resolvedHomeCurrency ??
      "USD") as CurrencyCode;
    opIncomeByCcy.set(sectorCcy, (opIncomeByCcy.get(sectorCcy) ?? 0) + sectorOpIncome);
    totalOpIncomeForCorp += sectorOpIncome;
    const annualized = sectorOpIncome * TURNS_PER_YEAR;
    const isDomestic = context.corp.countryId === s.countryId;
    const countryBucket = isDomestic
      ? context.context.domesticIncomeByCountry
      : context.context.foreignIncomeByCountry;
    const stateBucket = isDomestic
      ? context.context.domesticIncomeByOperatingState
      : context.context.foreignIncomeByOperatingState;
    countryBucket.set(s.countryId, (countryBucket.get(s.countryId) ?? 0) + annualized);
    stateBucket.set(s.stateId, (stateBucket.get(s.stateId) ?? 0) + annualized);
  }

  // Reduced FX spread on the foreign-currency portion of operating income
  // repatriated into the corp's home currency. Skimmed from `income` BEFORE it
  // credits liquidCapital / feeds credit + snapshots, so a corp can never be
  // pushed negative and downstream metrics stay consistent. Fees (in each
  // source currency) are routed to the CB system in index.ts.
  if (income > 0 && totalOpIncomeForCorp > 0 && context.resolvedHomeCurrency) {
    let sectorSpreadAnchor = 0;
    for (const [srcCcy, opAnchor] of opIncomeByCcy) {
      if (srcCcy === context.resolvedHomeCurrency || !(opAnchor > 0)) continue;
      const netForeignAnchor = income * (opAnchor / totalOpIncomeForCorp);
      const feeAnchor = netForeignAnchor * SECTOR_FX_SPREAD;
      if (feeAnchor <= 0) continue;
      sectorSpreadAnchor += feeAnchor;
      const srcRate = context.context.lookups.exchangeRatesByCurrency.get(srcCcy) ?? 1;
      const fee = Math.round(feeAnchor * (srcRate > 0 ? srcRate : 1));
      if (fee > 0) {
        context.context.sectorFxSpreadFees.push({
          fromCurrency: srcCcy,
          toCurrency: context.resolvedHomeCurrency as CurrencyCode,
          fee,
        });
      }
    }
    income -= sectorSpreadAnchor;
  }

  context.context.totalRevenueGenerated += context.corpRevenue;
  context.context.totalIncomeGenerated += income;

  // Marketing strength accumulation: base 1/turn + 0.5/turn per $100k, with diminishing returns.
  // Thresholds are ₳-calibrated ($100k anchor), so pass the anchor-normalized budget.
  const marketingGrowth = calcMarketingGrowth(
    context.marketingSettlementEnabled
      ? context.hourlyMarketing * TURNS_PER_DAY
      : context.marketingBudgetAnchor,
    context.corp.marketingStrength ?? 0
  );
  // Strength upkeep (stage 3): marketing strength decays like R&D, so it has
  // to be maintained with spend rather than banked.
  const currentMarketingStrength = context.corp.marketingStrength ?? 0;
  const marketingDelta =
    marketingStrengthAfterTurn(
      currentMarketingStrength,
      marketingGrowth,
      context.context.lookups.strengthUpkeepStage
    ) - currentMarketingStrength;

  // Logistics strength: decays 5%/turn, grows with spending. No diminishing
  // returns, the decay naturally caps accumulation. Same anchor-threshold
  // convention. Grow on what was actually charged, not what was requested;
  // feeding raw budget lets an unpayable budget buy strength for free.
  const currentLogisticsStrength = context.corp.logisticsStrength ?? 0;
  const newLogisticsStrength = calcLogisticsStrengthAfterTurn(
    currentLogisticsStrength,
    context.hourlyLogistics * TURNS_PER_DAY
  );
  const logisticsDelta = newLogisticsStrength - currentLogisticsStrength;

  // R&D score: decays 3%/turn, grows with spending. Diminishing returns on stored
  // score above 100 (mirrors marketing). Drives innovation probability and boost magnitude.
  // Grows on generic R&D only. Product development is handled as guarded
  // capitalized cash spend below and cannot also earn generic research score.
  const currentRdScore = context.corp.rdScore ?? 0;
  // moraleFactor (#84, ±15%) rewards paying workers above baseline: happier
  // workers convert R&D spend more efficiently. Neutral when labour is off.
  const avgWageLevel =
    context.corpWageWeight > 0 ? context.corpWageWeighted / context.corpWageWeight : 1;
  const moraleFactor = rdMoraleFactor(avgWageLevel);
  const newRdScore = calcRdScoreAfterTurn(
    currentRdScore,
    context.genericResearchSpend * TURNS_PER_DAY * moraleFactor
  );
  const rdScoreDelta = newRdScore - currentRdScore;

  // The bulk cash transfer below owns the debit for a filled advertising
  // order. Add back only that buyer's settled accounting expense here so the
  // pre-settlement cash leg is charged exactly once after the transfer lands.
  // With no sellers there is no transfer and the ordinary expense remains.
  const legacyCashIncome =
    income +
    (context.context.marketingSpendAnchorByBuyerId.has(context.corpId)
      ? context.hourlyMarketing
      : 0);
  const cashIncomeBeforeMarketingSettlement = context.context.funded
    ? fundedCashIncome(
        legacyCashIncome,
        context.context.funded.settledProfitByCorp.get(context.corpId) ?? 0
      )
    : legacyCashIncome;
  const incomeForBalance = anchorToCorpCapital(
    cashIncomeBeforeMarketingSettlement,
    context.resolvedHomeCurrency,
    context.localFxRate
  );

  // Per-turn escrow funding (escrow mode only): move configured cash from
  // treasury into market-making escrow. Both fields are corp-local, a 1:1
  // local move. Escrow is not a share-price valuation input, so funding it
  // lowers liquidCapital and the tangible-book floor: not price-neutral.
  // Only persisted liquidCapital/escrow need reflect the move here.
  // `incomeForBalance` is the pre-settlement local-currency cash delta used
  // by this bulk op and the initial snapshot.
  const escrowFundingMove =
    !context.cashPayables &&
    !(context.corp.pendingOperatingCash! > 0) &&
    !context.context.equityMarketPoolCurrencies.has(
      (context.resolvedHomeCurrency ?? "USD") as CurrencyCode
    ) &&
    getShareBuybackMode(context.corp) === "escrow"
      ? computeEscrowFundingTransfer({
          fundingPerTurn: context.corp.escrowFundingPerTurn,
          liquidCapital: context.corp.liquidCapital + incomeForBalance,
        })
      : 0;
  const freshDevelopmentProjects = context.developmentProjects.filter((project) =>
    project.id === context.activeManufacturingProject?._id
      ? context.corp.manufacturingProductDevelopmentPaidTurnV2 !== context.context.currentTurn &&
        !context.corp.manufacturingProductDevelopmentReceiptV2
      : context.corp.mediaProductDevelopmentPaidTurnV1 !== context.context.currentTurn &&
        !context.corp.mediaProductDevelopmentReceiptV1
  );
  const desiredDevelopmentAnchor = freshDevelopmentProjects.reduce(
    (sum, project) => sum + (context.proposedResearchAllocation.byProjectId[project.id] ?? 0),
    0
  );
  const productDevelopmentSpendAnchor = capManufacturingDevelopmentSpendToCash({
    proposedDevelopmentAnchor: desiredDevelopmentAnchor,
    liquidCapitalAnchor: context.liquidCapitalAnchor,
    incomeBeforeDevelopmentAnchor:
      income -
      corpCapitalToAnchor(escrowFundingMove, context.resolvedHomeCurrency, context.localFxRate),
  });
  const developmentScale =
    desiredDevelopmentAnchor > 0 ? productDevelopmentSpendAnchor / desiredDevelopmentAnchor : 0;

  // Share price is finalized after all corps are processed (iterative cross-holding quotes).
  const totalShares = context.corp.totalShares ?? 10_000_000;
  const endLiquidAnchor = context.liquidCapitalAnchor + cashIncomeBeforeMarketingSettlement;
  /** Placeholder until cross-holding iteration writes the real price into corpOps. */
  const placeholderSharePrice = Number.isFinite(context.corp.sharePrice)
    ? context.corp.sharePrice
    : 0.1;

  const advertisingProjects = [
    ...(context.activeMediaProductProject?.stage === "development" &&
    !context.corp.mediaProductAdvertisingObligationsV1?.length &&
    !context.corp.mediaProductAdvertisingReceiptV1
      ? [
          {
            id: context.activeMediaProductProject._id,
            share: context.activeMediaProductProject.allocationShare,
          },
        ]
      : []),
    ...(context.activeManufacturingProject?.stage === "development" &&
    !context.corp.manufacturingProductAdvertisingObligationsV2?.length &&
    !context.corp.manufacturingProductAdvertisingReceiptV2
      ? [
          {
            id: context.activeManufacturingProject._id,
            share: context.activeManufacturingProject.advertisingAllocationShare ?? 0,
          },
        ]
      : []),
  ];
  const advertisingAllocations = allocateProductAdvertisingBudget({
    deliveredBudgetAnchor: context.context.marketingSpendAnchorByBuyerId.get(context.corpId) ?? 0,
    projects: advertisingProjects,
  });
  if (
    Number.isSafeInteger(context.context.currentTurn) &&
    context.context.totalAdvertisingDeliveredValueAnchor > 0
  ) {
    const currencyCode = context.resolvedHomeCurrency ?? "USD";
    const sellerQuotes = context.context.advertisingSellerDeliveredValues.flatMap(
      ([sellerId, value]) => {
        const seller = context.context.lookups.corpById.get(sellerId);
        if (!seller) return [];
        return [
          {
            corporationId: sellerId,
            deliveredValueAnchor: value,
            currencyCode: resolveCorpLiquidCurrencyCode(seller) ?? "USD",
            localPerAnchor: fxRateForCorpFromMap(
              seller,
              context.context.lookups.exchangeRatesByCurrency
            ),
            ...productAdvertisingDenominationWitness(seller),
          },
        ];
      }
    );
    const buyerDenomination = productAdvertisingDenominationWitness(context.corp);
    for (const project of advertisingProjects) {
      const quote = quoteFundedProductAdvertising({
        amountAnchor: advertisingAllocations[project.id] ?? 0,
        buyer: {
          corporationId: context.corpId,
          currencyCode,
          localPerAnchor: context.localFxRate,
          ...buyerDenomination,
        },
        sellers: sellerQuotes,
      });
      if (!quote) continue;
      const obligation = { projectId: project.id, turn: context.context.currentTurn, ...quote };
      if (project.id === context.activeManufacturingProject?._id)
        context.context.manufacturingAdvertisingObligationByBuyerId.set(context.corpId, obligation);
      else context.context.mediaAdvertisingObligationByBuyerId.set(context.corpId, obligation);
      context.context.productAdvertisingAnchorByBuyerId.set(
        context.corpId,
        (context.context.productAdvertisingAnchorByBuyerId.get(context.corpId) ?? 0) +
          quote.amountAnchor
      );
    }
  }
  const participatesInMediaAdSettlement =
    ((context.context.lookups.mediaProductSlatesEnabled === true &&
      (context.context.lookups.mediaProductDevelopmentByCorpId?.size ?? 0) > 0) ||
      context.context.manufacturingAdvertisingActive) &&
    Number.isSafeInteger(context.context.currentTurn) &&
    (context.context.marketingSpendAnchorByBuyerId.has(context.corpId) ||
      context.context.advertisingSellerCorpIds.has(context.corpId));

  // Split escalation decay: reduce by 1 each turn (minimum 0)
  const currentEscalation = context.corp.splitEscalation ?? 0;
  const newEscalation = Math.max(0, currentEscalation - 1);

  // Credit math lives in ₳: liquidCapital normalized to ₳, plus per-turn income (₳).
  // `fxByCurrency` lets the scorer anchor-normalize bond principal / coupon so
  // debt/equity and interest-coverage ratios compare coherent units.
  const bondList = context.context.lookups.bondsByCorpId.get(context.corp._id.toString()) ?? [];

  const creditPack = computeCorporateCreditAtTurn({
    liquidCapitalAnchor: endLiquidAnchor,
    incomePerTurn: income,
    sectorNpv: context.corpSectorNPV,
    bonds: bondList,
    corporationId: context.corp._id,
    currentTurn: context.context.currentTurn,
    bondDefaultCreditPenaltyUntilTurn: context.corp.bondDefaultCreditPenaltyUntilTurn,
    previousCompositeScore: context.corp.creditCompositeSnapshot ?? undefined,
    fxByCurrency: context.context.lookups.exchangeRatesByCurrency,
    ceoOwnershipFraction: ceoOwnershipFraction(context.corp),
    // Suggestion #62: index-fund ownership earns a one-notch credit upgrade,
    // netted against the insider-concentration downgrade above.
    indexFundOwnershipFraction: indexFundOwnershipFraction(context.corp),
    isPrivate: context.corp.isPrivate ?? false,
    // P3a: capitalized build spend is an asset. `computeCorporateCreditAtTurn`
    // grew this leg but no production call site passed it, so a corp that had
    // just paid into a plant still read as having destroyed that equity and
    // got downgraded for investing — the exact failure the parameter exists to
    // prevent. 0 for every pre-P3a corp, so non-plants ratings are unchanged.
    constructionInProgressAnchor: sumCorporateSectorConstructionInProgress(
      context.sectors,
      context.corp._id,
      context.context.currentTurn
    ),
    otherLiabilitiesAnchor:
      corporateCashArrearsAnchor({
        operatingByCurrency: context.corp.operatingCashArrearsByCurrency,
        federalTaxByCountryAnchor: context.corp.federalTaxArrearsAnchorByCountry,
        fxByCurrency: context.context.lookups.exchangeRatesByCurrency,
      }) +
      (context.context.lookups.constructionLoanDebtByCorpId?.get(context.corp._id.toString()) ?? 0),
  });

  // Capture snapshot for history charts + credit time series
  context.context.corpSnapshots.push({
    corpId: context.corp._id,
    revenue: context.corpRevenue,
    totalCosts: context.totalCorpCosts,
    incomePreDividends: context.incomePreDividends,
    income,
    operatingCashIncomeLocal: incomeForBalance,
    ...(context.context.funded
      ? {
          settledProducerProfitAnchor:
            context.context.funded.settledProfitByCorp.get(context.corpId) ?? 0,
        }
      : {}),
    operatingCashCurrency: context.resolvedHomeCurrency,
    federalTaxByCountryAnchor: new Map(context.taxPaidByCountry),
    operatingCashLocalPerAnchor: context.localFxRate,
    perTurnBondCouponIncome: context.perTurnBondCouponIncome,
    perTurnBondInterestExpense: context.perTurnBondInterestExpense,
    perTurnBondDragOnNetIncome: context.perTurnBondDragOnNetIncome,
    liquidCapitalAnchorAfterIncome: endLiquidAnchor,
    dividendPaidPerTurn: context.hourlyDividendPayout,
    federalTaxPaid: context.totalFederalTax,
    stateTaxPaid: context.totalStateTax,
    taxPaidByCountry: context.taxPaidByCountry,
    taxPaidByState: context.taxPaidByState,
    taxPaidByCountryDomestic: context.taxPaidByCountryDomestic,
    taxPaidByCountryForeign: context.taxPaidByCountryForeign,
    taxPaidByStateDomestic: context.taxPaidByStateDomestic,
    taxPaidByStateForeign: context.taxPaidByStateForeign,
    marketingStrength: currentMarketingStrength + marketingDelta,
    logisticsStrength: Math.round(newLogisticsStrength * 100) / 100,
    rdScore: Math.round(newRdScore * 100) / 100,
    dividendRate: context.payoutDividendRate,
    // Snapshot mirrors the DB field: home currency post-migration, ₳ pre-migration.
    // Escrow funding leaves the treasury this turn, so reflect it in the snapshot.
    liquidCapital: context.corp.liquidCapital + incomeForBalance - escrowFundingMove,
    escrowFundingMove,
    escrowBalanceAfter: (context.corp.shareEscrowBalance ?? 0) + escrowFundingMove,
    actualSharePrice: placeholderSharePrice,
    totalShares,
    sectorNPV: context.corpSectorNPV,
    ...((context.context.lookups.fundedValuationStage ?? 0) >= 1 && context.context.funded
      ? { realOutputAnchor: context.corpRealOutput }
      : {}),
    creditComposite: creditPack.creditRating.compositeScore,
    creditRating: creditPack.creditRating.rating,
    marginDiagnostic:
      context.corpRevenue > 0
        ? {
            effectiveMargin:
              Math.round((context.diagWeightedMargin / context.corpRevenue) * 100) / 100,
            commodityInputMod:
              Math.round((context.diagWeightedCommodityInput / context.corpRevenue) * 100) / 100,
            commoditySurplusMod:
              Math.round((context.diagWeightedCommoditySurplus / context.corpRevenue) * 100) / 100,
            exportPremiumMod:
              Math.round((context.diagWeightedExportPremium / context.corpRevenue) * 100) / 100,
            macroMod: Math.round((context.diagWeightedMacro / context.corpRevenue) * 100) / 100,
            stateMetricsMod:
              Math.round((context.diagWeightedStateMetrics / context.corpRevenue) * 100) / 100,
            legacyStateMetricsMod:
              Math.round((context.diagWeightedLegacyStateMetrics / context.corpRevenue) * 100) /
              100,
            growthCostRatio:
              Math.round((context.diagTotalGrowthCost / context.corpRevenue) * 10000) / 10000,
            sectorCount: context.sectors.length,
          }
        : undefined,
  });

  // Push this turn's annualized after-tax income into the rolling history.
  const annualIncomeBase = context.netIncomeBeforeDividends * TURNS_PER_YEAR;
  const updatedEarningsHistory = pushEarningsHistory(
    context.corp.earningsHistory,
    annualIncomeBase
  );
  context.context.updatedEarningsHistoryByCorpId.set(context.corpId, updatedEarningsHistory);
  context.context.corpGrowthNumerByCorpId.set(context.corpId, context.corpGrowthNumer);
  context.context.corpGrowthDenomByCorpId.set(context.corpId, context.corpGrowthDenom);

  // $inc operates on the DB field directly — must match its denomination.
  // Post-migration corps hold liquidCapital in local currency; `incomeForBalance`
  // (computed above) is the ₳ income converted to local. Escrow funding nets out
  // of liquidCapital and into shareEscrowBalance (escrow mode only).
  context.context.corpOps.push({
    updateOne: {
      filter: {
        _id: context.corp._id,
        ...(participatesInMediaAdSettlement
          ? { advertisingMarketSettledTurnV1: { $ne: context.context.currentTurn } }
          : {}),
      },
      update: {
        $inc: {
          liquidCapital:
            (context.context.treasuryCashLedgerEnabled ? 0 : incomeForBalance) - escrowFundingMove,
          ...(escrowFundingMove > 0 ? { shareEscrowBalance: escrowFundingMove } : {}),
          marketingStrength: marketingDelta,
          logisticsStrength: logisticsDelta,
          rdScore: rdScoreDelta,
        },
        $set: {
          earningsHistory: updatedEarningsHistory,
          sharePrice: placeholderSharePrice,
          splitEscalation: newEscalation,
          // Applied management overhead (group basis when on), for the sector page.
          managementOverheadPp: managementOverheadPpForCorp(context.corp, context.context.lookups),
          countryId: context.corpCountryId,
          updatedAt: context.context.now,
          creditRatingSnapshot: creditPack.creditRating.rating,
          creditCompositeSnapshot: creditPack.creditRating.compositeScore,
          creditSnapshotTurn: context.context.currentTurn,
          creditRatingComponents: creditPack.creditRating.components,
          ...(participatesInMediaAdSettlement
            ? { advertisingMarketSettledTurnV1: context.context.currentTurn }
            : {}),
          // `shouldClearDividends` already zeroes THIS turn's payout when net income
          // dips negative; persisting `dividendRate: 0` would permanently overwrite the
          // CEO's chosen policy after one bad turn. Only an active IMF bailout should
          // force-clear the stored rate.
          ...(context.imfBailoutActive
            ? { dividendRate: 0, lastDividendChange: context.context.now }
            : {}),
          ...((context.shouldZeroCeoSalary && !context.cashPayables) || context.imfBailoutActive
            ? { ceoSalary: 0 }
            : {}),
          ...(context.context.lossCarryforwardByCorpId.has(context.corpId)
            ? { taxLossCarryforward: context.context.lossCarryforwardByCorpId.get(context.corpId) }
            : {}),
        },
        ...(context.context.mediaAdvertisingObligationByBuyerId.has(context.corpId) ||
        context.context.manufacturingAdvertisingObligationByBuyerId.has(context.corpId)
          ? {
              $push: {
                ...(context.context.mediaAdvertisingObligationByBuyerId.has(context.corpId)
                  ? {
                      mediaProductAdvertisingObligationsV1:
                        context.context.mediaAdvertisingObligationByBuyerId.get(context.corpId),
                    }
                  : {}),
                ...(context.context.manufacturingAdvertisingObligationByBuyerId.has(context.corpId)
                  ? {
                      manufacturingProductAdvertisingObligationsV2:
                        context.context.manufacturingAdvertisingObligationByBuyerId.get(
                          context.corpId
                        ),
                    }
                  : {}),
              },
            }
          : {}),
      },
    },
  });

  for (const project of freshDevelopmentProjects) {
    const amountAnchor =
      (context.proposedResearchAllocation.byProjectId[project.id] ?? 0) * developmentScale;
    if (!(amountAnchor > 0)) continue;
    const amountLocal = anchorToCorpCapital(
      amountAnchor,
      context.resolvedHomeCurrency,
      context.localFxRate
    );
    const manufacturing = project.id === context.activeManufacturingProject?._id;
    const paidTurnField = manufacturing
      ? "manufacturingProductDevelopmentPaidTurnV2"
      : "mediaProductDevelopmentPaidTurnV1";
    const receiptField = manufacturing
      ? "manufacturingProductDevelopmentReceiptV2"
      : "mediaProductDevelopmentReceiptV1";
    const witness = productAdvertisingDenominationWitness(context.corp);
    const frozenConditions = [
      ...(witness.liquidCurrencyCodePresent
        ? [
            { liquidCurrencyCode: witness.liquidCurrencyCode },
            { liquidCurrencyCode: { $exists: true } },
          ]
        : [{ liquidCurrencyCode: { $exists: false } }]),
      ...(witness.countryIdPresent
        ? [{ countryId: witness.countryId }, { countryId: { $exists: true } }]
        : [{ countryId: { $exists: false } }]),
    ];
    context.context.manufacturingDevelopmentCashOps.push({
      updateOne: {
        filter: {
          _id: context.corp._id,
          [paidTurnField]: { $ne: context.context.currentTurn },
          [receiptField]: { $exists: false },
          $and: frozenConditions,
          $expr: { $gte: [{ $ifNull: ["$liquidCapital", 0] }, amountLocal] },
        },
        update: {
          $inc: { liquidCapital: -amountLocal },
          $set: {
            [paidTurnField]: context.context.currentTurn,
            [receiptField]: {
              projectId: project.id,
              turn: context.context.currentTurn,
              amountAnchor,
              ...(manufacturing ? {} : { deliveredAdvertisingAnchor: 0 }),
            },
          },
        },
      },
    } as AnyBulkWriteOperation<Corporation>);
  }

  // Track CEO salary payment (uses capped amount, not requested)
  if (context.actualCeoSalary > 0 && context.corp.ceoId) {
    if (context.corp.ceoType === "npp") {
      // NPP CEOs accumulate salary in their funds field
      const nppId = context.corp.ceoId.toString();
      (0, context.context.addToPaymentMap)(
        context.context.dividendPayments,
        `npp:${nppId}`,
        context.actualCeoSalary,
        context.corp.countryId
      );
    } else {
      const key =
        context.corp.ceoType === "imperial"
          ? `imperial:${context.corp.ceoId.toString()}`
          : context.corp.ceoId.toString();
      (0, context.context.addToPaymentMap)(
        context.context.ceoSalaryPayments,
        key,
        context.actualCeoSalary,
        context.corp.countryId
      );
    }
  }
}
