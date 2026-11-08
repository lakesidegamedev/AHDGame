/**
 * Import tariffs in the funded producer market (gameConfig.producerTariffStage).
 *
 * Each route's tariff (country-wide, sector or targeted, the same rate the
 * trade system uses) is read once into a table. Buyers judge imports at the
 * landed price (posted x (1 + tariff)), so higher tariffs push them to home
 * sellers. Each cross-border sale pays the tariff from the buyer to the
 * importing country's treasury, capped at what the buyer holds.
 *
 * Clearing within one price level stays in posted-price order, so a buyer can
 * still take a dearer-landed import first and pay the tariff.
 */
import type { ProducerOffer, ProducerTrade, PurchaseOrder } from "./rules";
import { tariffTransfers, type TariffTransfer } from "./routeRules";

/** Tariff fraction per route; only routes with a positive tariff are present. */
export type ImportTariffTable = Readonly<Record<string, number>>;

export function importTariffKey(commodity: string, exporter: string, importer: string): string {
  return JSON.stringify([commodity, exporter, importer]);
}

/** The importer's tariff fraction on one route; 0 for a domestic or untariffed route. */
export function importTariffRate(
  table: ImportTariffTable,
  commodity: string,
  exporter: string | undefined,
  importer: string | undefined
): number {
  if (!exporter || !importer || exporter === importer) return 0;
  const rate = table[importTariffKey(commodity, exporter, importer)];
  return rate !== undefined && Number.isFinite(rate) && rate > 0 ? rate : 0;
}

/**
 * The tariff table for every route that can carry a sale this turn: each
 * seller country of a good to each other buyer country. `importCostMultiplier`
 * is the trade system's one plus tariff; a closed route is left out, since no
 * sale crosses it.
 */
export function importTariffTable(input: {
  sellerCountriesByCommodity: ReadonlyMap<string, ReadonlySet<string>>;
  buyerCountries: ReadonlySet<string>;
  importCostMultiplier: (commodity: string, exporter: string, importer: string) => number;
  open: (commodity: string, exporter: string, importer: string) => boolean;
}): ImportTariffTable {
  const out: Record<string, number> = {};
  const commodities = [...input.sellerCountriesByCommodity.keys()].sort();
  const buyers = [...input.buyerCountries].filter(Boolean).sort();
  for (const commodity of commodities) {
    const sellers = [...input.sellerCountriesByCommodity.get(commodity)!].filter(Boolean).sort();
    for (const exporter of sellers)
      for (const importer of buyers) {
        if (exporter === importer || !input.open(commodity, exporter, importer)) continue;
        const rate = input.importCostMultiplier(commodity, exporter, importer) - 1;
        if (Number.isFinite(rate) && rate > 0)
          out[importTariffKey(commodity, exporter, importer)] = rate;
      }
  }
  return out;
}

const NO_LIST = Symbol("unrestricted");

/**
 * Builds a gate that restricts each order to the offers whose landed price it
 * will pay. Offers are fixed for the turn (their posted prices do not change
 * between planning passes), so one gate serves every pass and shares one list
 * per (good, book, buyer country, price limit, prior restriction).
 *
 * Left alone: orders without a country, contract and named-supplier orders
 * (their price is agreed), and a buyer's own offers (an internal delivery has
 * no sale to tax). An order no tariff excludes anything for keeps its list.
 */
export function landedPriceGate(
  offers: readonly Pick<
    ProducerOffer,
    "id" | "accountId" | "commodity" | "book" | "unitPrice" | "countryId"
  >[],
  table: ImportTariffTable
): (orders: readonly PurchaseOrder[]) => PurchaseOrder[] {
  const byBook = new Map<string, (typeof offers)[number][]>();
  for (const offer of offers) {
    const key = JSON.stringify([offer.commodity, offer.book]);
    const rows = byBook.get(key) ?? [];
    rows.push(offer);
    byBook.set(key, rows);
  }
  const ownerOf = new Map(offers.map((o) => [o.id, o.accountId]));
  // Excluded offer ids per (good, book, buyer country, limit).
  const excludedCache = new Map<string, readonly string[]>();
  const excludedFor = (order: PurchaseOrder): readonly string[] => {
    const key = JSON.stringify([
      order.commodity,
      order.book,
      order.countryId,
      order.maximumUnitPrice,
    ]);
    let ids = excludedCache.get(key);
    if (!ids) {
      const out: string[] = [];
      for (const offer of byBook.get(JSON.stringify([order.commodity, order.book])) ?? []) {
        const rate = importTariffRate(table, offer.commodity, offer.countryId, order.countryId);
        if (!(rate > 0)) continue;
        const landed = offer.unitPrice * (1 + rate);
        if (landed > order.maximumUnitPrice * (1 + 1e-12)) out.push(offer.id);
      }
      ids = out;
      excludedCache.set(key, ids);
    }
    return ids;
  };
  // Restricted list per prior list (or none) and excluded set, shared by reference.
  const listCache = new Map<readonly string[] | typeof NO_LIST, Map<string, readonly string[]>>();
  const restricted = (order: PurchaseOrder, excluded: readonly string[]): readonly string[] => {
    const prior = order.eligibleOfferIds ?? NO_LIST;
    const key = JSON.stringify([order.commodity, order.book, ...excluded]);
    let byExcluded = listCache.get(prior);
    if (!byExcluded) {
      byExcluded = new Map();
      listCache.set(prior, byExcluded);
    }
    let list = byExcluded.get(key);
    if (!list) {
      const drop = new Set(excluded);
      const base =
        prior === NO_LIST
          ? (byBook.get(JSON.stringify([order.commodity, order.book])) ?? []).map((o) => o.id)
          : prior;
      list = base.filter((id) => !drop.has(id));
      byExcluded.set(key, list);
    }
    return list;
  };
  return (orders) =>
    orders.map((order) => {
      if (!order.countryId || order.supplierOfferId || order.contractUnitPrice != null)
        return order;
      let excluded = excludedFor(order);
      if (excluded.length === 0) return order;
      // A company's own foreign site is an internal delivery, not an import.
      if (excluded.some((id) => ownerOf.get(id) === order.accountId))
        excluded = excluded.filter((id) => ownerOf.get(id) !== order.accountId);
      if (excluded.length === 0) return order;
      if (order.eligibleOfferIds) {
        const prior = new Set(order.eligibleOfferIds);
        if (!excluded.some((id) => prior.has(id))) return order;
      }
      return { ...order, eligibleOfferIds: restricted(order, excluded) };
    });
}

export interface FundedTariffs {
  transfers: TariffTransfer[];
  /** Tariff paid per buyer account, anchor units. */
  paidByAccount: Map<string, number>;
  /** Tariff collected per importing country, anchor units. */
  collectedByImporter: Map<string, number>;
  /** Tariff owed but not paid because the buyer had no cash left, anchor units. */
  shortfall: number;
}

/**
 * Tariff owed on each settled cross-border sale, paid by the buyer to its
 * country's tariff account. Internal deliveries carry no sale and pay nothing.
 */
export function fundedTariffs(input: {
  trades: Iterable<
    Pick<
      ProducerTrade,
      "kind" | "buyerAccountId" | "commodity" | "amount" | "sellerCountry" | "buyerCountry"
    >
  >;
  table: ImportTariffTable;
  /** The importing country's tariff account, or null when it has none. */
  collectorOf: (country: string) => string | null;
  /** Buyer cash after settlement, anchor units. */
  cashOf: (accountId: string) => number;
}): FundedTariffs {
  const cross: Parameters<typeof tariffTransfers>[0][number][] = [];
  let owed = 0;
  for (const t of input.trades) {
    if (t.kind !== "sale" || !(t.amount > 0)) continue;
    const rate = importTariffRate(input.table, t.commodity, t.sellerCountry, t.buyerCountry);
    if (!(rate > 0)) continue;
    cross.push({
      buyerAccountId: t.buyerAccountId,
      buyerCountry: t.buyerCountry!,
      sellerCountry: t.sellerCountry!,
      commodity: t.commodity,
      value: t.amount,
    });
    if (input.collectorOf(t.buyerCountry!)) owed += t.amount * rate;
  }
  const transfers = tariffTransfers(
    cross,
    (commodity, exporter, importer) =>
      1 + importTariffRate(input.table, commodity, exporter, importer),
    input.collectorOf,
    input.cashOf
  );
  const paidByAccount = new Map<string, number>();
  const collectedByImporter = new Map<string, number>();
  let paid = 0;
  for (const t of transfers) {
    paid += t.amount;
    paidByAccount.set(t.fromAccountId, (paidByAccount.get(t.fromAccountId) ?? 0) + t.amount);
    collectedByImporter.set(t.importer, (collectedByImporter.get(t.importer) ?? 0) + t.amount);
  }
  return { transfers, paidByAccount, collectedByImporter, shortfall: Math.max(0, owed - paid) };
}
