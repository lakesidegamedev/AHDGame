/** Statistics and per-market helpers behind the economic vital signs metrics. */
import type {
  Bond,
  EconomicMetric,
  EconomicVitalSigns,
  ShareOrder,
  ShareTradeHistory,
} from "@/lib/db/types";
import type { CommodityFlow } from "@/lib/db/types/commodityFlow";
import type { CommodityType } from "@/lib/constants/commodities";
import type { BalanceSnapshot } from "@/lib/ledger/types";
import { isRealAccount, accountKind } from "@/lib/ledger/accounts";
import type {
  VitalSignsHistoryRow,
  Inputs,
  CommodityParticipant,
  RingFencedCashRow,
  RingFencedCashSummary,
  LedgerTurnoverRow,
} from "./economicVitalSignsMetrics";

export const ECONOMIC_VITAL_SIGNS_WINDOW_TURNS = 48 as const;

export const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/**
 * Per-issue holder-cap input for the demand-gap classifier: whole units each
 * candidate fund already holds, keyed by fund slug. Holder rows without a
 * fund id (characters, corps, NPPs) do not consume fund cap.
 */
export function fundUnitsByKey(
  holders: Bond["holders"],
  fundIdToKey: ReadonlyMap<string, string>
): Map<string, number> {
  const byKey = new Map<string, number>();
  for (const holder of holders ?? []) {
    const fundId = holder.fundId?.toString();
    if (!fundId) continue;
    const key = fundIdToKey.get(fundId);
    if (!key) continue;
    const units =
      typeof holder.units === "number" && Number.isFinite(holder.units)
        ? Math.max(0, Math.floor(holder.units))
        : 0;
    if (units <= 0) continue;
    byKey.set(key, (byKey.get(key) ?? 0) + units);
  }
  return byKey;
}

export function metric(value: number | null, observations: number, basis: string): EconomicMetric {
  return { value: value == null || !Number.isFinite(value) ? null : value, observations, basis };
}

export function median(values: number[]): number | null {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

/**
 * Turns that produced no snapshot are invisible in a raw series, so a gap reads as
 * a flat line. Record what the window should hold and which turns are absent.
 *
 * Coverage starts at the earliest turn in the window that actually has a snapshot,
 * not at the start of the window. Turns before the series began never had one and
 * are not gaps; counting them would bury the turns that genuinely died.
 */
export function computeCoverage(
  turn: number,
  history: VitalSignsHistoryRow[]
): EconomicVitalSigns["coverage"] {
  const windowStart = Math.max(1, turn - ECONOMIC_VITAL_SIGNS_WINDOW_TURNS + 1);
  const observed = new Set<number>([turn]);
  for (const row of history) {
    if (row.turn >= windowStart && row.turn <= turn) observed.add(row.turn);
  }
  const coverageStartTurn = Math.min(...observed);
  const windowTurnsExpected = turn - coverageStartTurn + 1;
  const missingTurns: number[] = [];
  for (let candidate = coverageStartTurn; candidate <= turn; candidate += 1) {
    if (observed.has(candidate)) continue;
    missingTurns.push(candidate);
    if (missingTurns.length >= ECONOMIC_VITAL_SIGNS_WINDOW_TURNS) break;
  }
  return {
    coverageStartTurn,
    windowTurnsExpected,
    windowTurnsObserved: observed.size,
    windowCoverageShare: ratio(observed.size, windowTurnsExpected),
    missingTurns,
  };
}

/**
 * A single turn's securities reading is spiky enough that a frozen one-turn baseline
 * can manufacture a regression later. Carry the rolling median beside the point value.
 */
export function recent12Median(
  turn: number,
  history: VitalSignsHistoryRow[],
  current: number | null,
  pick: (row: VitalSignsHistoryRow) => number | null,
  basis: string
): EconomicMetric {
  const values: number[] = [];
  if (current != null && Number.isFinite(current)) values.push(current);
  for (const row of history) {
    if (row.turn < turn - 11 || row.turn >= turn) continue;
    const value = pick(row);
    if (value != null && Number.isFinite(value)) values.push(value);
  }
  return metric(median(values), values.length, basis);
}

export function correlation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0;
  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index]! - meanX;
    const dy = ys[index]! - meanY;
    numerator += dx * dy;
    sumX += dx * dx;
    sumY += dy * dy;
  }
  const denominator = Math.sqrt(sumX * sumY);
  return denominator > 0 ? numerator / denominator : null;
}

export function gini(values: number[]): number | null {
  const sorted = values.filter((value) => finite(value) && value >= 0).sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (sorted.length === 0 || total <= 0) return null;
  let weighted = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    weighted += (index + 1) * sorted[index]!;
  }
  return (2 * weighted) / (sorted.length * total) - (sorted.length + 1) / sorted.length;
}

export function concentration(values: number[]): {
  hhi: number | null;
  topFourShare: number | null;
} {
  const positive = values.filter((value) => finite(value) && value > 0).sort((a, b) => b - a);
  const total = positive.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return { hhi: null, topFourShare: null };
  return {
    hhi: positive.reduce((sum, value) => sum + Math.pow((value / total) * 100, 2), 0),
    topFourShare: positive.slice(0, 4).reduce((sum, value) => sum + value, 0) / total,
  };
}

export function nonnegative(value: unknown): number {
  return finite(value) && value > 0 ? value : 0;
}

export function marketQuality(
  listings: NonNullable<Inputs["globalExchange"]>["listings"],
  orders: ShareOrder[],
  trades: ShareTradeHistory[]
) {
  const listingById = new Map(listings.map((listing) => [listing._id.toString(), listing]));
  const open = orders.filter((order) => order.status === "open" && order.sharesRemaining > 0);
  const byCorporation = new Map<string, ShareOrder[]>();
  for (const order of open) {
    const key = order.corporationId.toString();
    const list = byCorporation.get(key) ?? [];
    list.push(order);
    byCorporation.set(key, list);
  }

  const spreads: number[] = [];
  let twoSidedListings = 0;
  let depthAnchor = 0;
  let bidDepthAnchor = 0;
  // The liquidity facility posts both sides itself, so it satisfies the plain two-sided
  // metric by construction. The organic counters are the ones that show participation.
  let organicTwoSidedListings = 0;
  let facilityQuotedListings = 0;
  let organicDepthAnchor = 0;
  for (const [corporationId, book] of byCorporation) {
    const listing = listingById.get(corporationId);
    if (!listing) continue;
    const buys = book.filter((order) => order.type === "buy");
    const sells = book.filter((order) => order.type === "sell");
    const organicBuys = buys.filter((order) => order.liquidityProvider !== true);
    const organicSells = sells.filter((order) => order.liquidityProvider !== true);
    if (organicBuys.length > 0 && organicSells.length > 0) organicTwoSidedListings += 1;
    if (book.some((order) => order.liquidityProvider === true)) facilityQuotedListings += 1;
    if (buys.length > 0 && sells.length > 0) {
      const bestBid = Math.max(...buys.map((order) => order.pricePerShare));
      const bestAsk = Math.min(...sells.map((order) => order.pricePerShare));
      const midpoint = (bestBid + bestAsk) / 2;
      if (bestAsk >= bestBid && midpoint > 0) spreads.push(((bestAsk - bestBid) / midpoint) * 100);
      twoSidedListings += 1;
    }
    const anchorPerLocal =
      nonnegative(listing.sharePriceAnchor) > 0 && nonnegative(listing.sharePrice) > 0
        ? listing.sharePriceAnchor! / listing.sharePrice
        : 1;
    depthAnchor += book.reduce(
      (sum, order) => sum + order.sharesRemaining * order.pricePerShare * anchorPerLocal,
      0
    );
    bidDepthAnchor += buys.reduce(
      (sum, order) => sum + order.sharesRemaining * order.pricePerShare * anchorPerLocal,
      0
    );
    organicDepthAnchor += book
      .filter((order) => order.liquidityProvider !== true)
      .reduce(
        (sum, order) => sum + order.sharesRemaining * order.pricePerShare * anchorPerLocal,
        0
      );
  }

  const executionHours = orders.flatMap((order) => {
    if (order.status !== "filled") return [];
    const created = new Date(order.createdAt).getTime();
    const updated = new Date(order.updatedAt).getTime();
    if (!Number.isFinite(created) || !Number.isFinite(updated) || updated < created) return [];
    return [(updated - created) / 3_600_000];
  });

  const notionalByCorporation = new Map<string, number>();
  for (const trade of trades) {
    const key = trade.corporationId.toString();
    notionalByCorporation.set(
      key,
      (notionalByCorporation.get(key) ?? 0) + nonnegative(trade.totalAnchor)
    );
  }
  const amihud = listings.flatMap((listing) => {
    const notional = notionalByCorporation.get(listing._id.toString()) ?? 0;
    if (notional <= 0 || !finite(listing.priceChange48h)) return [];
    return [Math.abs(listing.priceChange48h) / (notional / 1_000_000)];
  });

  // Per-listing inventory concentration: each economic trade's notional is
  // split evenly across its distinct named counterparties, so a float-only
  // leg attributes fully to the trader on the other side. Rows with no named
  // party are unattributable and narrow the sample instead of diluting it.
  const notionalByListingParty = new Map<string, Map<string, number>>();
  for (const trade of trades) {
    const notional = nonnegative(trade.totalAnchor);
    if (notional <= 0) continue;
    const parties = new Set(
      [trade.from, trade.to].map(tradePartyKey).filter((key): key is string => key != null)
    );
    if (parties.size === 0) continue;
    const share = notional / parties.size;
    const key = trade.corporationId.toString();
    let byParty = notionalByListingParty.get(key);
    if (!byParty) {
      byParty = new Map();
      notionalByListingParty.set(key, byParty);
    }
    for (const party of parties) byParty.set(party, (byParty.get(party) ?? 0) + share);
  }
  const topTraderShares: number[] = [];
  for (const [listingId, byParty] of notionalByListingParty) {
    if (!listingById.has(listingId)) continue;
    const total = [...byParty.values()].reduce((sum, value) => sum + value, 0);
    if (total <= 0) continue;
    topTraderShares.push(Math.max(...byParty.values()) / total);
  }

  return {
    openBuyOrders: open.filter((order) => order.type === "buy").length,
    openSellOrders: open.filter((order) => order.type === "sell").length,
    twoSidedListings,
    organicTwoSidedListings,
    facilityQuotedListings,
    spreads,
    depthAnchor,
    bidDepthAnchor,
    organicDepthAnchor,
    executionHours,
    amihud,
    topTraderShares,
  };
}

export function tradePartyKey(party: ShareTradeHistory["from"]): string | null {
  if (!party) return null;
  if (party.characterId) return `character:${party.characterId.toString()}`;
  if (party.imperialCharacterId) return `imperial:${party.imperialCharacterId.toString()}`;
  if (party.corporationId) return `corporation:${party.corporationId.toString()}`;
  return party.name ? `name:${party.name}` : null;
}

export function relevantMarketDiagnostics(
  participants: CommodityParticipant[],
  flows: CommodityFlow[]
): EconomicVitalSigns["competition"] {
  const fillByCommodity = new Map(
    flows.map((flow) => {
      const demand = flow.demandUnitsLedger ?? flow.demandUnits;
      return [
        flow.commodity,
        {
          fill: ratio(flow.clearedUnitsPooled ?? flow.clearedUnits, demand),
          supply: flow.supplyUnits,
          demand,
          price: finite(flow.price) && flow.price >= 0 ? flow.price : null,
        },
      ] as const;
    })
  );
  const byCommodity = new Map<CommodityType, CommodityParticipant[]>();
  for (const participant of participants) {
    const rows = byCommodity.get(participant.commodity) ?? [];
    rows.push(participant);
    byCommodity.set(participant.commodity, rows);
  }

  const hhiFor = (
    rows: CommodityParticipant[],
    side: "sellerUnits" | "buyerUnits",
    ownershipAdjusted: boolean
  ): {
    hhi: number | null;
    count: number;
    largestShare: number | null;
    largestUnits: number | null;
  } => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      const value = nonnegative(row[side]);
      if (value <= 0) continue;
      const key = ownershipAdjusted ? row.ownershipRootId : row.corporationId;
      totals.set(key, (totals.get(key) ?? 0) + value);
    }
    const values = [...totals.values()];
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
      hhi: concentration(values).hhi,
      count: totals.size,
      largestShare: total > 0 ? Math.max(...values) / total : null,
      largestUnits: total > 0 ? Math.max(...values) : null,
    };
  };

  const markets = [...byCommodity.entries()]
    .map(([commodity, rows]) => {
      const sellers = hhiFor(rows, "sellerUnits", false);
      const buyers = hhiFor(rows, "buyerUnits", false);
      const ownershipSellers = hhiFor(rows, "sellerUnits", true);
      const ownershipBuyers = hhiFor(rows, "buyerUnits", true);
      const flow = fillByCommodity.get(commodity);
      const pooledFillRate = flow?.fill ?? null;
      return {
        commodity,
        pooledFillRate,
        supplyUnits:
          flow?.supply ?? rows.reduce((sum, row) => sum + nonnegative(row.sellerUnits), 0),
        demandUnits:
          flow?.demand ?? rows.reduce((sum, row) => sum + nonnegative(row.buyerUnits), 0),
        priceAnchorPerUnit: flow?.price ?? null,
        participantSellerUnits: rows.reduce((sum, row) => sum + nonnegative(row.sellerUnits), 0),
        sellerCount: sellers.count,
        buyerCount: buyers.count,
        sellerHhi: sellers.hhi,
        buyerHhi: buyers.hhi,
        ownershipAdjustedSellerHhi: ownershipSellers.hhi,
        ownershipAdjustedBuyerHhi: ownershipBuyers.hhi,
        largestOwnershipAdjustedSellerShare: ownershipSellers.largestShare,
        largestOwnershipAdjustedSellerUnits: ownershipSellers.largestUnits,
        highConcentrationLowFill:
          pooledFillRate != null &&
          pooledFillRate < 0.8 &&
          (ownershipSellers.hhi ?? sellers.hhi ?? 0) >= 2_500,
      };
    })
    .sort((a, b) => a.commodity.localeCompare(b.commodity));

  const sellerHhi = markets.flatMap((market) =>
    market.sellerHhi == null ? [] : [market.sellerHhi]
  );
  const buyerHhi = markets.flatMap((market) => (market.buyerHhi == null ? [] : [market.buyerHhi]));
  const ownershipSellerHhi = markets.flatMap((market) =>
    market.ownershipAdjustedSellerHhi == null ? [] : [market.ownershipAdjustedSellerHhi]
  );
  const ownershipBuyerHhi = markets.flatMap((market) =>
    market.ownershipAdjustedBuyerHhi == null ? [] : [market.ownershipAdjustedBuyerHhi]
  );
  const marketsWithFill = markets.filter((market) => market.pooledFillRate != null);
  return {
    markets,
    medianSellerHhi: metric(median(sellerHhi), sellerHhi.length, "commodity_corporation_output"),
    medianBuyerHhi: metric(median(buyerHhi), buyerHhi.length, "commodity_corporation_input"),
    medianOwnershipAdjustedSellerHhi: metric(
      median(ownershipSellerHhi),
      ownershipSellerHhi.length,
      "commodity_formalized_group_output"
    ),
    medianOwnershipAdjustedBuyerHhi: metric(
      median(ownershipBuyerHhi),
      ownershipBuyerHhi.length,
      "commodity_formalized_group_input"
    ),
    highConcentrationLowFillShare: metric(
      ratio(
        marketsWithFill.filter((market) => market.highConcentrationLowFill).length,
        marketsWithFill.length
      ),
      marketsWithFill.length,
      "commodity_markets_with_pooled_fill"
    ),
  };
}

/**
 * Aggregate ring-fenced money into anchor stocks.
 *
 * Conversion mirrors the balance snapshot's `toAnchor`: a missing or
 * non-positive rate converts 1:1 rather than dropping the row. Negative
 * escrow rows are buyback debt, not money, and floor per row exactly like the
 * modeled balance stocks in `monetaryActivity`.
 */
export function summarizeRingFencedCash(
  rows: RingFencedCashRow[],
  rates: Record<string, number>
): RingFencedCashSummary {
  const toAnchor = (local: number, currency: string): number => {
    const rate = rates[currency];
    return rate && rate > 0 ? local / rate : local;
  };
  let banksTotal = 0;
  let banksReported = 0;
  let bankCashAnchor = 0;
  let escrowAnchor = 0;
  let escrowContributors = 0;
  for (const row of rows) {
    if (row.charterActive) {
      banksTotal += 1;
      if (typeof row.cashReserves === "number" && Number.isFinite(row.cashReserves)) {
        banksReported += 1;
        bankCashAnchor += toAnchor(nonnegative(row.cashReserves), row.charterCurrency);
      }
    }
    if (typeof row.escrowBalance === "number" && Number.isFinite(row.escrowBalance)) {
      const anchor = toAnchor(nonnegative(row.escrowBalance), row.liquidCurrency);
      if (anchor > 0) {
        escrowAnchor += anchor;
        escrowContributors += 1;
      }
    }
  }
  return { banksTotal, banksReported, bankCashAnchor, escrowAnchor, escrowContributors };
}

export function monetaryActivity(
  balanceSnapshot: BalanceSnapshot | null,
  turnoverRows: LedgerTurnoverRow[]
) {
  const balances = balanceSnapshot?.balances ?? {};
  const activeAccounts = new Set<string>();
  const turnoverByKind = new Map<string, number>();
  let grossTurnover = 0;
  // `isRealAccount` / `accountKind` stay here rather than moving into the
  // aggregation: the pipeline groups by account, and applying the
  // classification to ~1.4k grouped rows costs nothing while keeping the one
  // definition of a "real account" in one place.
  for (const row of turnoverRows) {
    if (!isRealAccount(row.account)) continue;
    activeAccounts.add(row.account);
    grossTurnover += row.turnover;
    const kind = accountKind(row.account);
    turnoverByKind.set(kind, (turnoverByKind.get(kind) ?? 0) + row.turnover);
  }

  let total = 0;
  let active = 0;
  const balanceByKind = new Map<string, number>();
  const accountCountByKind = new Map<string, number>();
  for (const [account, rawBalance] of Object.entries(balances)) {
    if (!isRealAccount(account)) continue;
    const balance = nonnegative(rawBalance);
    total += balance;
    if (activeAccounts.has(account)) active += balance;
    const kind = accountKind(account);
    balanceByKind.set(kind, (balanceByKind.get(kind) ?? 0) + balance);
    accountCountByKind.set(kind, (accountCountByKind.get(kind) ?? 0) + 1);
  }

  const velocity = (kinds: readonly string[]): number | null => {
    const stock = kinds.reduce((sum, kind) => sum + (balanceByKind.get(kind) ?? 0), 0);
    const flow = kinds.reduce((sum, kind) => sum + (turnoverByKind.get(kind) ?? 0), 0);
    return ratio(flow, stock);
  };
  const householdStock =
    (balanceByKind.get("character") ?? 0) + (balanceByKind.get("character_savings") ?? 0);
  const householdAccountCount =
    (accountCountByKind.get("character") ?? 0) + (accountCountByKind.get("character_savings") ?? 0);
  // An absent savings class is unmeasured, not zero: a 0/600 share would claim
  // the economy holds no savings when savings accounts simply do not exist.
  const savingsShare =
    (accountCountByKind.get("character_savings") ?? 0) === 0
      ? null
      : ratio(balanceByKind.get("character_savings") ?? 0, householdStock);
  return {
    total,
    active,
    dormant: Math.max(0, total - active),
    activeAccounts: activeAccounts.size,
    accountCount: Object.keys(balances).filter((account) => isRealAccount(account)).length,
    grossVelocity: ratio(grossTurnover, total),
    householdVelocity: velocity(["character", "character_savings"]),
    transactionalVelocity: velocity(["character"]),
    savingsVelocity: velocity(["character_savings"]),
    savingsShare,
    householdAccountCount,
    corporateVelocity: velocity(["corporation"]),
    partyVelocity: velocity(["party"]),
    governmentVelocity: velocity(["government"]),
    // Pooled vehicles hold modeled balances (fund/org cash legs, NPP investment
    // cash) but had no holder-class velocity: their flow dissolved into gross.
    intermediatedVelocity: velocity(["fund", "org", "npp"]),
  };
}

/**
 * Per-account primary-leg turnover over the window, grouped in Mongo.
 *
 * Grouping by full account string rather than by kind is deliberate: it keeps
 * `isRealAccount` / `accountKind` as the one definition in TypeScript instead
 * of restating those rules as pipeline expressions that could drift.
 *
 * Uses only $match/$unwind/$group/$abs, staying within the aggregation surface
 * the rest of the app relies on.
 */
export function fillByTurn(flows: CommodityFlow[]): Map<number, number> {
  const totals = new Map<number, { demand: number; cleared: number }>();
  for (const flow of flows) {
    const row = totals.get(flow.turn) ?? { demand: 0, cleared: 0 };
    row.demand += flow.demandUnitsLedger ?? flow.demandUnits;
    row.cleared += flow.clearedUnitsPooled ?? flow.clearedUnits;
    totals.set(flow.turn, row);
  }
  return new Map(
    [...totals.entries()].flatMap(([turn, row]) => {
      const fill = ratio(row.cleared, row.demand);
      return fill == null ? [] : [[turn, fill] as const];
    })
  );
}
