import { processCorporationAccount } from "./processCorporationAccount";

import { holdingMaturationWrites } from "@/lib/turn/corporation/holdingMaturationWrites";

import { formalizedSubsidiaryCountByParentId } from "@/lib/corporations/subsidiaries/helpers";
import type { AnyBulkWriteOperation } from "mongodb";
import type { Corporation } from "@/lib/db/types";

import {
  computeCorporateCreditAtTurn,
  corporateCashArrearsAnchor,
  sumCorporateSectorConstructionInProgress,
} from "@/lib/bonds/corporateCredit";
import { ceoOwnershipFraction } from "@/lib/corporations/ceoOwnership";
import { TURNS_PER_DAY, getSectorRiskPremium } from "@/lib/constants/corporations";

import { valuationCashAnchor } from "@/lib/corporations/honestBalanceSheets";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import {
  anchorToCorpCapital,
  corpCapitalToAnchor,
  fxRateForCorpFromMap,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor, writeCorpEconomicLocal } from "@/lib/currency/corpEconomyFields";
import { resolveWageIndex, resolveAutomationIndex } from "@/lib/labour/laborCost";

import { computeTechAssetValueAnchor } from "@/lib/corporations/techAssetValue";
import { bankEquity } from "@/lib/banking/balanceSheet";
import { bankNpvFromPerTurnIncome } from "@/lib/banking/valuation";
import { bankIncomeIncludingUnbookedSovereignAssets } from "@/lib/banking/rules/sovereignClaims";

import { indexFundOwnershipFraction } from "@/lib/corporations/indexOwnership";
import { getCountryConfig } from "@/lib/constants/countries";
import type { SectorCalculationsResult } from "@/lib/turn/corporation/types";
import { imfFacilityPaymentAnchorPerTurn } from "@/lib/imf/imfFacilityFinancials";
import { computeSharePrices, type SharePriceInput } from "@/lib/turn/corporation/sharePriceFormula";

import { normalizedEarningsFromHistory } from "@/lib/turn/corporation/earningsRollingAverage";
import { applyEquityMethodEarnings } from "@/lib/turn/corporation/equityMethodEarnings";
import { fundedSectorOpsAll } from "@/lib/market/producerMarket/fundedSectorRules";

import {
  addCorpToCorpSettlement,
  type SettleCorpInfo,
} from "@/lib/turn/corporation/settleSupplyAgreements";

import type { ProcessSectorsStageContext } from "@/lib/turn/corporation/sectorCalculations";

export function settleCorporationAccounts(
  context: ProcessSectorsStageContext
): SectorCalculationsResult {
  const funded = context.funded;

  for (const corp of context.lookups.corporations) {
    processCorporationAccount(context, corp);
  }

  for (const op of context.sectorOps) {
    const assessment = context.sectorTaxAssessmentsById.get(op.updateOne.filter._id.toHexString());
    if (assessment) op.updateOne.update.$set.corporateTaxAssessment = assessment;
  }

  // Route only the clearing value of delivered advertising. Buyer shares are
  // already capped above, so unfilled budget remains in treasury. Pair legs
  // stay unrounded until every corporation's transfers have been aggregated,
  // preventing small buyers from losing every sub-unit seller allocation.
  const politicalSellerPayouts = context.market.politicalAdSellerPayoutLocalByCorpId ?? new Map();
  if (
    (context.marketingSpendAnchorByBuyerId.size > 0 &&
      context.totalAdvertisingDeliveredValueAnchor > 0) ||
    politicalSellerPayouts.size > 0
  ) {
    const marketingDeltasLocal = new Map<string, number>();
    const corpInfo = (corpId: string): SettleCorpInfo | undefined => {
      const corp = context.lookups.corpById.get(corpId);
      if (!corp) return undefined;
      return {
        _id: corp._id,
        name: corp.name,
        ccy: resolveCorpLiquidCurrencyCode(corp),
        fxRate: fxRateForCorpFromMap(corp, context.lookups.exchangeRatesByCurrency),
      };
    };
    if (context.totalAdvertisingDeliveredValueAnchor > 0) {
      // Every buyer pays every seller, so the per-corp settlement info (a
      // currency and FX resolution) is read once per corp rather than once per
      // pair, in the same order the pair loop read it.
      const sellerInfos = context.advertisingSellerDeliveredValues.map(
        ([sellerId, deliveredValueAnchor]) => ({
          sellerId,
          deliveredValueAnchor,
          seller: corpInfo(sellerId),
        })
      );
      for (const [buyerId, spendAnchor] of context.marketingSpendAnchorByBuyerId) {
        const buyer = corpInfo(buyerId);
        if (!buyer) continue;
        const deferredTitleAnchor = Math.min(
          spendAnchor,
          context.productAdvertisingAnchorByBuyerId.get(buyerId) ?? 0
        );
        const ordinarySpendAnchor = Math.max(0, spendAnchor - deferredTitleAnchor);
        let allocatedAnchor = 0;
        for (let i = 0; i < sellerInfos.length; i++) {
          const { sellerId, deliveredValueAnchor, seller } = sellerInfos[i];
          if (!seller) continue;
          const amountAnchor =
            i === sellerInfos.length - 1
              ? ordinarySpendAnchor - allocatedAnchor
              : ordinarySpendAnchor *
                (deliveredValueAnchor / context.totalAdvertisingDeliveredValueAnchor);
          allocatedAnchor += amountAnchor;
          if (amountAnchor <= 0) continue;
          addCorpToCorpSettlement(
            marketingDeltasLocal,
            buyerId,
            buyer,
            sellerId,
            seller,
            amountAnchor
          );
        }
      }
    }
    // Net the settled advertising out of each seller's CASH leg. The seller
    // already booked this advertising as ordinary sector revenue, so income and
    // tax keep it; crediting the transfer receipt ON TOP double-pays it in cash
    // (once through revenue → liquidCapital, once through this settlement). This
    // mirrors the buyer's cost add-back above, which defers the marketing DEBIT
    // to this same transfer so the cost lands exactly once: here we defer the
    // seller's advertising CREDIT the same way, removing its delivered value
    // from cash so the transfer receipt is its only ad cash. When budgets fund
    // the delivered book the receipt equals the delivered value and the two
    // cancel (money conserved); a funding shortfall (delivered > funded) leaves
    // the unpaid remainder as bad debt on the seller, never minted cash.
    if (context.totalAdvertisingDeliveredValueAnchor > 0) {
      for (const [sellerId, deliveredValueAnchor] of context.advertisingSellerDeliveredValues) {
        const seller = corpInfo(sellerId);
        if (!seller) continue;
        const deliveredLocal = anchorToCorpCapital(deliveredValueAnchor, seller.ccy, seller.fxRate);
        if (!Number.isFinite(deliveredLocal)) continue;
        marketingDeltasLocal.set(
          sellerId,
          (marketingDeltasLocal.get(sellerId) ?? 0) - deliveredLocal
        );
      }
    }
    for (const [sellerId, deliveredLocal] of politicalSellerPayouts) {
      if (!Number.isFinite(deliveredLocal) || deliveredLocal <= 0) continue;
      marketingDeltasLocal.set(
        sellerId,
        (marketingDeltasLocal.get(sellerId) ?? 0) - deliveredLocal
      );
    }
    for (let i = 0; i < context.lookups.corporations.length; i++) {
      const corp = context.lookups.corporations[i];
      const corpId = corp._id.toString();
      const delta = marketingDeltasLocal.get(corpId) ?? 0;
      if (delta === 0) continue;
      const update = context.corpOps[i].updateOne.update;
      update.$inc.liquidCapital = (update.$inc.liquidCapital ?? 0) + delta;

      // Snapshots must include the cash adjustment already queued in the bulk write.
      const snapshot = context.corpSnapshots[i];
      snapshot.operatingCashAdjustmentLocal = (snapshot.operatingCashAdjustmentLocal ?? 0) + delta;
      const code = resolveCorpLiquidCurrencyCode(corp);
      const rate = fxRateForCorpFromMap(corp, context.lookups.exchangeRatesByCurrency);
      snapshot.liquidCapital += delta;
      snapshot.liquidCapitalAnchorAfterIncome += corpCapitalToAnchor(delta, code, rate);

      const creditPack = computeCorporateCreditAtTurn({
        liquidCapitalAnchor: snapshot.liquidCapitalAnchorAfterIncome,
        incomePerTurn: snapshot.income,
        sectorNpv: snapshot.sectorNPV,
        bonds: context.lookups.bondsByCorpId.get(corp._id.toString()) ?? [],
        corporationId: corp._id,
        currentTurn: context.currentTurn,
        bondDefaultCreditPenaltyUntilTurn: corp.bondDefaultCreditPenaltyUntilTurn,
        previousCompositeScore: corp.creditCompositeSnapshot ?? undefined,
        fxByCurrency: context.lookups.exchangeRatesByCurrency,
        ceoOwnershipFraction: ceoOwnershipFraction(corp),
        indexFundOwnershipFraction: indexFundOwnershipFraction(corp),
        isPrivate: corp.isPrivate ?? false,
        constructionInProgressAnchor: sumCorporateSectorConstructionInProgress(
          context.lookups.sectorsByCorp.get(corp._id.toString()) ?? [],
          corp._id,
          context.currentTurn
        ),
        otherLiabilitiesAnchor:
          corporateCashArrearsAnchor({
            producerPayables: corp.producerPayables?.claims,
            operatingByCurrency: corp.operatingCashArrearsByCurrency,
            federalTaxByCountryAnchor: corp.federalTaxArrearsAnchorByCountry,
            fxByCurrency: context.lookups.exchangeRatesByCurrency,
          }) + (context.lookups.corporateLoanDebtByCorpId?.get(corp._id.toString()) ?? 0),
      });
      snapshot.creditComposite = creditPack.creditRating.compositeScore;
      snapshot.creditRating = creditPack.creditRating.rating;
      update.$set.creditRatingSnapshot = creditPack.creditRating.rating;
      update.$set.creditCompositeSnapshot = creditPack.creditRating.compositeScore;
      update.$set.creditRatingComponents = creditPack.creditRating.components;
    }
  }

  const lenderReceiptsAnchorByCorpId = new Map<string, number>();
  for (let i = 0; i < context.lookups.corporations.length; i++) {
    const corp = context.lookups.corporations[i];
    const snap = context.corpSnapshots[i];
    if (!corp.imfBailoutActive || !corp.imfBailoutImfCorporationId) continue;
    const pay = imfFacilityPaymentAnchorPerTurn(corp, snap.income);
    if (pay <= 1e-9) continue;
    const lid = corp.imfBailoutImfCorporationId.toString();
    lenderReceiptsAnchorByCorpId.set(lid, (lenderReceiptsAnchorByCorpId.get(lid) ?? 0) + pay);
  }

  // Build equity-adjusted earnings map via a single forward pass (no circular iteration).
  // Cross-corp holdings contribute proportional BASE earnings; the adjusted values are
  // only used for the share-price formula, not re-fed into each other.
  const baseEarningsMap = new Map<string, number>();
  for (const [cId, history] of context.updatedEarningsHistoryByCorpId) {
    baseEarningsMap.set(cId, normalizedEarningsFromHistory(history));
  }
  // Banking income is earned after the corporation pass and lives in the
  // ring-fenced charter, so it is not part of the corporation's rolling
  // earningsHistory. Add the realized annual bank result explicitly rather
  // than leaving a profitable bank invisible to the earnings component.
  for (const corp of context.lookups.corporations) {
    const charter = corp.bankCharter?.status === "active" ? corp.bankCharter : null;
    if (!charter) continue;
    const bankFxRate = context.lookups.exchangeRatesByCurrency.get(charter.currency) ?? 1;
    const bankIncomeAnchor = bankIncomeIncludingUnbookedSovereignAssets(charter) / bankFxRate;
    const id = corp._id.toString();
    baseEarningsMap.set(id, (baseEarningsMap.get(id) ?? 0) + bankIncomeAnchor * TURNS_PER_YEAR);
  }
  const totalSharesById = new Map<string, number>(
    context.lookups.corporations.map((c) => [c._id.toString(), c.totalShares ?? 10_000_000])
  );
  const adjustedEarningsMap = applyEquityMethodEarnings(
    baseEarningsMap,
    context.lookups.crossCorpStockHoldingsByHolderCorpId,
    totalSharesById
  );

  // Build per-corp inputs for the three-component fundamental formula.
  // Currency note: the formula operates ENTIRELY in ₳ — previousSharePrice is
  // normalized to ₳ on the way in, and finalPrices comes back in ₳;
  // re-denominate to home currency only at the persistence boundary below.
  const subsidiaryCountByParentId = formalizedSubsidiaryCountByParentId(
    context.lookups.corporations
  );
  const sharePriceInputs: SharePriceInput[] = context.lookups.corporations.map((corp, i) => {
    const s = context.corpSnapshots[i];
    const id = corp._id.toString();
    const code = resolveCorpLiquidCurrencyCode(corp);
    const rate = fxRateForCorpFromMap(corp, context.lookups.exchangeRatesByCurrency);
    const corpPrimeRate =
      (context.lookups.primeRateByCountry.get(corp.countryId) ??
        getCountryConfig(corp.countryId).centralBank.defaultPrimeRate) / 100;
    const riskPremium = getSectorRiskPremium(corp.type);
    const growthNumer = context.corpGrowthNumerByCorpId.get(id) ?? 0;
    const growthDenom = context.corpGrowthDenomByCorpId.get(id) ?? 0;
    const activeBankCharter = corp.bankCharter?.status === "active" ? corp.bankCharter : null;
    const bankFxRate = activeBankCharter
      ? (context.lookups.exchangeRatesByCurrency.get(activeBankCharter.currency) ?? 1)
      : 1;
    const bankEquityAnchor = activeBankCharter
      ? corpCapitalToAnchor(bankEquity(activeBankCharter), activeBankCharter.currency, bankFxRate)
      : 0;
    const bankNpvAnchor = activeBankCharter
      ? bankNpvFromPerTurnIncome(
          bankIncomeIncludingUnbookedSovereignAssets(activeBankCharter) / bankFxRate
        )
      : 0;
    return {
      corpId: id,
      // Issuance already scales the per-share price when new shares are created.
      // Cash that subsequently arrives is a real retained asset and belongs in
      // tangible book; subtracting it again double-counts dilution.
      liquidCapitalAnchor: valuationCashAnchor(
        s.liquidCapitalAnchorAfterIncome,
        context.lookups.honestBalanceSheetsStage ?? 0
      ),
      bankEquityAnchor,
      sectorNPVAnchor: s.sectorNPV + bankNpvAnchor,
      issuedBondDebt:
        (context.lookups.issuedBondDebtByCorpId.get(id) ?? 0) +
        (context.lookups.corporateLoanDebtByCorpId?.get(id) ?? 0),
      bondHoldingsAnchor: context.lookups.bondAndImfPortfolioAnchorByCorpId.get(id) ?? 0,
      normalizedEarningsAnchor: adjustedEarningsMap.get(id) ?? 0,
      // Annualised bond-coupon income (snapshot value is per-turn ₳).
      bondCouponEarningsAnchor: Math.max(0, s.perTurnBondCouponIncome) * TURNS_PER_YEAR,
      // Annualised issuer-side interest, same per-turn ₳ source: nets against
      // coupons so leveraged operators are not priced as bond funds.
      bondInterestExpenseAnchor: Math.max(0, s.perTurnBondDragOnNetIncome) * TURNS_PER_YEAR,
      sectorGrowthRate: growthDenom > 0 ? growthNumer / growthDenom : 0,
      costOfCapital: corpPrimeRate + riskPremium,
      totalShares: s.totalShares,
      previousSharePrice: readCorpEconomicAnchor(corp.sharePrice ?? 0.1, code, rate),
      imfBailoutActive: corp.imfBailoutActive === true,
      lastShareStructureTurn: corp.lastShareStructureTurn ?? null,
      ceoOwnershipFraction: ceoOwnershipFraction(corp),
      // Suggestion #62: index-fund ownership earns a bounded price premium.
      indexFundOwnershipFraction: indexFundOwnershipFraction(corp),
      isPrivate: corp.isPrivate ?? false,
      subsidiaryCount: subsidiaryCountByParentId.get(id) ?? 0,
      techAssetValueAnchor: computeTechAssetValueAnchor(corp, context.currentYear),
    };
  });

  const finalPrices = computeSharePrices(sharePriceInputs, context.currentTurn);

  for (let i = 0; i < context.lookups.corporations.length; i++) {
    const corp = context.lookups.corporations[i];
    const s = context.corpSnapshots[i];
    const id = corp._id.toString();
    // finalPrices is anchor-denominated; convert to the corp's home currency
    // for DB persistence and the CorpSnapshot mirror that downstream snapshot
    // writers (marketCapSnapshot.ts) consume.
    const code = resolveCorpLiquidCurrencyCode(corp);
    const rate = fxRateForCorpFromMap(corp, context.lookups.exchangeRatesByCurrency);
    const priceAnchor =
      finalPrices.get(id) ?? readCorpEconomicAnchor(corp.sharePrice ?? 0.1, code, rate);
    const priceLocal = writeCorpEconomicLocal(priceAnchor, code, rate);
    s.actualSharePrice = priceLocal;
    const op = context.corpOps[i] as {
      updateOne: { update: { $set?: Record<string, unknown> } };
    };
    if (op.updateOne.update.$set) {
      op.updateOne.update.$set.sharePrice = priceLocal;
      op.updateOne.update.$set.fundamentalSharePrice = priceLocal;
    }
  }

  if (funded && context.fundedResults.size > 0) {
    const kept = fundedSectorOpsAll(
      context.sectorOps as Parameters<typeof fundedSectorOpsAll>[0],
      new Map(
        [...context.fundedResults].map(([sectorId, result]) => [
          sectorId,
          {
            receipt: funded.receiptsBySectorId.get(sectorId)!,
            result,
            daily: context.fundedDaily.get(sectorId)!,
            valuationProfitHistory: context.fundedProfitHistory.get(sectorId),
          },
        ])
      ),
      TURNS_PER_DAY
    );
    context.sectorOps.splice(0, context.sectorOps.length, ...(kept as typeof context.sectorOps));
  }

  return {
    sectorTurnEnv: context.sectorTurnEnv,
    sectorOps: context.sectorOps,
    corpOps: [
      ...(context.corpOps as AnyBulkWriteOperation<Corporation>[]),
      ...context.lookups.corporations.flatMap((corp) =>
        holdingMaturationWrites(corp, context.currentTurn)
      ),
    ],
    manufacturingDevelopmentCashOps: context.manufacturingDevelopmentCashOps,
    corpSnapshots: context.corpSnapshots,
    ceoSalaryPayments: context.ceoSalaryPayments,
    dividendPayments: context.dividendPayments,
    capitalDividendPayments: context.capitalDividendPayments,
    passThroughTaxedDividendPayments: context.passThroughTaxedDividendPayments,
    corpDividendTaxedAtSourceAnchorByCorpId: context.corpDividendTaxedAtSourceAnchorByCorpId,
    corpDividendPaymentsAnchorByCorpId: context.corpDividendPaymentsAnchorByCorpId,
    corpDividendPaymentsAnchorByCorpCurrency: context.corpDividendPaymentsAnchorByCorpCurrency,
    sectorFxSpreadFees: context.sectorFxSpreadFees,
    fundDividendAccruals: context.fundDividendAccruals,
    equityPoolDividendAccruals: context.equityPoolDividendAccruals,
    domesticIncomeByCountry: context.domesticIncomeByCountry,
    foreignIncomeByCountry: context.foreignIncomeByCountry,
    domesticIncomeByOperatingState: context.domesticIncomeByOperatingState,
    foreignIncomeByOperatingState: context.foreignIncomeByOperatingState,
    growthInvestmentByOperatingState: context.growthInvestmentByOperatingState,
    totalRevenueGenerated: context.totalRevenueGenerated,
    totalIncomeGenerated: context.totalIncomeGenerated,
    sectorsProcessed: context.sectorsProcessed,
    profitMarginByCorpId: context.profitMarginByCorpId,
    labourWageIndexByState: new Map(
      Array.from(context.wageIndexByState, ([stateId, acc]) => [stateId, resolveWageIndex(acc)])
    ),
    automationIndexByState: new Map(
      Array.from(context.automationIndexByState, ([stateId, acc]) => [
        stateId,
        resolveAutomationIndex(acc),
      ])
    ),
    labourDemandByState: context.labourDemandByState,
    labourDemandWageIndexByState: new Map(
      Array.from(context.labourDemandWageIndexByState, ([stateId, acc]) => [
        stateId,
        resolveWageIndex(acc),
      ])
    ),
    ...(context.automationDisplacedByState
      ? { automationDisplacedByState: context.automationDisplacedByState }
      : {}),
    strikeEvents: context.pendingStrikeEvents,
    capacityBindingEvents: context.pendingCapacityBindingEvents,
    settledMarketingSpendAnchorByBuyerId: new Map(context.marketingSpendAnchorByBuyerId),
    advertisingDeliveredAnchorBySellerId: new Map(context.advertisingSellerDeliveredValues),
  };
}
