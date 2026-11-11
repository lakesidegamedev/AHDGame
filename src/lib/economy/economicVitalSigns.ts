import { loadLedgerTurnover } from "./ledgerTurnoverCache";
import type { Db } from "mongodb";
import type {
  Bond,
  CommodityPrice,
  CorporateSector,
  EconomicVitalSigns,
  ExchangeRate,
  GameConfig,
  IndexFund,
  MoneySupplySnapshot,
  ShareOrder,
  ShareTradeHistory,
  StockExchangeSnapshot,
  NppMarketEntryFunnel,
  UnownedSector,
  WealthListSnapshot,
} from "@/lib/db/types";
import type { CommodityFlow } from "@/lib/db/types/commodityFlow";
import type { LedgerReconciliation } from "@/lib/ledger/types";
import type { BalanceSnapshot, LedgerEntry } from "@/lib/ledger/types";
import type { CommoditySourcingDoc } from "@/lib/logistics/sourcingLedger";
import { computeSectorCommodityUnits } from "@/lib/corporations/corpCommodityFlows";
import { resolveFormalizedGroups } from "@/lib/corporations/groups/groupMembership";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import type { SovereignDemandGapFund } from "@/lib/bonds/sovereignIssueDiagnostics";
import {
  computeFundAllocationBreakdown,
  INDEX_FUND_RESERVE_CASH_BUFFER_FRACTION,
} from "@/lib/indexFunds/fundAllocation";
import { getAllFundDefinitions } from "@/lib/indexFunds/fundDefinitions";
import { corpCapitalToAnchor } from "@/lib/currency/corporationCapital";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import { NPP_MARKET_ENTRY_FUNNEL_COLLECTION } from "@/lib/turn/npp/entryDiagnostics";
import { ECONOMIC_VITAL_SIGNS_WINDOW_TURNS } from "./economicVitalSignsHelpers";
import {
  type Inputs,
  type SovereignFundDemandInput,
  type VitalSignsHistoryRow,
  type CommodityParticipant,
  type RingFencedCashRow,
  computeEconomicVitalSigns,
} from "./economicVitalSignsMetrics";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { ledgerEntriesCollection } from "@/lib/db/repositories/ledgerEntries";
import { indexFundsCollection } from "@/lib/db/repositories/indexFunds";
import { shareOrdersCollection } from "@/lib/db/repositories/shareOrders";
import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { unownedSectorsCollection } from "@/lib/db/repositories/unownedSectors";
import { commodityPricesCollection } from "@/lib/db/repositories/commodityPrices";
import { corporationHistoryCollection } from "@/lib/db/repositories/corporationHistory";
export {
  summarizeLedgerTurnover,
  computeEconomicVitalSigns,
  type SovereignFundDemandInput,
  type VitalSignsHistoryRow,
  type LedgerTurnoverRow,
  type RingFencedCashRow,
  type RingFencedCashSummary,
} from "./economicVitalSignsMetrics";

export const ECONOMIC_VITAL_SIGNS_COLLECTION = "economicVitalSigns";

type ProjectedMetric = { value: number | null } | undefined;

type HistoryProjection = {
  turn: number;
  securities?: {
    depthToMarketCap?: ProjectedMetric;
    twoSidedListingShare?: ProjectedMetric;
    activeTradedListingShare?: ProjectedMetric;
    sovereignNoHolderBondShare?: ProjectedMetric;
    corporateNoHolderBondShare?: ProjectedMetric;
  };
};

/**
 * Mirror of `resolveFundBondCountryId` (fundBondReserve): the country whose
 * paper a fund buys when restricted to home paper. Kept local so the
 * diagnostics path does not import the deploy shell.
 */
function resolveGapFundHome(fund: Pick<IndexFund, "countryId" | "anchorCurrencyCode">): string {
  if (fund.countryId) return fund.countryId;
  const byCurrency = (Object.entries(COUNTRY_CURRENCY_MAP) as [string, string][]).find(
    ([, currency]) => currency === fund.anchorCurrencyCode
  );
  if (byCurrency) return byCurrency[0]!;
  return "US";
}

/**
 * Assemble the demand-gap input from projected reads plus loaded bonds.
 * The per-fund bond principal is valued in memory, adding no per-row query.
 */
function assembleSovereignFundDemand(
  bonds: Bond[],
  funds: IndexFund[],
  ratings: { _id: string; creditRating?: string }[],
  fxRows: ExchangeRate[],
  crossBorderEnabled: boolean
): SovereignFundDemandInput {
  const rateByCurrency = new Map(fxRows.map((row) => [row.currencyCode, row.rate]));
  const tradableCurrencies = fxRows.flatMap((row) =>
    row.currencyCode && typeof row.rate === "number" && row.rate > 0 ? [row.currencyCode] : []
  );
  const controlledCurrencies = fxRows.flatMap((row) =>
    row.currencyCode && row.capitalControls === true ? [row.currencyCode] : []
  );
  const ratingByCountry = new Map<string, string | undefined>();
  for (const row of ratings) {
    ratingByCountry.set(row._id === "federal" ? "US" : row._id, row.creditRating);
  }
  const universeBySlug = new Map(
    getAllFundDefinitions().flatMap((def) =>
      def.bondUniverse ? [[def.slug, def.bondUniverse] as const] : []
    )
  );
  // A position in a currency with no live rate contributes nothing instead of
  // failing the snapshot; the issue itself then classifies as
  // `currency_mismatch`, which is the actionable reading.
  const principalByFundId = new Map<string, number>();
  for (const bond of bonds) {
    const currencyCode =
      bond.currencyCode ??
      (bond.countryId && bond.countryId in COUNTRY_CURRENCY_MAP
        ? COUNTRY_CURRENCY_MAP[bond.countryId as keyof typeof COUNTRY_CURRENCY_MAP]
        : "USD");
    const rate = rateByCurrency.get(currencyCode) ?? 0;
    if (!(rate > 0)) continue;
    const price = Number.isFinite(bond.marketPrice) ? bond.marketPrice : 1;
    for (const holder of bond.holders ?? []) {
      const fundId = holder.fundId?.toString();
      const units =
        typeof holder.units === "number" && Number.isFinite(holder.units)
          ? Math.floor(holder.units)
          : 0;
      if (!fundId || units <= 0) continue;
      const local = units * BOND_UNIT_FACE_VALUE * price;
      principalByFundId.set(
        fundId,
        (principalByFundId.get(fundId) ?? 0) + corpCapitalToAnchor(local, currencyCode, rate)
      );
    }
  }
  const gapFunds: SovereignDemandGapFund[] = [];
  const fundIdToKey = new Map<string, string>();
  for (const fund of funds) {
    const id = fund._id.toString();
    fundIdToKey.set(id, fund.slug);
    // Same serviceability as the deploy pass (`listServiceableFunds`).
    const serviceable =
      fund.status === "active" ||
      (fund.status === "paused" && fund.pauseReason === "backing_ratio");
    const breakdown = computeFundAllocationBreakdown(
      {
        cashAnchor: fund.cashAnchor ?? 0,
        holdings: fund.holdings ?? [],
        bondAllocations: [],
        kind: fund.kind,
      },
      { bondPrincipalAnchor: principalByFundId.get(id) ?? 0 }
    );
    gapFunds.push({
      key: fund.slug,
      homeCountryId: resolveGapFundHome(fund),
      scope: fund.scope,
      kind: fund.kind,
      active: serviceable,
      deployableCashAnchor: breakdown.cashAvailableForBondDeployAnchor,
      cashAboveBufferAnchor: Math.max(
        0,
        breakdown.cashAnchor -
          Math.min(
            breakdown.cashAnchor,
            INDEX_FUND_RESERVE_CASH_BUFFER_FRACTION * breakdown.totalBackingAnchor
          )
      ),
      // Coverage funds ensured under the domestic gate carry no standing
      // definition entry; like the deploy path (`deployBondReserveFromCash`),
      // a country bond fund with a home country means its home-sovereign
      // mandate. Otherwise the classifier skips the fund and reports its
      // home issues as `no_domestic_fund`.
      bondUniverse:
        fund.kind === "bond"
          ? (universeBySlug.get(fund.slug) ??
            (fund.countryId ? ({ issuerType: "sovereign", homeOnly: true } as const) : undefined))
          : undefined,
    });
  }
  return {
    funds: gapFunds,
    fundIdToKey,
    tradableCurrencies,
    controlledCurrencies,
    ratingByCountry,
    crossBorderEnabled,
  };
}

export async function snapshotEconomicVitalSigns(
  db: Db,
  turn: number
): Promise<EconomicVitalSigns> {
  const windowStart = Math.max(0, turn - ECONOMIC_VITAL_SIGNS_WINDOW_TURNS + 1);
  const shareOrdersPromise = Promise.all([
    shareOrdersCollection(db).find({ status: "open" }).toArray(),
    shareOrdersCollection(db)
      .find({ status: "filled" })
      .sort({ updatedAt: -1 })
      .limit(5_000)
      .toArray(),
  ]).then(([open, filled]) => [...open, ...filled]);
  const [
    currentFlows,
    flowHistory,
    prices,
    sourcing,
    sectors,
    globalExchange,
    firmIncome,
    trades,
    shareOrders,
    bonds,
    globalWealth,
    money,
    reconciliation,
    balanceSnapshot,
    ledgerTurnover,
    ledgerEntryCount,
    groupMembership,
    exchangeRates,
    ringFencedCorps,
    unownedSectors,
    entryFunnel,
    eraUnitScale,
    historyDocs,
    demandFunds,
    demandRatings,
    demandLiquidity,
    inputReliefWorld,
  ] = await Promise.all([
    db.collection<CommodityFlow>("commodityFlows").find({ turn }).toArray(),
    db
      .collection<CommodityFlow>("commodityFlows")
      // Historical fill-rate medians only need these pooled totals. In
      // particular, do not decode each turn's large `byCountry` diagnostic
      // object for the entire 48-turn window.
      .find(
        { turn: { $gte: windowStart, $lte: turn } },
        {
          projection: {
            turn: 1,
            demandUnitsLedger: 1,
            demandUnits: 1,
            clearedUnitsPooled: 1,
            clearedUnits: 1,
          },
        }
      )
      .toArray(),
    commodityPricesCollection(db).find({}).toArray(),
    db.collection<CommoditySourcingDoc>("commoditySourcingFlows").find({ turn }).toArray(),
    // This diagnostics pass needs only commodity-flow inputs, production-health
    // readings, and the market-formation identity fields below. An exclusion
    // projection still decoded every other scalar on ~4,500 sectors; this
    // explicit read contract cuts the local payload from ~6.6MB to ~1.8MB.
    corporateSectorsCollection(db)
      .find(
        {},
        {
          projection: {
            _id: 1,
            corporationId: 1,
            countryId: 1,
            stateId: 1,
            sectorType: 1,
            revenue: 1,
            strategyId: 1,
            transitionFromStrategyId: 1,
            transitionStartTurn: 1,
            capitalStock: 1,
            operatingCapacityUnits: 1,
            producedUnits: 1,
            mothballed: 1,
            productionPolicyLevel: 1,
            embargoSuspended: 1,
            embargoExportExposure: 1,
            militaryDivertedFraction: 1,
            militaryDivertedTurn: 1,
            throughputFactor: 1,
            soldUnits: 1,
            workersDesired: 1,
            workers: 1,
            lowFillTurns: 1,
            stockpileUnsold: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        }
      )
      .toArray(),
    db.collection<StockExchangeSnapshot>("stockExchangeSnapshots").findOne({ _id: "global" }),
    corporationHistoryCollection<{ corporationId: { toString(): string }; income: number }>(db)
      .find({ turn }, { projection: { corporationId: 1, income: 1 } })
      .toArray(),
    db
      .collection<ShareTradeHistory>("shareTradeHistory")
      .find({ turn: { $gte: windowStart, $lte: turn } })
      .toArray(),
    shareOrdersPromise,
    bondsCollection(db).find({ matured: false }).toArray(),
    db.collection<WealthListSnapshot>("wealthListSnapshots").findOne({ _id: "global" }),
    db.collection<MoneySupplySnapshot>("moneySupplySnapshots").find({ turn }).toArray(),
    db.collection<LedgerReconciliation>("ledgerReconciliations").findOne({ turn }),
    db.collection<BalanceSnapshot>("balanceSnapshots").findOne({ turn }),
    loadLedgerTurnover(db, windowStart, turn),
    ledgerEntriesCollection(db).countDocuments({ turn: { $gte: windowStart, $lte: turn } }),
    resolveFormalizedGroups(db),
    exchangeRatesCollection(db).find({}).toArray(),
    // Ring-fenced money lives on corporations, outside the ledger: active bank
    // charter reserves plus share-escrow balances. Narrow projection on
    // purpose: only the classification and balance fields below are read.
    corporationsCollection(db)
      .find(
        { $or: [{ bankCharter: { $exists: true } }, { shareEscrowBalance: { $exists: true } }] },
        {
          projection: {
            "bankCharter.status": 1,
            "bankCharter.currency": 1,
            "bankCharter.cashReserves": 1,
            liquidCurrencyCode: 1,
            shareEscrowBalance: 1,
          },
        }
      )
      .toArray(),
    unownedSectorsCollection(db).find({}).toArray(),
    db
      .collection<NppMarketEntryFunnel>(NPP_MARKET_ENTRY_FUNNEL_COLLECTION)
      .findOne({ _id: `turn:${turn}` }),
    loadWorldEraUnitScale(db),
    // Narrow projection on purpose: the full snapshot carries per-cell arrays.
    db
      .collection<EconomicVitalSigns>(ECONOMIC_VITAL_SIGNS_COLLECTION)
      .find({ turn: { $gte: windowStart, $lt: turn } })
      .project<HistoryProjection>({
        turn: 1,
        "securities.depthToMarketCap.value": 1,
        "securities.twoSidedListingShare.value": 1,
        "securities.activeTradedListingShare.value": 1,
        "securities.sovereignNoHolderBondShare.value": 1,
        "securities.corporateNoHolderBondShare.value": 1,
      })
      .sort({ turn: 1 })
      .toArray(),
    // Demand-gap inputs: three batched projected reads, no per-row loop.
    // Fund holdings arrays stay out of the projection; the bond principal
    // comes from the `bonds` read above, computed in memory below.
    indexFundsCollection(db)
      .find(
        {},
        {
          projection: {
            slug: 1,
            countryId: 1,
            scope: 1,
            kind: 1,
            status: 1,
            pauseReason: 1,
            anchorCurrencyCode: 1,
            cashAnchor: 1,
            "holdings.shares": 1,
            "holdings.avgCostPerShareAnchor": 1,
            "holdings.lastValueAnchor": 1,
          },
        }
      )
      .toArray(),
    federalBudgetCollection<{
      _id: string;
      creditRating?: string;
      economicFactors?: { inflationRate?: number };
    }>(db)
      .find({}, { projection: { creditRating: 1, "economicFactors.inflationRate": 1 } })
      .toArray(),
    gameConfigCollection(db).findOne(
      { _id: "default" },
      { projection: { indexFundBondLiquidityEnabled: 1 } }
    ),
    gameStateCollection<{ _id: string; preset?: string; hardwareInputReliefStartTurn?: number }>(
      db
    ).findOne({ _id: "current" }, { projection: { preset: 1, hardwareInputReliefStartTurn: 1 } }),
  ]);
  const fxByCurrency = new Map(exchangeRates.map((row) => [row.currencyCode, row.rate]));
  if (!fxByCurrency.has("USD")) fxByCurrency.set("USD", 1);
  const ringFenced: RingFencedCashRow[] = ringFencedCorps.map((corp) => ({
    charterActive: corp.bankCharter?.status === "active",
    charterCurrency: corp.bankCharter?.currency ?? "USD",
    cashReserves: corp.bankCharter?.cashReserves,
    // Absent on pre-forex corps: home currency, same fallback the
    // corporation type documents for liquidCapital.
    liquidCurrency: corp.liquidCurrencyCode ?? "USD",
    escrowBalance: corp.shareEscrowBalance,
  }));
  const commodityParticipants: CommodityParticipant[] = [];
  for (const sector of sectors) {
    const corporationId = sector.corporationId.toString();
    const currencyCode = COUNTRY_CURRENCY_MAP[sector.countryId];
    const fxRate = fxByCurrency.get(currencyCode) ?? 1;
    const { supply, demand } = computeSectorCommodityUnits(
      {
        ...sector,
        revenueAnchor: fxRate > 0 ? sector.revenue / fxRate : sector.revenue,
        capacityUnits: sector.operatingCapacityUnits ?? sector.capitalStock,
      },
      turn,
      {
        plantsEnabled: true,
        preset: inputReliefWorld?.preset,
        hardwareInputReliefStartTurn: inputReliefWorld?.hardwareInputReliefStartTurn,
      }
    );
    const commodities = new Set([...supply.keys(), ...demand.keys()]);
    for (const commodity of commodities) {
      commodityParticipants.push({
        commodity,
        corporationId,
        ownershipRootId: groupMembership.rootByCorpId.get(corporationId) ?? corporationId,
        sellerUnits: supply.get(commodity) ?? 0,
        buyerUnits: demand.get(commodity) ?? 0,
      });
    }
  }
  const history: VitalSignsHistoryRow[] = historyDocs.map((doc) => ({
    turn: doc.turn,
    depthToMarketCap: doc.securities?.depthToMarketCap?.value ?? null,
    twoSidedListingShare: doc.securities?.twoSidedListingShare?.value ?? null,
    activeTradedListingShare: doc.securities?.activeTradedListingShare?.value ?? null,
    sovereignNoHolderBondShare: doc.securities?.sovereignNoHolderBondShare?.value ?? null,
    corporateNoHolderBondShare: doc.securities?.corporateNoHolderBondShare?.value ?? null,
  }));
  const sovereignDemand = assembleSovereignFundDemand(
    bonds,
    demandFunds,
    demandRatings,
    exchangeRates,
    demandLiquidity?.indexFundBondLiquidityEnabled === true
  );
  const health = nationalInflationByCountry(demandRatings);
  const snapshot = computeEconomicVitalSigns({
    turn,
    now: new Date(),
    history,
    currentFlows,
    flowHistory,
    prices,
    sourcing,
    sectors,
    globalExchange,
    firmIncome: firmIncome.map((row) => ({
      corporationId: row.corporationId.toString(),
      income: row.income,
    })),
    trades,
    shareOrders,
    bonds,
    globalWealth,
    money,
    health,
    reconciliation,
    balanceSnapshot,
    ledgerTurnover,
    ledgerEntryCount,
    ringFenced,
    anchorRates: Object.fromEntries(fxByCurrency),
    commodityParticipants,
    unownedSectors,
    entryFunnel,
    eraUnitScale,
    sovereignDemand,
  });
  await db
    .collection<EconomicVitalSigns>(ECONOMIC_VITAL_SIGNS_COLLECTION)
    .replaceOne({ _id: snapshot._id }, snapshot, { upsert: true });
  return snapshot;
}

/**
 * Per-country inflation from the national budgets, the same source and default
 * the health snapshot's economy block uses: the US budget is the legacy
 * `federal` document and every other national budget is keyed by country code.
 */
export function nationalInflationByCountry(
  budgets: ReadonlyArray<{ _id: string; economicFactors?: { inflationRate?: number } }>
): NonNullable<Inputs["health"]> {
  const byCountry: Partial<Record<string, { inflation: number }>> = {};
  for (const budget of budgets) {
    const countryId = budget._id === "federal" ? "US" : budget._id;
    byCountry[countryId] = { inflation: budget.economicFactors?.inflationRate ?? 0 };
  }
  return { economy: { byCountry } };
}
