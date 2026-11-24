/**
 * Commodity supply/demand rows and market-system panel sections for the
 * sector detail query. Extracted verbatim from sectorDetail.ts (pure code
 * motion; no behavior change).
 */
import type { FundedBuyerDemandRow } from "@/lib/market/producerMarket/fundedBuyerDemandRules";
import {
  outsideBuyerRows,
  plantBuyerRows,
  outsidePriceReading,
  type OutsideBuyerReading,
} from "@/lib/corporations/rules/outsideBuyerReading";
import { ownSiteDeliveries } from "@/lib/corporations/ownSiteDeliveries";
import { settledProductSales } from "@/lib/corporations/rules/settledProductSales";
import { unsoldReadingsFor } from "@/lib/corporations/rules/unsoldReason";
import { fundedClearingReading } from "@/lib/corporations/fundedClearingReading";
import { fundedSaleRecord } from "@/lib/corporations/rules/fundedSaleRecord";
import { laneKeyOf } from "@/lib/market/producerMarket/laneKey";
import { buildMarketContext } from "@/lib/market/marketContext";
import { getMarketSystemMode } from "@/lib/market/featureFlag";
import { billedInputUnitPrice } from "@/lib/corporations/rules/inputBoughtUnits";
import { inputShortageReading } from "@/lib/corporations/rules/inputShortageReading";
import { computeThroughput, inputAvailability, THROUGHPUT_MIN } from "@/lib/market/throughput";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import { CAPITAL_DEPRECIATION_PER_TURN, impliedOutputUnits } from "@/lib/market/capital";
import { computePriceRealization, priceRealizationFactor } from "@/lib/market/priceRealization";
import type { CommodityPrice, CorporateSector, Corporation } from "@/lib/db/types";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import {
  COMMODITY_LABELS,
  COMMODITY_ICONS,
  COMMODITY_COLORS,
  COMMODITY_BASE_PRICES,
  COMMODITY_UNITS,
  COMMODITY_LOG_K,
  COMMODITY_PER_ITEM_CAP,
  RETAIL_NEGATIVE_COMMODITY_PENALTY_FACTOR,
  dollarsToUnits,
  computeCommodityPressureRatio,
  computeEffectiveCommodityPressureRatio,
  STATE_COMMODITY_SUPPLY_DEMAND,
  EXTRACTABLE_RESOURCES,
} from "@/lib/constants/commodities";
import type { CommodityType, ExtractableResource } from "@/lib/constants/commodities";
import type { EffectiveStrategyRates } from "@/lib/constants/sectorStrategies";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import { applyExtractionResourceCapacityToSupply } from "@/lib/corporations/extractionResourceSupply";

type CommodityBalance = { supply: number; demand: number };

export function perUnitAnchorAmount(amountAnchor: number | null, units: number): number | null {
  return amountAnchor != null && units > 0 ? amountAnchor / units : null;
}

export function computeCapitalUsage(
  stock: number | null,
  impliedUnits: number
): { utilization: number | null; capacityUsed: number | null } {
  if (stock == null) return { utilization: null, capacityUsed: null };
  if (stock <= 0) return { utilization: 0, capacityUsed: 0 };
  return {
    utilization: Math.min(1, Math.max(0, impliedUnits) / stock),
    capacityUsed: Math.min(stock, Math.max(0, impliedUnits)),
  };
}

/**
 * Pair the bottleneck with the throttle it explains. When an applied throttle
 * exists, its persisted input is authoritative; the current world projection
 * may differ after regional delivery or internal supply.
 */
export function resolveThroughputBindingInput(
  applied: number | null,
  recorded: string | null | undefined,
  projected: string | null
): string | null {
  return applied == null ? projected : (recorded ?? null);
}

/**
 * The lowest throttle an input shortage can apply, matching the turn engine
 * (sectorTurn/marketTiers): the raw Leontief factor floors at THROUGHPUT_MIN
 * and the launch-safety governor then floors the applied factor at
 * `1 - governorCap`. The page used to quote THROUGHPUT_MIN alone, telling a
 * plant pinned at the governor floor that shortages could still cut it to 50%.
 */
export function appliedThroughputFloor(governorCap: number): number {
  const cap = Number.isFinite(governorCap) ? Math.min(1, Math.max(0, governorCap)) : 1;
  return Math.max(THROUGHPUT_MIN, 1 - cap);
}

/**
 * Build the supplies/demands rows and the price-realization, pricing,
 * capital, and throughput sections for a sector. Reads the market-system
 * mode (one gameConfig read) at the same point the inline code did.
 */
/**
 * Each output's share of last turn's revenue. A settled plant was paid per
 * product on its receipt, so its split comes from there; the clearing split is
 * only for plants with no current receipt.
 */
export function outputRevenueShares(
  receiptSales: ReadonlyMap<string, { revenue: number }> | null,
  clearingShares: Partial<Record<string, number>> | null | undefined
): Partial<Record<string, number>> {
  if (!receiptSales)
    return clearingShares && typeof clearingShares === "object" ? clearingShares : {};
  let total = 0;
  for (const sale of receiptSales.values()) total += Math.max(0, sale.revenue);
  if (!(total > 0)) return {};
  const shares: Partial<Record<string, number>> = {};
  for (const [commodity, sale] of receiptSales)
    shares[commodity] = Math.max(0, sale.revenue) / total;
  return shares;
}

/**
 * The Pricing panel's sales figures. The legacy pass still stamps its own fill,
 * posture and factor, which a funded plant was not paid on; the settlement is
 * what actually sold. The legacy figures are sent only for a plant with no
 * funded sale record, labelled as an estimate.
 */
/**
 * One output's posted asking price, the average this plant was actually paid
 * per unit sold, and the price that cleared its lane, anchor per unit.
 */
export interface PricingAsk {
  commodity: string;
  askingUnitPrice: number;
  /** Revenue over units sold outside, null when nothing sold. */
  paidUnitPrice: number | null;
  /** The lane's clearing price: a market reading, not this plant's own sales. */
  marketUnitPrice: number | null;
}

/** Offer-weighted ask per output, beside what this plant was paid and its lane's clearing price. */
export function pricingAsks(
  products:
    | readonly {
        commodity: string;
        book: string;
        offeredUnits: number;
        askingUnitPrice?: number;
        soldUnits?: number;
        revenue?: number;
      }[]
    | undefined,
  laneClearingPrices: Readonly<Record<string, number | undefined>> | undefined
): PricingAsk[] {
  const rows = new Map<
    string,
    { offered: number; askValue: number; sold: number; revenue: number; market: number | null }
  >();
  for (const product of products ?? []) {
    const ask = product.askingUnitPrice;
    if (!(product.offeredUnits > 0) || typeof ask !== "number" || !(ask > 0)) continue;
    const market = laneClearingPrices?.[laneKeyOf(product.commodity, product.book)];
    const row = rows.get(product.commodity) ?? {
      offered: 0,
      askValue: 0,
      sold: 0,
      revenue: 0,
      market: null,
    };
    row.offered += product.offeredUnits;
    row.askValue += ask * product.offeredUnits;
    if (typeof product.soldUnits === "number" && product.soldUnits > 0) {
      row.sold += product.soldUnits;
      row.revenue +=
        typeof product.revenue === "number" && product.revenue > 0 ? product.revenue : 0;
    }
    if (row.market == null && typeof market === "number" && market > 0) row.market = market;
    rows.set(product.commodity, row);
  }
  return [...rows]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([commodity, row]) => ({
      commodity,
      askingUnitPrice: row.askValue / row.offered,
      paidUnitPrice: row.sold > 0 ? row.revenue / row.sold : null,
      marketUnitPrice: row.market,
    }));
}

export function pricingSalesReading(
  sector: Pick<
    CorporateSector,
    | "producerSettlement"
    | "soldByCommodityTurn"
    | "effectivePosture"
    | "soldFraction"
    | "clearingFactor"
  >,
  isCeo: boolean
): {
  salesBasis: "settlement" | "estimate";
  effectivePosture: number | null;
  soldFraction: number | null;
  ownSiteFraction?: number | null;
  clearingFactor: number | null;
} {
  const record = fundedSaleRecord(sector.producerSettlement, sector.soldByCommodityTurn);
  if (record) {
    const funded = fundedClearingReading(record, record.turn);
    return {
      salesBasis: "settlement",
      effectivePosture: null,
      soldFraction: funded?.soldFraction ?? null,
      // Own-site deliveries are CEO-only intel, like the per-output rows.
      ...(funded && isCeo ? { ownSiteFraction: funded.ownSiteFraction } : {}),
      clearingFactor: funded?.clearingFactor ?? null,
    };
  }
  const finiteOrNull = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return {
    salesBasis: "estimate",
    effectivePosture: finiteOrNull(sector.effectivePosture),
    soldFraction: finiteOrNull(sector.soldFraction),
    clearingFactor: finiteOrNull(sector.clearingFactor),
  };
}

export async function buildSectorCommoditySections(args: {
  sector: CorporateSector;
  /**
   * The sector's revenue normalized to ₳ at its HOST-state rate. Commodity flows
   * (`* rate`, `impliedOutputUnits`, depreciation) run in ₳ — the unit
   * COMMODITY_BASE_PRICES use — so callers pass the ₳-normalized revenue rather
   * than the raw host-currency `sector.revenue`.
   */
  sectorRevenueAnchor: number;
  /** Persisted daily labour cost normalized to ₳, matching sectorRevenueAnchor. */
  sectorLaborCostAnchor: number | null;
  sectorType: OperatingSectorType;
  sectorCountryId: string;
  /** The world's era unit-basis scale (`getEraUnitScale(preset)`). */
  eraUnitScale: number;
  corporation: Corporation;
  isCeo: boolean;
  commodityPrices: CommodityPrice[];
  globalBalances: Map<CommodityType, CommodityBalance>;
  nationalBalancesByCountry: Map<string, Map<CommodityType, CommodityBalance>>;
  stateBalances: Map<CommodityType, CommodityBalance>;
  tariffBlend: { globalWeight: number; nationalWeight: number; localWeight: number };
  effectiveRates: EffectiveStrategyRates;
  stateResources: Partial<Record<ExtractableResource, number>> | null | undefined;
  thisSectorMultipliers: Partial<Record<ExtractableResource, number>>;
  /** gameConfig.marketGovernorCap, as the turn processor resolves it. */
  governorCap?: number | null;
  /** Current game turn; own-site deliveries only count from last turn's receipt. */
  currentTurn?: number;
  /**
   * Last turn's average price buyers paid per book lane (producerMarketOutcomes),
   * for saying why an output went unsold. Absent: no reason shown.
   */
  laneClearingPrices?: Readonly<Record<string, number | undefined>>;
  /** Last settled turn's market-wide orders by buyer kind, for naming who bought. */
  buyerDemand?: readonly FundedBuyerDemandRow[];
}) {
  const {
    sector,
    sectorRevenueAnchor,
    sectorLaborCostAnchor,
    sectorType,
    sectorCountryId,
    eraUnitScale,
    corporation,
    isCeo,
    commodityPrices,
    globalBalances,
    nationalBalancesByCountry,
    stateBalances,
    tariffBlend,
    effectiveRates,
    stateResources,
    thisSectorMultipliers,
  } = args;
  // Apply extraction resource capacity to zero out supplies for resources
  // with no deposits — mirrors the backend turn processor so the display
  // matches actual production and margin math matches what the backend uses.
  const effectiveSupply =
    sectorType === "extraction"
      ? applyExtractionResourceCapacityToSupply(sectorType, effectiveRates.supply, stateResources)
      : effectiveRates.supply;

  const supplyFlows = Object.entries(effectiveSupply)
    .filter(([, rate]) => (rate as number) > 0)
    .map(([commodity, rate]) => ({
      commodity: commodity as CommodityType,
      rate: rate as number,
    }));
  const demandFlows = Object.entries(effectiveRates.demand).map(([commodity, rate]) => ({
    commodity: commodity as CommodityType,
    rate: rate as number,
  }));
  const totalSupplyRate = supplyFlows.reduce((sum, f) => sum + f.rate, 0);
  const totalDemandRate = demandFlows.reduce((sum, f) => sum + f.rate, 0);

  // Is retail? Affects penalty factor for demand-side impacts
  const isRetail = sectorType === "retail";

  // Per-row impact must use the SAME blend as `computeBlendedMarginModifiers` and
  // SAME per-commodity cap, so rows sum to the "Net commodity modifier" line.
  const PER_ROW_GLOBAL_WEIGHT = tariffBlend.globalWeight;
  const PER_ROW_NATIONAL_WEIGHT = tariffBlend.nationalWeight;
  const PER_ROW_STATE_WEIGHT = tariffBlend.localWeight;
  const nationalBalancesForCountry =
    nationalBalancesByCountry.get(sectorCountryId) ??
    new Map<CommodityType, { supply: number; demand: number }>();

  const cappedLogImpact = (
    rate: number,
    bal: { supply: number; demand: number } | undefined,
    sign: 1 | -1
  ): number => {
    const ratio = bal ? computeEffectiveCommodityPressureRatio(bal.supply, bal.demand) : 1;
    const impact = sign * COMMODITY_LOG_K * rate * Math.log(ratio);
    return Math.max(-COMMODITY_PER_ITEM_CAP, Math.min(COMMODITY_PER_ITEM_CAP, impact));
  };

  const buildPriceFields = (commodity: CommodityType) => {
    const cpData = commodityPrices.find((p) => p.commodity === commodity);
    const basePrice = COMMODITY_BASE_PRICES[commodity];
    const globalPrice = cpData?.globalPrice ?? basePrice;
    const nationalPrice = cpData?.nationalPrices?.[sectorCountryId] ?? globalPrice;
    const regionalPrice = cpData?.statePrices?.[sector.stateId] ?? nationalPrice;
    return {
      basePrice,
      globalPrice,
      nationalPrice,
      regionalPrice,
      marketPrice: regionalPrice,
      priceAttribution: cpData?.priceAttribution,
    };
  };

  // Structural market rework: resolved once for the supply/demand rows +
  // panel summaries below. One gameConfig read; "off" (default) hides the UI.
  const market = buildMarketContext(await getMarketSystemMode(), { cap: args.governorCap });
  // Under clearing, the realization term lives inside the clearing factor —
  // the plain realization rows/footer would double-report the price leg.
  const marketRealizationEnabled = market.realizationEnabled && !market.clearingEnabled;

  // The funded settlement, when it is the plant's latest sales record. With it,
  // nothing below falls back to the legacy market fields.
  const fundedRecord = fundedSaleRecord(sector.producerSettlement, sector.soldByCommodityTurn);
  // Output this sector handed to the company's own other sites last turn. It is
  // not a sale, so the sold share reads zero without it. CEO-only intel.
  const ownSiteProducts = isCeo
    ? (ownSiteDeliveries(
        fundedRecord ?? sector.producerSettlement,
        fundedRecord?.turn ?? args.currentTurn ?? 0
      )?.products ?? [])
    : [];
  const receiptSales = fundedRecord ? settledProductSales(fundedRecord, fundedRecord.turn) : null;
  const ownSiteByCommodity = new Map(ownSiteProducts.map((p) => [p.commodity, p] as const));

  // Why an output went unsold last turn: its ask against what buyers in its
  // book paid, summed over every plant and book on the receipt. CEO-only, like
  // the own-site figures; needs a fresh receipt.
  const unsoldReadings = unsoldReadingsFor({
    isCeo,
    receipt: sector.producerSettlement,
    currentTurn: args.currentTurn ?? 0,
    laneClearingPrices: args.laneClearingPrices,
    // Still short worldwide while this plant's own market is covered: the
    // buyers are in another state (local services) or another country.
    shortElsewhere: (commodity) => {
      const world = globalBalances.get(commodity as CommodityType);
      if (!world || !(world.demand > 0) || world.supply >= world.demand * 0.95) return null;
      return isStateScopedCommodity(commodity as CommodityType) ? "state" : "country";
    },
  });

  // Last turn's per-output clear rates (written by the clearing pass). Absent
  // on sectors that predate the field or when clearing never ran.
  const soldByCommodity: Partial<Record<string, number>> =
    !fundedRecord && sector.soldByCommodity && typeof sector.soldByCommodity === "object"
      ? sector.soldByCommodity
      : {};
  // Each output's share of last turn's realized revenue, so multi-output sectors can show a per-product sale price instead of a blended average. Absent until the sector clears a turn with the field.
  const revenueShareByCommodity = outputRevenueShares(
    receiptSales,
    fundedRecord ? null : sector.revenueShareByCommodity
  );
  const hasRevenueSplit = Object.keys(revenueShareByCommodity).length > 0;

  const outsideAsks = fundedRecord
    ? pricingAsks(fundedRecord.products, args.laneClearingPrices)
    : [];
  const supplies = supplyFlows.map((f) => {
    const sale = receiptSales?.get(f.commodity);
    const soldFraction = receiptSales
      ? sale && sale.offered > 0
        ? Math.min(1, sale.sold / sale.offered)
        : undefined
      : soldByCommodity[f.commodity];
    const dollarFlow = sectorRevenueAnchor * f.rate;
    const units = dollarsToUnits(dollarFlow, COMMODITY_BASE_PRICES[f.commodity]);
    const gBal = globalBalances.get(f.commodity);
    const nBal = nationalBalancesForCountry.get(f.commodity);
    const sBalRaw = stateBalances.get(f.commodity);
    const sBal = {
      supply: (sBalRaw?.supply ?? 0) + STATE_COMMODITY_SUPPLY_DEMAND,
      demand: (sBalRaw?.demand ?? 0) + STATE_COMMODITY_SUPPLY_DEMAND,
    };
    // Surplus side: positive sign — selling into shortage rewards the supplier.
    const gImpact = cappedLogImpact(f.rate, gBal, 1);
    const nImpact = cappedLogImpact(f.rate, nBal, 1);
    const sImpact = cappedLogImpact(f.rate, sBal, 1);
    const rawImpact =
      PER_ROW_GLOBAL_WEIGHT * gImpact +
      PER_ROW_NATIONAL_WEIGHT * nImpact +
      PER_ROW_STATE_WEIGHT * sImpact;
    let capacityMultiplier: number | undefined;
    if (
      sectorType === "extraction" &&
      (EXTRACTABLE_RESOURCES as readonly string[]).includes(f.commodity)
    ) {
      const resource = f.commodity as ExtractableResource;
      if (stateResources === undefined) {
        // No cap doc at all — uncapped (legacy state)
        capacityMultiplier = undefined;
      } else if (stateResources === null) {
        // Cap doc exists with no resources field — zero capacity for all
        capacityMultiplier = 0;
      } else {
        capacityMultiplier = thisSectorMultipliers[resource] ?? 1;
      }
    }
    return {
      commodity: f.commodity,
      label: COMMODITY_LABELS[f.commodity],
      icon: COMMODITY_ICONS[f.commodity],
      colors: COMMODITY_COLORS[f.commodity],
      unit: COMMODITY_UNITS[f.commodity],
      units: Math.round(units * 100) / 100,
      rate: f.rate,
      weight: totalSupplyRate > 0 ? Math.round((f.rate / totalSupplyRate) * 1000) / 10 : 0,
      priceImpact: Math.round(rawImpact * 100) / 100,
      ...buildPriceFields(f.commodity),
      ...(marketRealizationEnabled
        ? (() => {
            const cpData = commodityPrices.find((p) => p.commodity === f.commodity);
            const base = COMMODITY_BASE_PRICES[f.commodity];
            // Positive-price guard matches the sector-level ratio map below —
            // a negative/zero price must read as "at base", never NaN.
            const ratio =
              typeof cpData?.globalPrice === "number" && cpData.globalPrice > 0 && base > 0
                ? cpData.globalPrice / base
                : 1;
            return {
              realizationFactor: Math.round(priceRealizationFactor(ratio) * 1000) / 1000,
              realizationPriceOverBase: Math.round(ratio * 100) / 100,
            };
          })()
        : {}),
      // Per-output clear rate from last turn's clearing pass. The Pricing panel
      // shows one rate-weighted headline across every output, which reads as
      // "my short commodity isn't selling" on a multi-output sector where a
      // DIFFERENT output is the one sitting unsold (oil_gas: gas clears out in
      // a 2.7x shortage while oil, in glut, does not).
      ...(market.clearingEnabled && typeof soldFraction === "number"
        ? {
            soldFraction,
            soldFractionBasis: receiptSales ? ("settlement" as const) : ("estimate" as const),
          }
        : {}),
      ...(isCeo && sale ? { settledSales: sale } : {}),
      ...(isCeo && sale && sale.sold > 0
        ? (() => {
            const ask = outsideAsks.find((a) => a.commodity === f.commodity);
            const regional = buildPriceFields(f.commodity).regionalPrice;
            const plantBuyers = plantBuyerRows(sale.soldTo, TURNS_PER_DAY);
            return {
              outsideBuyers: {
                ...(plantBuyers
                  ? { buyers: plantBuyers, basis: "plant" as const }
                  : {
                      buyers: outsideBuyerRows(args.buyerDemand, f.commodity),
                      basis: "market" as const,
                    }),
                price: outsidePriceReading({
                  askUnitPrice: ask?.askingUnitPrice,
                  paidUnitPrice: sale.revenue / sale.sold,
                  bookUnitPrice: ask?.marketUnitPrice,
                  regionalUnitPrice: regional,
                }),
              } satisfies OutsideBuyerReading,
            };
          })()
        : {}),
      ...(sale && sale.sold > 0 ? { settledUnitPrice: sale.revenue / sale.sold } : {}),
      ...(market.clearingEnabled && hasRevenueSplit
        ? { revenueShare: revenueShareByCommodity[f.commodity] ?? 0 }
        : {}),
      ...(unsoldReadings.has(f.commodity) ? { unsold: unsoldReadings.get(f.commodity) } : {}),
      ...(ownSiteByCommodity.has(f.commodity)
        ? { ownSite: ownSiteByCommodity.get(f.commodity) }
        : {}),
      capacityMultiplier,
    };
  });

  // Price realization (marketSystemMode >= "realization"): projected sector
  // factor from current lagged prices; `applied` is what last turn actually
  // used (persisted by the corp phase).
  let priceRealization: { applied: number | null; projected: number } | undefined;
  if (marketRealizationEnabled) {
    const ratioMap = new Map(
      commodityPrices
        .filter(
          (p) =>
            typeof p.globalPrice === "number" &&
            COMMODITY_BASE_PRICES[p.commodity] > 0 &&
            p.globalPrice > 0
        )
        .map((p) => [p.commodity, p.globalPrice / COMMODITY_BASE_PRICES[p.commodity]])
    );
    const supplyRatesMap: Partial<Record<CommodityType, number>> = {};
    for (const f of supplyFlows) supplyRatesMap[f.commodity] = f.rate;
    priceRealization = {
      applied: typeof sector.priceRealization === "number" ? sector.priceRealization : null,
      projected: Math.round(computePriceRealization(supplyRatesMap, ratioMap) * 1000) / 1000,
    };
  }

  // Posted-price clearing (marketSystemMode >= "clearing"): CEO posture +
  // last turn's clearing telemetry for the Pricing panel.
  let pricing:
    | {
        posture: number | null;
        salesBasis?: "settlement" | "estimate";
        effectivePosture: number | null;
        soldFraction: number | null;
        ownSiteFraction?: number | null;
        clearingFactor: number | null;
        brandPostureNorm?: number | null;
        costPlusEnabled?: boolean;
        costPlusReady?: boolean;
        pricingMode?: "market" | "costPlus";
        asks?: PricingAsk[];
      }
    | undefined;
  if (market.clearingEnabled) {
    pricing = {
      posture: typeof sector.pricingPosture === "number" ? sector.pricingPosture : null,
      ...pricingSalesReading(sector, isCeo),
      // Brand loyalty (Package A): the corp's established price-identity norm,
      // exposed only to the CEO so the Pricing panel can warn about gouging
      // jumps. Corp-level (not sector-level); never sent to non-owners.
      brandPostureNorm:
        isCeo && typeof corporation.brandPostureNorm === "number"
          ? corporation.brandPostureNorm
          : undefined,
      ...(isCeo && fundedRecord
        ? { asks: pricingAsks(fundedRecord.products, args.laneClearingPrices) }
        : {}),
    };
  }

  // Capital tier (marketSystemMode >= "capital"): capacity + per-unit
  // economics, computed from live data — margin is emergent, never stored.
  let capital:
    | {
        stock: number | null;
        impliedUnits: number;
        utilization: number | null;
        capacityCoverage: number | null;
        capacityUsed: number | null;
        depreciationPerTurn: number;
        unit: {
          price: number | null;
          labour: number | null;
          inputs: number | null;
          capitalCharge: number | null;
          margin: number | null;
        };
      }
    | undefined;
  if (market.capitalEnabled) {
    const supplyRatesMap: Partial<Record<CommodityType, number>> = {};
    for (const f of supplyFlows) supplyRatesMap[f.commodity] = f.rate;
    const units = impliedOutputUnits(
      sectorRevenueAnchor,
      supplyRatesMap,
      COMMODITY_BASE_PRICES,
      eraUnitScale
    );
    // Output-weighted selling price per unit (lagged market prices).
    let priceSum = 0;
    let unitSum = 0;
    for (const f of supplyFlows) {
      const basePrice = COMMODITY_BASE_PRICES[f.commodity];
      if (!(basePrice > 0) || f.rate <= 0) continue;
      const cpData = commodityPrices.find((p) => p.commodity === f.commodity);
      const price =
        typeof cpData?.globalPrice === "number" && cpData.globalPrice > 0
          ? cpData.globalPrice
          : basePrice;
      const u = (sectorRevenueAnchor * f.rate) / basePrice;
      priceSum += u * price;
      unitSum += u;
    }
    const unitPrice = unitSum > 0 ? priceSum / unitSum : null;
    // Input cost per unit of output: what the sector's demand legs cost at
    // lagged market prices, spread over its output.
    let inputCost = 0;
    for (const f of demandFlows) {
      const basePrice = COMMODITY_BASE_PRICES[f.commodity];
      if (!(basePrice > 0) || f.rate <= 0) continue;
      const cpData = commodityPrices.find((p) => p.commodity === f.commodity);
      const price =
        typeof cpData?.globalPrice === "number" && cpData.globalPrice > 0
          ? cpData.globalPrice
          : basePrice;
      inputCost += ((sectorRevenueAnchor * f.rate) / basePrice) * price;
    }
    const unitInputs = units > 0 ? inputCost / units : null;
    // Labour per unit: both numerator and denominator must share the anchor
    // currency basis. sector.laborCost is persisted in host currency, so the
    // caller normalizes it alongside revenue before it reaches this calculator.
    const unitLabour = perUnitAnchorAmount(sectorLaborCostAnchor, units);
    // Capital charge per unit: the revenue share depreciation claims.
    const unitCapitalCharge =
      units > 0
        ? (sectorRevenueAnchor * CAPITAL_DEPRECIATION_PER_TURN * TURNS_PER_DAY) / units
        : null;
    const unitMargin =
      unitPrice != null
        ? unitPrice - (unitLabour ?? 0) - (unitInputs ?? 0) - (unitCapitalCharge ?? 0)
        : null;
    const round2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
    const stock = typeof sector.capitalStock === "number" ? sector.capitalStock : null;
    const capacityCoverage =
      typeof sector.capitalUtilization === "number" ? sector.capitalUtilization : null;
    const usage = computeCapitalUsage(stock, units);
    capital = {
      stock,
      impliedUnits: Math.round(units * 100) / 100,
      utilization: usage.utilization,
      capacityCoverage,
      capacityUsed: usage.capacityUsed,
      depreciationPerTurn: CAPITAL_DEPRECIATION_PER_TURN,
      unit: {
        price: round2(unitPrice),
        labour: round2(unitLabour),
        inputs: round2(unitInputs),
        capitalCharge: round2(unitCapitalCharge),
        margin: round2(unitMargin),
      },
    };
  }

  // Throughput coupling (marketSystemMode >= "clearing"): projected raw
  // Leontief minimum from global lagged balances (state balances for
  // state-scoped inputs, mirroring the turn engine); `applied` and its binding
  // input are the last turn's actual telemetry, which can include regional
  // delivery and internal supply.
  let throughput:
    | { applied: number | null; projected: number; bindingInput: string | null; floor: number }
    | undefined;
  if (market.throughputEnabled) {
    const demandRatesMap: Partial<Record<CommodityType, number>> = {};
    for (const f of demandFlows) demandRatesMap[f.commodity] = f.rate;
    // Mirror the turn engine: state-scoped inputs read their own state's
    // balance, not the global book, when a state balance exists.
    const stateScopedAvailability = new Map<CommodityType, number>();
    for (const commodity of Object.keys(demandRatesMap) as CommodityType[]) {
      if (!isStateScopedCommodity(commodity)) continue;
      const stateBalance = stateBalances.get(commodity);
      if (!stateBalance) continue;
      stateScopedAvailability.set(commodity, inputAvailability(stateBalance));
    }
    const t = computeThroughput(
      demandRatesMap,
      globalBalances,
      stateScopedAvailability.size > 0 ? stateScopedAvailability : undefined
    );
    const applied = typeof sector.throughputFactor === "number" ? sector.throughputFactor : null;
    throughput = {
      applied,
      projected: Math.round(t.throughput * 1000) / 1000,
      bindingInput: resolveThroughputBindingInput(
        applied,
        sector.throughputBindingInput,
        t.bindingInput
      ),
      floor: appliedThroughputFloor(market.governorCap),
    };
  }

  const demands = demandFlows.map((f) => {
    const dollarFlow = sectorRevenueAnchor * f.rate;
    const units = dollarsToUnits(dollarFlow, COMMODITY_BASE_PRICES[f.commodity]);
    const gBal = globalBalances.get(f.commodity);
    const nBal = nationalBalancesForCountry.get(f.commodity);
    const sBalRaw = stateBalances.get(f.commodity);
    const sBal = {
      supply: (sBalRaw?.supply ?? 0) + STATE_COMMODITY_SUPPLY_DEMAND,
      demand: (sBalRaw?.demand ?? 0) + STATE_COMMODITY_SUPPLY_DEMAND,
    };
    // Input side: negative sign — shortages raise input costs and hurt margin.
    const gImpact = cappedLogImpact(f.rate, gBal, -1);
    const nImpact = cappedLogImpact(f.rate, nBal, -1);
    const sImpact = cappedLogImpact(f.rate, sBal, -1);
    let rawImpact =
      PER_ROW_GLOBAL_WEIGHT * gImpact +
      PER_ROW_NATIONAL_WEIGHT * nImpact +
      PER_ROW_STATE_WEIGHT * sImpact;
    if (isRetail && rawImpact < 0) {
      rawImpact *= RETAIL_NEGATIVE_COMMODITY_PENALTY_FACTOR;
    }
    return {
      commodity: f.commodity,
      label: COMMODITY_LABELS[f.commodity],
      icon: COMMODITY_ICONS[f.commodity],
      colors: COMMODITY_COLORS[f.commodity],
      unit: COMMODITY_UNITS[f.commodity],
      units: Math.round(units * 100) / 100,
      rate: f.rate,
      weight: totalDemandRate > 0 ? Math.round((f.rate / totalDemandRate) * 1000) / 10 : 0,
      priceImpact: Math.round(rawImpact * 100) / 100,
      ...buildPriceFields(f.commodity),
      // What the engine actually bills per unit (physicalPnl.computeInputsCost):
      // base price through the same damped/clamped realization function revenue
      // uses, on the GLOBAL ratio. The raw regional `marketPrice` stays for
      // market context, but any P&L line must sum THIS price or the page
      // disagrees with the booked bill.
      billedUnitPrice: billedInputUnitPrice(
        f.commodity,
        commodityPrices.find((p) => p.commodity === f.commodity)?.globalPrice
      ),
      ...(market.throughputEnabled
        ? { inputAvailability: Math.round(inputAvailability(gBal) * 1000) / 1000 }
        : {}),
      ...(() => {
        const reading =
          isCeo && fundedRecord
            ? inputShortageReading(fundedRecord.inputReceipts, f.commodity, fundedRecord.turn)
            : null;
        return reading ? { inputReceipt: reading } : {};
      })(),
    };
  });

  // Add shortage info to demand flows
  const demandsWithShortage = demands.map((d) => {
    const balance = globalBalances.get(d.commodity as CommodityType);
    let shortageRatio: number | null = null;
    if (balance && balance.demand > 0) {
      // ratio > 1 means shortage (demand exceeds supply)
      shortageRatio =
        Math.round(computeCommodityPressureRatio(balance.supply, balance.demand) * 100) / 100;
    }
    return {
      ...d,
      shortageRatio,
    };
  });

  return {
    effectiveSupply,
    supplies,
    demandsWithShortage,
    priceRealization,
    pricing,
    capital,
    throughput,
  };
}
