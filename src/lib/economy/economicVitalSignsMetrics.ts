/** Pure metric computation for the economic vital signs snapshot. */
import type { CommodityFlow } from "@/lib/db/types/commodityFlow";
import type {
  CommodityPrice,
  CorporateSector,
  StockExchangeSnapshot,
  ShareTradeHistory,
  ShareOrder,
  Bond,
  WealthListSnapshot,
  MoneySupplySnapshot,
  UnownedSector,
  NppMarketEntryFunnel,
  EconomicVitalSigns,
} from "@/lib/db/types";
import type { CommoditySourcingDoc } from "@/lib/logistics/sourcingLedger";
import type { LedgerReconciliation, BalanceSnapshot, LedgerEntry } from "@/lib/ledger/types";
import {
  type SovereignDemandGapFund,
  summarizeSovereignIssuanceByCountry,
  type SovereignDiagnosticBond,
  classifySovereignDemandGap,
} from "@/lib/bonds/sovereignIssueDiagnostics";
import type { CommodityType } from "@/lib/constants/commodities";
import { computeMarketFormationSnapshot } from "@/lib/economy/marketFormation";
import {
  isTradableListing,
  tradableListingIds,
  clampShare,
} from "@/lib/stockExchange/listingEligibility";
import { currentMoneyGrowth } from "@/lib/moneySupply/rules/growthSignal";
import { MONEY_ACCOUNTING_VERSION } from "@/lib/moneySupply/calculate";
import {
  ECONOMIC_VITAL_SIGNS_WINDOW_TURNS,
  finite,
  ratio,
  fundUnitsByKey,
  metric,
  median,
  computeCoverage,
  recent12Median,
  correlation,
  gini,
  concentration,
  nonnegative,
  marketQuality,
  relevantMarketDiagnostics,
  summarizeRingFencedCash,
  monetaryActivity,
  fillByTurn,
} from "./economicVitalSignsHelpers";

export type Inputs = {
  turn: number;
  now: Date;
  currentFlows: CommodityFlow[];
  flowHistory: CommodityFlow[];
  prices: CommodityPrice[];
  sourcing: CommoditySourcingDoc[];
  sectors: CorporateSector[];
  globalExchange: StockExchangeSnapshot | null;
  /** Realized same-turn corporation results used for firm profitability. */
  firmIncome?: Array<{ corporationId: string; income: number }>;
  trades: ShareTradeHistory[];
  shareOrders: ShareOrder[];
  bonds: Bond[];
  globalWealth: WealthListSnapshot | null;
  money: MoneySupplySnapshot[];
  /**
   * Per-country inflation, keyed by country. Built from national budgets,
   * so vital signs no longer wait on the health snapshot (which runs after
   * the turn lock is released).
   */
  health: { economy: { byCountry: Partial<Record<string, { inflation: number }>> } } | null;
  reconciliation: LedgerReconciliation | null;
  balanceSnapshot: BalanceSnapshot | null;
  /** Per-account primary-leg turnover over the window (see summarizeLedgerTurnover). */
  ledgerTurnover: LedgerTurnoverRow[];
  /** How many ledger entries the window covered; a sample-size input only. */
  ledgerEntryCount: number;
  /** One row per corporation carrying ring-fenced money (see summarizeRingFencedCash). */
  ringFenced?: RingFencedCashRow[];
  /** Anchor rates by currency code; unknown currencies convert 1:1. */
  anchorRates?: Record<string, number>;
  commodityParticipants: CommodityParticipant[];
  unownedSectors?: UnownedSector[];
  entryFunnel?: NppMarketEntryFunnel | null;
  eraUnitScale?: number;
  history?: VitalSignsHistoryRow[];
  /**
   * Fund demand snapshot; absent in unit tests and older callers, in which
   * case per-country rows carry no `demandGapByReason` and read as before.
   */
  sovereignDemand?: SovereignFundDemandInput;
};

/**
 * Everything `classifySovereignDemandGap` needs beyond the bonds themselves:
 * plain data, resolved by the caller from projected `indexFunds`,
 * `federalBudget`, `exchangeRates`, and `gameConfig` reads.
 */
export type SovereignFundDemandInput = {
  funds: SovereignDemandGapFund[];
  /** Bond holder `fundId` (string) to classifier fund key (slug). */
  fundIdToKey: ReadonlyMap<string, string>;
  tradableCurrencies: readonly string[];
  controlledCurrencies: readonly string[];
  ratingByCountry: ReadonlyMap<string, string | undefined>;
  /** `indexFundBondLiquidityEnabled`: the cross-border equity demand flag. */
  crossBorderEnabled: boolean;
};

/**
 * One prior turn's persisted securities readings, loaded with a narrow projection.
 * The full snapshot document carries per-cell arrays, so never load it whole here.
 */
export type VitalSignsHistoryRow = {
  turn: number;
  depthToMarketCap: number | null;
  twoSidedListingShare: number | null;
  activeTradedListingShare: number | null;
  sovereignNoHolderBondShare: number | null;
  corporateNoHolderBondShare: number | null;
};

export type CommodityParticipant = {
  commodity: CommodityType;
  corporationId: string;
  ownershipRootId: string;
  sellerUnits: number;
  buyerUnits: number;
};

/**
 * Absolute primary-leg turnover for one account over the measurement window.
 *
 * This is all `monetaryActivity` ever needed from the ledger, and collapsing to
 * it in the database instead of in Node is the difference between loading
 * 61,398 documents (23.5MB) and 1,389 rows (88KB) on a measured world.
 */
export interface LedgerTurnoverRow {
  account: string;
  turnover: number;
}

/**
 * Roll raw ledger entries into per-account turnover.
 *
 * Production does not call this: it runs the equivalent `$group` in Mongo (see
 * loadLedgerTurnover) rather than shipping every entry over the wire. It exists
 * so callers that already hold entries in memory — tests asserting velocity
 * maths from real legs, offline analysis — can produce the same input without
 * duplicating the rule about which legs count.
 */
export function summarizeLedgerTurnover(entries: LedgerEntry[]): LedgerTurnoverRow[] {
  const byAccount = new Map<string, number>();
  for (const entry of entries) {
    for (const leg of entry.legs) {
      if (leg.role !== "primary") continue;
      byAccount.set(leg.account, (byAccount.get(leg.account) ?? 0) + Math.abs(leg.anchorAmount));
    }
  }
  return [...byAccount.entries()].map(([account, turnover]) => ({ account, turnover }));
}

/**
 * One corporation's ring-fenced money: bank cash reserves plus share escrow.
 *
 * Both sit outside the shadow ledger. The bank's `cashReserves` are
 * ring-fenced from the parent's `liquidCapital` (see `banking/bankCash.ts`),
 * so the corporation ledger account never sees them; `shareEscrowBalance`
 * settles float trades in escrow mode and likewise emits no ledger legs.
 * Only active charters count as banks: revoked or failed charters hold no
 * spendable bank money, and their cash is in recovery or already returned.
 */
export interface RingFencedCashRow {
  charterActive: boolean;
  charterCurrency: string;
  /** Absent on charters written before the ring-fence: unclassified, not zero. */
  cashReserves: number | undefined;
  liquidCurrency: string;
  /** Absent in instant settlement mode, which holds no escrow: zero, not unknown. */
  escrowBalance: number | undefined;
}

export interface RingFencedCashSummary {
  banksTotal: number;
  banksReported: number;
  bankCashAnchor: number;
  escrowAnchor: number;
  escrowContributors: number;
}

export function computeEconomicVitalSigns(input: Inputs): EconomicVitalSigns {
  const marketFormation = computeMarketFormationSnapshot({
    sectors: input.sectors,
    unownedSectors: input.unownedSectors ?? [],
    prices: input.prices,
    entryFunnel: input.entryFunnel,
    eraUnitScale: input.eraUnitScale ?? 1,
  });
  const pooledDemand = input.currentFlows.reduce(
    (sum, flow) => sum + (flow.demandUnitsLedger ?? flow.demandUnits),
    0
  );
  const pooledCleared = input.currentFlows.reduce(
    (sum, flow) => sum + (flow.clearedUnitsPooled ?? flow.clearedUnits),
    0
  );
  let scopedDemand = 0;
  let scopedCleared = 0;
  for (const flow of input.currentFlows) {
    for (const row of Object.values(flow.byCountry)) {
      scopedDemand += row.demand;
      scopedCleared += row.clearedUnitsScoped ?? row.cleared;
    }
  }

  const basePrice = new Map(input.prices.map((price) => [price.commodity, price.basePrice]));
  const priceMultiples: number[] = [];
  const scarcity: number[] = [];
  for (const flow of input.currentFlows) {
    const base = basePrice.get(flow.commodity);
    const demand = flow.demandUnitsLedger ?? flow.demandUnits;
    if (!base || base <= 0 || demand <= 0) continue;
    priceMultiples.push(flow.price / base);
    scarcity.push(Math.max(0, 1 - (flow.clearedUnitsPooled ?? flow.clearedUnits) / demand));
  }
  const windowFill = fillByTurn(input.flowHistory);
  const windowValues = [...windowFill.values()];
  const recent12Values = [...windowFill.entries()]
    .filter(([turn]) => turn >= input.turn - 11)
    .map(([, value]) => value);

  const intent = input.sourcing.reduce((sum, row) => sum + row.demandUnitsIntent, 0);
  const local = input.sourcing.reduce((sum, row) => sum + row.intraStateUnits, 0);
  const interstate = input.sourcing.reduce((sum, row) => sum + row.interStateUnits, 0);
  const imported = input.sourcing.reduce((sum, row) => sum + row.importUnits, 0);
  const unmet = input.sourcing.reduce((sum, row) => sum + row.unmetUnits, 0);
  const toleranceBound = input.sourcing.reduce((sum, row) => sum + row.toleranceBoundUnits, 0);
  const capacityBound = input.sourcing.reduce((sum, row) => sum + row.capacityBoundUnits, 0);
  const shortageResponsive = input.sourcing.reduce(
    (sum, row) => sum + (row.shortageResponsiveUnits ?? 0),
    0
  );
  const fulfilled = local + interstate + imported;

  const throughputObserved = input.sectors.filter((sector) => finite(sector.throughputFactor));
  const productionWeight = input.sectors.reduce(
    (sum, sector) => sum + Math.max(0, sector.producedUnits ?? 0),
    0
  );
  const soldWeight = input.sectors.reduce(
    (sum, sector) => sum + Math.max(0, sector.soldUnits ?? 0),
    0
  );
  const desiredWorkers = input.sectors.reduce(
    (sum, sector) => sum + Math.max(0, sector.workersDesired ?? sector.workers ?? 0),
    0
  );
  const staffedWorkers = input.sectors.reduce(
    (sum, sector) => sum + Math.max(0, sector.workers ?? 0),
    0
  );

  const listings = input.globalExchange?.listings ?? [];
  const listedCorporationIds = new Set(listings.map((listing) => listing._id.toString()));
  const listedFirmIncome = (input.firmIncome ?? []).filter((row) =>
    listedCorporationIds.has(row.corporationId)
  );
  const marketCaps = listings.map((listing) => listing.marketCapAnchor ?? listing.marketCap ?? 0);
  const firmConcentration = concentration(marketCaps);
  const marketCapTotal = marketCaps.reduce((sum, value) => sum + Math.max(0, value), 0);
  const revenueTotal = listings.reduce(
    (sum, listing) => sum + (listing.totalRevenueAnchor ?? listing.totalRevenue ?? 0),
    0
  );
  const incomeTotal = listings.reduce(
    (sum, listing) => sum + (listing.incomeAnchor ?? listing.income ?? 0),
    0
  );

  const economicTradeKinds = new Set<ShareTradeHistory["kind"]>([
    "market_buy",
    "market_sell",
    "limit_fill",
    "peer_fill",
    "listing_fill",
    "takeover_buyout",
  ]);
  const economicTrades = input.trades.filter((trade) => economicTradeKinds.has(trade.kind));
  // Eligible tradable set: zero-share / zero-float rows stay visible as firms
  // but leave every breadth denominator. The retained 48-turn window is
  // intersected with it so dissolved/delisted corporations cannot linger in a
  // numerator after leaving current listings.
  const tradable = listings.filter(isTradableListing);
  const tradableIds = tradableListingIds(listings);
  const quality = marketQuality(tradable, input.shareOrders, economicTrades);
  const competition = relevantMarketDiagnostics(input.commodityParticipants, input.currentFlows);
  const tradedCorporations = new Set(
    economicTrades
      .map((trade) => trade.corporationId.toString())
      .filter((id) => tradableIds.has(id))
  );
  const tradableCount = tradable.length;
  const activeBonds = input.bonds.filter((bond) => !bond.matured);
  const sovereignBonds = activeBonds.filter((bond) => bond.issuerType === "sovereign");
  const corporateBonds = activeBonds.filter((bond) => bond.issuerType !== "sovereign");
  const noHolderShare = (bonds: Bond[]) =>
    metric(
      ratio(
        bonds.filter((bond) => bond.holders.filter((holder) => holder.units > 0).length === 0)
          .length,
        bonds.length
      ),
      bonds.length,
      "unmatured_bond_count"
    );
  const bondHolderCounts = activeBonds.map(
    (bond) => bond.holders.filter((holder) => holder.units > 0).length
  );
  const bondHeldUnits = activeBonds.reduce(
    (sum, bond) =>
      sum + bond.holders.reduce((holderSum, holder) => holderSum + nonnegative(holder.units), 0),
    0
  );
  const bondFloatUnits = activeBonds.reduce((sum, bond) => sum + nonnegative(bond.publicFloat), 0);
  const sovereignHolderCounts = sovereignBonds.map(
    (bond) => bond.holders.filter((holder) => holder.units > 0).length
  );
  const corporateHolderCounts = corporateBonds.map(
    (bond) => bond.holders.filter((holder) => holder.units > 0).length
  );
  const corporateHeldUnits = corporateBonds.reduce(
    (sum, bond) =>
      sum + bond.holders.reduce((holderSum, holder) => holderSum + nonnegative(holder.units), 0),
    0
  );
  const corporateFloatUnits = corporateBonds.reduce(
    (sum, bond) => sum + nonnegative(bond.publicFloat),
    0
  );
  const sovereignHeldUnits = sovereignBonds.reduce(
    (sum, bond) =>
      sum + bond.holders.reduce((holderSum, holder) => holderSum + nonnegative(holder.units), 0),
    0
  );
  const sovereignFloatUnits = sovereignBonds.reduce(
    (sum, bond) => sum + nonnegative(bond.publicFloat),
    0
  );
  const sovereignFaceByMaturity = new Map<number, number>();
  for (const bond of sovereignBonds) {
    sovereignFaceByMaturity.set(
      bond.maturityTurn,
      (sovereignFaceByMaturity.get(bond.maturityTurn) ?? 0) + nonnegative(bond.totalIssued)
    );
  }
  const sovereignMaturityValues = [...sovereignFaceByMaturity.values()];
  const sovereignMaturityConcentration = concentration(sovereignMaturityValues);
  const corporateFaceByMaturity = new Map<number, number>();
  for (const bond of corporateBonds) {
    corporateFaceByMaturity.set(
      bond.maturityTurn,
      (corporateFaceByMaturity.get(bond.maturityTurn) ?? 0) + nonnegative(bond.totalIssued)
    );
  }
  const corporateMaturityValues = [...corporateFaceByMaturity.values()];
  const corporateMaturityConcentration = concentration(corporateMaturityValues);

  const wealth = input.globalWealth?.entries.map((entry) => Math.max(0, entry.totalWealth)) ?? [];
  const aggregateWealth = wealth.reduce((sum, value) => sum + value, 0);
  const topTenWealth = [...wealth]
    .sort((a, b) => b - a)
    .slice(0, 10)
    .reduce((sum, value) => sum + value, 0);

  const moneyGrowth = input.money.flatMap((row) => {
    const growth = currentMoneyGrowth(row);
    return growth == null ? [] : [growth];
  });
  const inflationByCountry = new Map(
    Object.entries(input.health?.economy.byCountry ?? {}).flatMap(([countryId, row]) =>
      row && finite(row.inflation) ? [[countryId, row.inflation] as const] : []
    )
  );
  const pairedGrowth: number[] = [];
  const pairedInflation: number[] = [];
  for (const row of input.money) {
    const inflation = inflationByCountry.get(row.countryId);
    const growth = currentMoneyGrowth(row);
    if (growth == null || !finite(inflation)) continue;
    pairedGrowth.push(growth);
    pairedInflation.push(inflation);
  }
  const totalM2 = input.money.reduce((sum, row) => sum + Math.max(0, row.m2), 0);
  const totalM1 = input.money.reduce((sum, row) => sum + Math.max(0, row.m1), 0);
  const totalExternalBroadMoney = input.money.reduce(
    (sum, row) => sum + Math.max(0, row.externalBroadMoney),
    0
  );
  const totalBankDeposits = input.money.reduce(
    (sum, row) => sum + Math.max(0, row.bankDeposits),
    0
  );
  const totalCredit = input.money.reduce((sum, row) => sum + Math.max(0, row.creditOutstanding), 0);
  // Bond-pool settlement inventory excluded from observed M2 under the v3
  // boundary. Legacy rows predate the field and contribute zero, so a
  // mixed-version window under-reports rather than inventing history.
  const totalExcludedBondPoolCash = input.money.reduce(
    (sum, row) => sum + Math.max(0, row.excludedBondPoolCash ?? 0),
    0
  );
  const currentAccountingRows = input.money.filter(
    (row) => row.accountingVersion === MONEY_ACCOUNTING_VERSION
  );
  const observationVersions: Record<string, number | null> = {};
  const observationConfidence: Record<string, "high" | "medium" | "low"> = {};
  for (const row of input.money) {
    observationVersions[row.currencyCode] = row.accountingVersion ?? null;
    observationConfidence[row.currencyCode] =
      currentMoneyGrowth(row) != null
        ? "high"
        : row.accountingVersion === MONEY_ACCOUNTING_VERSION
          ? "medium"
          : "low";
  }
  const activity = monetaryActivity(input.balanceSnapshot, input.ledgerTurnover);
  const ring = summarizeRingFencedCash(input.ringFenced ?? [], input.anchorRates ?? {});
  const ringBankIncomplete = ring.banksTotal > ring.banksReported;
  const ringTotal = ring.bankCashAnchor + ring.escrowAnchor;
  const history = input.history ?? [];
  const coverage = computeCoverage(input.turn, history);
  const measurementReasons: string[] = [];
  if (ringBankIncomplete) {
    measurementReasons.push(
      `bank_cash_incomplete_${ring.banksReported}_of_${ring.banksTotal}_reporting`
    );
  }
  if (coverage.missingTurns.length > 0) {
    measurementReasons.push(`window_missing_${coverage.missingTurns.length}_turns`);
  }
  if (!input.reconciliation) measurementReasons.push("current_turn_reconciliation_unavailable");
  else if (input.reconciliation.status !== "green") {
    measurementReasons.push(`reconciliation_${input.reconciliation.status}`);
  }
  if (input.reconciliation?.stockVsFlow.skipped) {
    measurementReasons.push("stock_vs_flow_skipped");
  }
  if (!input.balanceSnapshot) measurementReasons.push("balance_snapshot_unavailable");
  if (quality.spreads.length < 5) measurementReasons.push("fewer_than_five_two_sided_books");
  if (input.currentFlows.length === 0) measurementReasons.push("commodity_flow_sample_empty");
  if (input.commodityParticipants.length === 0) {
    measurementReasons.push("commodity_participant_sample_empty");
  }
  if (!input.entryFunnel) measurementReasons.push("npp_entry_funnel_unavailable");
  if (currentAccountingRows.length < input.money.length) {
    measurementReasons.push("money_observation_version_transition");
  }
  if (moneyGrowth.length < currentAccountingRows.length) {
    measurementReasons.push("money_growth_awaiting_comparable_window");
  }
  const measurementConfidence: EconomicVitalSigns["measurement"]["confidence"] =
    measurementReasons.length === 0
      ? "high"
      : input.reconciliation?.status === "red" || !input.reconciliation
        ? "low"
        : "medium";

  return {
    _id: `turn:${input.turn}`,
    schemaVersion: 1,
    turn: input.turn,
    windowTurns: ECONOMIC_VITAL_SIGNS_WINDOW_TURNS,
    generatedAt: input.now,
    goods: {
      pooledFillRate: metric(
        ratio(pooledCleared, pooledDemand),
        input.currentFlows.length,
        "ledger_aggregate"
      ),
      countryScopedFillRate: metric(
        ratio(scopedCleared, scopedDemand),
        input.currentFlows.length,
        "country_scoped_ledger"
      ),
      medianPriceMultiple: metric(
        median(priceMultiples),
        priceMultiples.length,
        "global_price_to_seed_base"
      ),
      priceScarcityCorrelation: metric(
        correlation(priceMultiples, scarcity),
        priceMultiples.length,
        "commodity_cross_section"
      ),
      pooledFillRateWindowMedian: metric(
        median(windowValues),
        windowValues.length,
        "per_turn_pooled_fill"
      ),
      pooledFillRateRecent12Median: metric(
        median(recent12Values),
        recent12Values.length,
        "per_turn_pooled_fill"
      ),
    },
    trade: {
      intentFulfillmentRate: metric(
        ratio(fulfilled, intent),
        input.sourcing.length,
        "buyer_intent_sourcing"
      ),
      localShare: metric(ratio(local, fulfilled), input.sourcing.length, "fulfilled_buyer_intent"),
      interstateShare: metric(
        ratio(interstate, fulfilled),
        input.sourcing.length,
        "fulfilled_buyer_intent"
      ),
      importShare: metric(
        ratio(imported, fulfilled),
        input.sourcing.length,
        "fulfilled_buyer_intent"
      ),
      toleranceBoundShareOfUnmet: metric(
        ratio(toleranceBound, unmet),
        input.sourcing.length,
        "unmet_buyer_intent"
      ),
      capacityBoundShareOfUnmet: metric(
        ratio(capacityBound, unmet),
        input.sourcing.length,
        "unmet_buyer_intent"
      ),
      shortageResponsiveShareOfFulfillment: metric(
        ratio(shortageResponsive, fulfilled),
        input.sourcing.length,
        "fulfilled_buyer_intent"
      ),
    },
    production: {
      sectorsObserved: input.sectors.length,
      // Commodities whose recorded demand was cut by the 1.5x caps this turn,
      // and the worst latent shortage among them. Every unmet-share figure
      // elsewhere in this report is measured AFTER those caps.
      demandTruncatedCommodities: metric(
        input.prices.filter((p) => (p.demandTruncatedUnits ?? 0) > 0).length,
        input.prices.length,
        "commodity_count"
      ),
      maxLatentShortageMultiple: metric(
        input.prices.reduce((max, p) => Math.max(max, p.latentShortageMultiple ?? 0), 0),
        input.prices.length,
        "commodity_count"
      ),
      throughputFloorShare: metric(
        ratio(
          throughputObserved.filter((sector) => sector.throughputFactor! <= 0.500001).length,
          throughputObserved.length
        ),
        throughputObserved.length,
        "sector_count"
      ),
      physicalSellThrough: metric(
        ratio(soldWeight, productionWeight),
        input.sectors.length,
        "produced_units_weighted"
      ),
      labourStaffingRate: metric(
        ratio(staffedWorkers, desiredWorkers),
        input.sectors.length,
        "desired_workers_weighted"
      ),
      chronicLowFillShare: metric(
        ratio(
          input.sectors.filter((sector) => (sector.lowFillTurns ?? 0) >= 12).length,
          input.sectors.length
        ),
        input.sectors.length,
        "sector_count_low_fill_12_turns"
      ),
      stockpilingShare: metric(
        ratio(
          input.sectors.filter((sector) => sector.stockpileUnsold === true).length,
          input.sectors.length
        ),
        input.sectors.length,
        "sector_count"
      ),
    },
    firms: {
      listings: listings.length,
      marketCapitalizationAnchor: marketCapTotal,
      revenueAnchor: revenueTotal,
      incomeAnchor: incomeTotal,
      lossMakingShare: metric(
        ratio(listedFirmIncome.filter((row) => row.income < 0).length, listedFirmIncome.length),
        listedFirmIncome.length,
        "same_turn_listed_corporation_history_income"
      ),
      marketCapHhi: metric(firmConcentration.hhi, listings.length, "market_cap_anchor"),
      topFourMarketCapShare: metric(
        firmConcentration.topFourShare,
        listings.length,
        "market_cap_anchor"
      ),
    },
    competition,
    marketFormation,
    securities: {
      equityTrades48Turns: economicTrades.length,
      equityNotionalAnchor48Turns: economicTrades.reduce(
        (sum, trade) => sum + Math.max(0, trade.totalAnchor),
        0
      ),
      activeTradedListingShare: metric(
        clampShare(ratio(tradedCorporations.size, tradableCount)),
        tradableCount,
        "tradable_listing_count_48_turns"
      ),
      activeBonds: activeBonds.length,
      noHolderBondShare: metric(
        ratio(bondHolderCounts.filter((count) => count === 0).length, activeBonds.length),
        activeBonds.length,
        "unmatured_bond_count"
      ),
      sovereignNoHolderBondShare: noHolderShare(sovereignBonds),
      corporateNoHolderBondShare: noHolderShare(corporateBonds),
      medianBondHolders: metric(
        median(bondHolderCounts),
        activeBonds.length,
        "unmatured_bond_count"
      ),
      bondSubscriptionRate: metric(
        ratio(bondHeldUnits, bondHeldUnits + bondFloatUnits),
        activeBonds.length,
        "unmatured_bond_units"
      ),
      sovereignMedianHolders: metric(
        median(sovereignHolderCounts),
        sovereignBonds.length,
        "unmatured_sovereign_issue_count"
      ),
      sovereignSubscriptionRate: metric(
        ratio(sovereignHeldUnits, sovereignHeldUnits + sovereignFloatUnits),
        sovereignBonds.length,
        "unmatured_sovereign_units"
      ),
      corporateMedianHolders: metric(
        median(corporateHolderCounts),
        corporateBonds.length,
        "unmatured_corporate_issue_count"
      ),
      corporateSubscriptionRate: metric(
        ratio(corporateHeldUnits, corporateHeldUnits + corporateFloatUnits),
        corporateBonds.length,
        "unmatured_corporate_units"
      ),
      sovereignMaturityHhi: metric(
        sovereignMaturityConcentration.hhi,
        sovereignMaturityValues.length,
        "sovereign_face_by_maturity_turn"
      ),
      corporateMaturityHhi: metric(
        corporateMaturityConcentration.hhi,
        corporateMaturityValues.length,
        "corporate_face_by_maturity_turn"
      ),
      sovereignMedianPriceToParSpreadPct: metric(
        median(sovereignBonds.map((bond) => (1 - bond.marketPrice) * 100)),
        sovereignBonds.length,
        "unmatured_sovereign_issue_count"
      ),
      sovereignIssuanceByCountry: summarizeSovereignIssuanceByCountry(
        activeBonds,
        input.sovereignDemand
          ? (issue: SovereignDiagnosticBond) =>
              classifySovereignDemandGap(
                {
                  countryId: issue.countryId ?? null,
                  currencyCode: issue.currencyCode ?? null,
                  totalIssued: issue.totalIssued,
                  faceValue: issue.faceValue,
                  publicFloat: issue.publicFloat,
                  heldUnitsByFundKey: fundUnitsByKey(
                    issue.holders,
                    input.sovereignDemand!.fundIdToKey
                  ),
                },
                input.sovereignDemand!.funds,
                {
                  tradableCurrencies: input.sovereignDemand!.tradableCurrencies,
                  controlledCurrencies: input.sovereignDemand!.controlledCurrencies,
                },
                input.sovereignDemand!.ratingByCountry,
                input.sovereignDemand!.crossBorderEnabled
              )
          : undefined
      ),
      corporateMedianPriceToParSpreadPct: metric(
        median(corporateBonds.map((bond) => (1 - bond.marketPrice) * 100)),
        corporateBonds.length,
        "unmatured_corporate_issue_count"
      ),
      openBuyOrders: quality.openBuyOrders,
      openSellOrders: quality.openSellOrders,
      twoSidedListingShare: metric(
        clampShare(ratio(quality.twoSidedListings, tradableCount)),
        tradableCount,
        "tradable_listing_count_open_order_books"
      ),
      facilityQuotedListings: quality.facilityQuotedListings,
      organicTwoSidedListingShare: metric(
        clampShare(ratio(quality.organicTwoSidedListings, tradableCount)),
        tradableCount,
        "tradable_listing_count_open_order_books_excluding_liquidity_facility"
      ),
      medianQuotedSpreadPct: metric(
        median(quality.spreads),
        quality.spreads.length,
        "two_sided_non_crossed_books"
      ),
      openOrderDepthAnchor: quality.depthAnchor,
      openBidDepthAnchor: quality.bidDepthAnchor,
      depthToMarketCap: metric(
        ratio(quality.depthAnchor, marketCapTotal),
        input.shareOrders.filter((order) => order.status === "open").length,
        "open_order_notional_to_listed_market_cap"
      ),
      organicDepthToMarketCap: metric(
        ratio(quality.organicDepthAnchor, marketCapTotal),
        input.shareOrders.filter(
          (order) => order.status === "open" && order.liquidityProvider !== true
        ).length,
        "open_order_notional_to_listed_market_cap_excluding_liquidity_facility"
      ),
      medianFilledOrderExecutionHours: metric(
        median(quality.executionHours),
        quality.executionHours.length,
        "retained_filled_orders_wall_clock"
      ),
      medianAmihudIlliquidity48: metric(
        median(quality.amihud),
        quality.amihud.length,
        "absolute_48h_return_pct_per_million_anchor_notional"
      ),
      medianTopTraderNotionalShare48: metric(
        median(quality.topTraderShares),
        quality.topTraderShares.length,
        "named_counterparty_share_of_listing_notional_48_turns"
      ),
    },
    coverage,
    securitiesRecent12: {
      depthToMarketCapMedian: recent12Median(
        input.turn,
        history,
        ratio(quality.depthAnchor, marketCapTotal),
        (row) => row.depthToMarketCap,
        "open_order_notional_to_listed_market_cap_median_12"
      ),
      twoSidedListingShareMedian: recent12Median(
        input.turn,
        history,
        clampShare(ratio(quality.twoSidedListings, tradableCount)),
        (row) => row.twoSidedListingShare,
        "tradable_listing_count_open_order_books_median_12"
      ),
      activeTradedListingShareMedian: recent12Median(
        input.turn,
        history,
        clampShare(ratio(tradedCorporations.size, tradableCount)),
        (row) => row.activeTradedListingShare,
        "tradable_listing_count_48_turns_median_12"
      ),
      sovereignNoHolderBondShareMedian: recent12Median(
        input.turn,
        history,
        noHolderShare(sovereignBonds).value,
        (row) => row.sovereignNoHolderBondShare,
        "unmatured_sovereign_issue_count_median_12"
      ),
      corporateNoHolderBondShareMedian: recent12Median(
        input.turn,
        history,
        noHolderShare(corporateBonds).value,
        (row) => row.corporateNoHolderBondShare,
        "unmatured_corporate_issue_count_median_12"
      ),
    },
    households: {
      householdsObserved: wealth.length,
      aggregateWealthAnchor: aggregateWealth,
      medianWealthAnchor: metric(median(wealth), wealth.length, "global_wealth_list_entries"),
      wealthGini: metric(gini(wealth), wealth.length, "nonnegative_net_wealth"),
      topTenWealthShare: metric(
        ratio(topTenWealth, aggregateWealth),
        wealth.length,
        "global_wealth_list_entries"
      ),
    },
    money: {
      currenciesObserved: input.money.length,
      currentAccountingCurrencies: currentAccountingRows.length,
      comparableGrowthCurrencies: moneyGrowth.length,
      /** Per-currency observation contract version; null on legacy observations. */
      observationVersions,
      /** Per-currency growth comparability: high = comparable, medium = current method but warming, low = legacy. */
      observationConfidence,
      /** Bond-pool settlement inventory excluded from observed M2 (#2021). */
      excludedBondPoolCash: metric(
        totalExcludedBondPoolCash,
        input.money.length,
        "currency_stock_sum"
      ),
      medianAnnualizedM2GrowthPct: metric(
        median(moneyGrowth),
        moneyGrowth.length,
        "currency_equal_weight"
      ),
      medianInflationPct: metric(
        median([...inflationByCountry.values()]),
        inflationByCountry.size,
        "country_equal_weight"
      ),
      moneyGrowthInflationCorrelation: metric(
        correlation(pairedGrowth, pairedInflation),
        pairedGrowth.length,
        "country_cross_section"
      ),
      creditToM2: metric(ratio(totalCredit, totalM2), input.money.length, "currency_stock_sum"),
      transactionalMoneyShare: metric(
        ratio(totalM1, totalM2),
        input.money.length,
        "currency_stock_sum"
      ),
      externalBroadMoneyShare: metric(
        ratio(totalExternalBroadMoney, totalM2),
        input.money.length,
        "currency_stock_sum"
      ),
      bankDepositShare: metric(
        ratio(totalBankDeposits, totalM2),
        input.money.length,
        "currency_stock_sum"
      ),
      activeModeledBalanceShare48: metric(
        ratio(activity.active, activity.total),
        activity.accountCount,
        "ledger_backed_accounts_active_in_48_turns"
      ),
      dormantModeledBalanceShare48: metric(
        ratio(activity.dormant, activity.total),
        activity.accountCount,
        "ledger_backed_accounts_inactive_in_48_turns"
      ),
      modeledGrossVelocity48: metric(
        activity.grossVelocity,
        input.ledgerEntryCount,
        "absolute_primary_ledger_flow_to_closing_balance"
      ),
      householdGrossVelocity48: metric(
        activity.householdVelocity,
        activity.activeAccounts,
        "character_primary_ledger_flow_to_closing_balance"
      ),
      householdTransactionalVelocity48: metric(
        activity.transactionalVelocity,
        activity.activeAccounts,
        "character_primary_ledger_flow_to_closing_balance"
      ),
      householdSavingsVelocity48: metric(
        activity.savingsVelocity,
        activity.activeAccounts,
        "character_savings_primary_ledger_flow_to_closing_balance"
      ),
      savingsShareOfHouseholdBalances: metric(
        activity.savingsShare,
        activity.householdAccountCount,
        "character_savings_share_of_household_closing_balance"
      ),
      corporateGrossVelocity48: metric(
        activity.corporateVelocity,
        activity.activeAccounts,
        "corporation_primary_ledger_flow_to_closing_balance"
      ),
      partyGrossVelocity48: metric(
        activity.partyVelocity,
        activity.activeAccounts,
        "party_primary_ledger_flow_to_closing_balance"
      ),
      governmentGrossVelocity48: metric(
        activity.governmentVelocity,
        activity.activeAccounts,
        "government_primary_ledger_flow_to_closing_balance"
      ),
      intermediatedGrossVelocity48: metric(
        activity.intermediatedVelocity,
        activity.activeAccounts,
        "fund_org_npp_primary_ledger_flow_to_closing_balance"
      ),
      bankCashReservesAnchor: metric(
        ring.banksTotal === 0 || ring.banksReported > 0 ? ring.bankCashAnchor : null,
        ring.banksReported,
        "active_chartered_bank_cash_reserves_anchor"
      ),
      escrowCashAnchor: metric(
        ring.escrowAnchor,
        ring.escrowContributors,
        "corporation_share_escrow_nonnegative_anchor"
      ),
      ringFencedShareOfLiquid: metric(
        !input.balanceSnapshot || ringBankIncomplete || activity.total + ringTotal <= 0
          ? null
          : ratio(ringTotal, activity.total + ringTotal),
        ring.banksReported + ring.escrowContributors,
        "ring_fenced_to_ledger_backed_plus_ring_fenced_closing_stock"
      ),
      bankGrossVelocity48: metric(null, 0, "bank_turnover_not_in_ledger"),
    },
    measurement: { confidence: measurementConfidence, reasons: measurementReasons },
    reconciliation: {
      status: input.reconciliation?.status ?? "unavailable",
      trialBalanceUnbalancedCount: input.reconciliation?.trialBalance.unbalancedCount ?? null,
      stockVsFlowDivergentCount: input.reconciliation?.stockVsFlow.divergentCount ?? null,
      stockVsFlowSkipped: input.reconciliation?.stockVsFlow.skipped ?? null,
      moneySupplyFindingCount: input.reconciliation?.moneySupply.findings.length ?? null,
      stockVsFlowByKind:
        input.reconciliation && !input.reconciliation.stockVsFlow.skipped
          ? (input.reconciliation.stockVsFlow.byKind ?? null)
          : null,
    },
  };
}
