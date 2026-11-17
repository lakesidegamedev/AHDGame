import { settleCorporationAccounts } from "@/lib/turn/corporation/settleCorporationAccounts";
import { presetUsesSocietyPressures } from "@/lib/societyPressures/preset";

/**
 * The per-turn corporation ledger: why a corp lost money this turn. processSectors
 * runs every sector's revenue, margin and costs, then charges corp-level marketing,
 * logistics, R&D and CEO salary (capped together at 1.5x gross revenue), bond
 * interest and dividends (up to MAX_DIVIDEND_RATE), accrues R&D score
 * (rdMoraleFactor), and converts each sector from its host currency.
 */

import { type LossCarryforwardState } from "@/lib/corporations/rules/lossCarryforward";
import { prepareInternalSupplySectorResults } from "./internalSupplySectorPass";

import type { AnyBulkWriteOperation, ObjectId } from "mongodb";
import type { Corporation, MediaProductAdvertisingObligationV1 } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";

import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { MARKET_DISABLED, type MarketContext } from "@/lib/market/marketContext";

import { TURNS_PER_DAY } from "@/lib/constants/corporations";

import {
  corpCapitalToAnchor,
  fxRateForCorpFromMap,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { readCorpEconomicAnchor } from "@/lib/currency/corpEconomyFields";
import {
  LABOUR_DISABLED,
  type LabourContext,
  type WageIndexAccumulator,
  type AutomationIndexAccumulator,
} from "@/lib/labour/laborCost";
import { makeLabourDemandByState } from "@/lib/labour/labourMarket";

// getCountryConfig is needed for the prime rate fallback:
//   primeRateByCountry.get(sectorCountryId) ?? getCountryConfig(sectorCountryId).centralBank.defaultPrimeRate

// getCountryConfig is needed for the prime rate fallback:
//   primeRateByCountry.get(sectorCountryId) ?? getCountryConfig(sectorCountryId).centralBank.defaultPrimeRate
// getCountryConfig is needed for the prime rate fallback:
//   primeRateByCountry.get(sectorCountryId) ?? getCountryConfig(sectorCountryId).centralBank.defaultPrimeRate
// getCountryConfig is needed for the prime rate fallback:
//   primeRateByCountry.get(sectorCountryId) ?? getCountryConfig(sectorCountryId).centralBank.defaultPrimeRate
import type {
  CorporationLookups,
  CorpSnapshot,
  FundDividendAccrual,
  SectorCalculationsResult,
} from "./types";

import {
  fundedSectorResult,
  type FundedReceipt,
} from "@/lib/market/producerMarket/fundedSectorRules";
import { type SectorTurnEnv } from "./sectorTurn";

import type { ManufacturingProductAdvertisingObligationV2 } from "@/lib/products/manufacturingProject";
import { passThroughReformPhase } from "@/lib/corporations/rules/passThroughTax";

function prepareProcessSectors(
  lookups: CorporationLookups,
  turn: number | undefined,
  now: Date,
  techTreesEnabled: boolean = false,
  currentYear?: number,
  labour: LabourContext = LABOUR_DISABLED,
  market: MarketContext = MARKET_DISABLED,
  commandEconomyEnabled: boolean = false,
  privateBankingEnabled: boolean = false,
  equityMarketPoolCurrencies: ReadonlySet<CurrencyCode> = new Set(),
  treasuryCashLedgerEnabled: boolean = false,
  funded?: {
    receiptsBySectorId: ReadonlyMap<string, FundedReceipt>;
    settledProfitByCorp: ReadonlyMap<string, number>;
    headcountBySectorId?: ReadonlyMap<string, { desiredWorkers: number; workers: number }>;
  }
) {
  const fundedResults = new Map<string, ReturnType<typeof fundedSectorResult>>();
  const fundedDaily = new Map<string, (anchorPerTurn: number) => number>();
  const currentTurn = typeof turn === "number" ? turn : 1;

  const totalRevenueGenerated = 0;
  const totalIncomeGenerated = 0;
  const sectorsProcessed = 0;

  // v2: per-state labour wage index accumulator (worker-weighted wage multiplier).
  const wageIndexByState = new Map<string, WageIndexAccumulator>();
  // v2-3b: per-state automation index accumulator (worker-weighted laborCostMultiplier).
  // Deliberately separate from wageIndexByState — see accumulateWageIndex's call
  // site below for why automation is excluded from the wage index.
  const automationIndexByState = new Map<string, AutomationIndexAccumulator>();
  // Phase 1 labour market telemetry: per-state desired headcount. Unlike the two
  // indices above this is NOT gated on the labour system being on, so it stays
  // populated in worlds where wages are off.
  const labourDemandByState = makeLabourDemandByState();
  const labourDemandWageIndexByState = new Map<string, WageIndexAccumulator>();
  // 2027 world: workers automation methods no longer employ, per state.
  const automationDisplacedByState = presetUsesSocietyPressures(lookups.preset)
    ? makeLabourDemandByState()
    : undefined;
  // v3 Phase 6: strike trigger/resolution events, for index.ts (which owns
  // db) to turn into sentiment pulses. Same "collect during the pure loop,
  // consume after" pattern as sectorFxSpreadFees below.
  const pendingStrikeEvents: SectorCalculationsResult["strikeEvents"] = [];
  // Extraction sectors that newly crossed into capacity-bound state this turn,
  // for index.ts to turn into player notifications (same collect-then-consume
  // pattern as strike events).
  const pendingCapacityBindingEvents: SectorCalculationsResult["capacityBindingEvents"] = [];

  const sectorOps: {
    updateOne: {
      filter: { _id: ObjectId };
      update: { $set: Record<string, unknown> };
    };
  }[] = [];

  const corpOps: {
    updateOne: {
      filter: Record<string, unknown>;
      update: {
        $inc: Record<string, number>;
        $set: Record<string, unknown>;
        $push?: Record<string, unknown>;
      };
    };
  }[] = [];
  const manufacturingDevelopmentCashOps: AnyBulkWriteOperation<Corporation>[] = [];

  // Shared read-only inputs + cross-sector collectors for the per-sector
  // computation, which lives in ./sectorTurn (processSector). The collector
  // maps/arrays are mutated in place by processSector, exactly as the inline
  // loop did before the extraction.
  const sectorTurnEnv: SectorTurnEnv = {
    lookups,
    turn,
    currentTurn,
    now,
    techTreesEnabled,
    currentYear,
    commandEconomyEnabled,
    labour,
    market,
    wageIndexByState,
    automationIndexByState,
    labourDemandByState,
    labourDemandWageIndexByState,
    fundedHeadcountBySectorId:
      (lookups.fundedHeadcountStage ?? 0) >= 1 ? funded?.headcountBySectorId : undefined,
    automationDisplacedByState,
    pendingStrikeEvents,
    pendingCapacityBindingEvents,
    sectorOps,
    privateBankingEnabled,
  };

  const internalSupplyResults = prepareInternalSupplySectorResults(sectorTurnEnv);

  const ceoSalaryPayments = new Map<string, Map<CurrencyCode, number>>();
  const dividendPayments = new Map<string, Map<CurrencyCode, number>>();
  const capitalDividendPayments = new Map<string, Map<CurrencyCode, number>>();
  // Portion of each character's dividends already taxed at source under the
  // pass-through reform; the income-tax phase does not tax it again.
  const passThroughTaxedDividendPayments = new Map<string, Map<CurrencyCode, number>>();
  // Tax loss carryforward bank per corporation after this turn.
  const lossCarryforwardByCorpId = new Map<string, LossCarryforwardState>();
  const corpDividendPaymentsAnchorByCorpId = new Map<string, number>();
  // Same idea for corporate holders: excluded from the dividend-received tax.
  const corpDividendTaxedAtSourceAnchorByCorpId = new Map<string, number>();
  const passThroughPhase = passThroughReformPhase(
    currentTurn,
    lookups.passThroughOwnerTaxStartTurn
  );
  // Same totals as above, but split by the PAYING corp's currency so a
  // cross-currency corp→corp dividend can be charged the FX spread downstream.
  const corpDividendPaymentsAnchorByCorpCurrency = new Map<string, Map<CurrencyCode, number>>();
  // Reduced FX spreads skimmed from foreign-currency operating income repatriated
  // to each corp's home currency. Distributed to the CB system in index.ts.
  const sectorFxSpreadFees: Array<{
    fromCurrency: CurrencyCode;
    toCurrency: CurrencyCode;
    fee: number;
  }> = [];
  const fundDividendAccruals: FundDividendAccrual[] = [];
  const equityPoolDividendAccruals: SectorCalculationsResult["equityPoolDividendAccruals"] = [];
  const marketingSpendAnchorByBuyerId = new Map<string, number>();
  const productAdvertisingAnchorByBuyerId = new Map<string, number>();
  const mediaAdvertisingObligationByBuyerId = new Map<
    string,
    MediaProductAdvertisingObligationV1
  >();
  const manufacturingAdvertisingObligationByBuyerId = new Map<
    string,
    ManufacturingProductAdvertisingObligationV2
  >();
  const manufacturingAdvertisingActive =
    lookups.productLinesV2Enabled === true &&
    [...(lookups.manufacturingProductByCorpId?.values() ?? [])].some(
      (project) => project.stage === "development" && (project.advertisingAllocationShare ?? 0) > 0
    );
  const advertisingSellerDeliveredValues = [
    ...(market.advertisingSellerDeliveredValueAnchorByCorpId ?? new Map()),
  ].filter(
    ([corpId, value]) => lookups.corpById.has(corpId) && Number.isFinite(value) && value > 0
  );
  const advertisingSellerCorpIds = new Set(
    advertisingSellerDeliveredValues.map(([corpId]) => corpId)
  );
  const totalAdvertisingDeliveredValueAnchor = advertisingSellerDeliveredValues.reduce(
    (sum, [, value]) => sum + value,
    0
  );
  const marketingOrderWeightByBuyerId = new Map<string, number>();
  if (market.clearingEnabled && totalAdvertisingDeliveredValueAnchor > 0) {
    for (const corp of lookups.corporations) {
      const code = resolveCorpLiquidCurrencyCode(corp);
      const rate = fxRateForCorpFromMap(corp, lookups.exchangeRatesByCurrency);
      const requested =
        readCorpEconomicAnchor(corp.marketingBudget ?? 0, code, rate) / TURNS_PER_DAY;
      const funded = Math.min(
        Math.max(0, requested),
        Math.max(
          0,
          corpCapitalToAnchor(
            Number.isFinite(corp.liquidCapital) ? corp.liquidCapital : 0,
            code,
            rate
          )
        )
      );
      if (funded > 0) marketingOrderWeightByBuyerId.set(corp._id.toString(), funded);
    }
  }
  const totalMarketingOrderWeight = [...marketingOrderWeightByBuyerId.values()].reduce(
    (sum, weight) => sum + weight,
    0
  );

  function addToPaymentMap(
    map: Map<string, Map<CurrencyCode, number>>,
    charIdStr: string,
    amountAnchor: number,
    corpCountryId: string
  ) {
    const currency =
      COUNTRY_CURRENCY_MAP[corpCountryId as keyof typeof COUNTRY_CURRENCY_MAP] ?? "USD";
    // `amountAnchor` is ₳ (same convention as sector revenue / netIncomeBeforeDividends).
    // Character / imperial balances live in currencyBalances.personal.<code>, denominated in
    // the tagged currency — convert before storing so the downstream $inc lands at correct
    // local-currency scale. Mirrors the corp-to-corp credit in ./index.ts:92-114.
    const fxRate = lookups.exchangeRatesByCurrency.get(currency);
    const localAmount =
      Number.isFinite(fxRate) && fxRate && fxRate > 0 ? amountAnchor * fxRate : amountAnchor;
    if (!map.has(charIdStr)) map.set(charIdStr, new Map());
    const currMap = map.get(charIdStr)!;
    currMap.set(currency, (currMap.get(currency) ?? 0) + localAmount);
  }
  const corpSnapshots: CorpSnapshot[] = [];

  // Per-corp earnings history (updated this turn) and growth-rate accumulators
  // consumed by the share-price formula after all corps are processed.
  const updatedEarningsHistoryByCorpId = new Map<string, number[]>();
  const corpGrowthNumerByCorpId = new Map<string, number>();
  const corpGrowthDenomByCorpId = new Map<string, number>();
  // Realized profit margin (net income before dividends ÷ revenue) per corp this
  // turn. Normalized (currency- and size-agnostic) so it can tier how fast a
  // player CEO trains Business Acumen — better-run corps teach more.
  const profitMarginByCorpId = new Map<string, number>();

  // Annualized operating income accumulators, split by corp-vs-sector country match.
  // Domestic = corp HQ'd in the same country as the sector; foreign = elsewhere.
  // Written to federalBudget.taxBases.{domestic,foreign}CorporateProfits and the
  // corresponding stateBudgets field in corporation/index.ts write-back loop.
  const domesticIncomeByCountry = new Map<string, number>();
  const foreignIncomeByCountry = new Map<string, number>();
  const domesticIncomeByOperatingState = new Map<string, number>();
  const foreignIncomeByOperatingState = new Map<string, number>();
  // O1c (design §5): paid growth cost per operating state → region capital stock.
  const growthInvestmentByOperatingState = new Map<string, number>();
  return {
    kind: "context" as const,
    context: {
      addToPaymentMap,
      advertisingSellerCorpIds,
      advertisingSellerDeliveredValues,
      automationDisplacedByState,
      automationIndexByState,
      capitalDividendPayments,
      ceoSalaryPayments,
      corpDividendPaymentsAnchorByCorpCurrency,
      corpDividendPaymentsAnchorByCorpId,
      corpDividendTaxedAtSourceAnchorByCorpId,
      corpGrowthDenomByCorpId,
      corpGrowthNumerByCorpId,
      corpOps,
      corpSnapshots,
      currentTurn,
      currentYear,
      dividendPayments,
      domesticIncomeByCountry,
      domesticIncomeByOperatingState,
      equityMarketPoolCurrencies,
      equityPoolDividendAccruals,
      foreignIncomeByCountry,
      foreignIncomeByOperatingState,
      fundDividendAccruals,
      funded,
      fundedDaily,
      fundedResults,
      growthInvestmentByOperatingState,
      internalSupplyResults,
      labourDemandWageIndexByState,
      lookups,
      lossCarryforwardByCorpId,
      manufacturingAdvertisingActive,
      manufacturingAdvertisingObligationByBuyerId,
      manufacturingDevelopmentCashOps,
      market,
      marketingOrderWeightByBuyerId,
      marketingSpendAnchorByBuyerId,
      mediaAdvertisingObligationByBuyerId,
      now,
      passThroughPhase,
      passThroughTaxedDividendPayments,
      pendingCapacityBindingEvents,
      pendingStrikeEvents,
      productAdvertisingAnchorByBuyerId,
      profitMarginByCorpId,
      sectorFxSpreadFees,
      sectorOps,
      sectorsProcessed,
      sectorTurnEnv,
      totalAdvertisingDeliveredValueAnchor,
      totalIncomeGenerated,
      totalMarketingOrderWeight,
      totalRevenueGenerated,
      treasuryCashLedgerEnabled,
      updatedEarningsHistoryByCorpId,
      wageIndexByState,
      labourDemandByState,
    },
  };
}
export type ProcessSectorsStageContext = Extract<
  ReturnType<typeof prepareProcessSectors>,
  { kind: "context" }
>["context"];

export function processSectors(
  ...args: Parameters<typeof prepareProcessSectors>
): SectorCalculationsResult {
  const prepared = prepareProcessSectors(...args);
  return settleCorporationAccounts(prepared.context);
}
