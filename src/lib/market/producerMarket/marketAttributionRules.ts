/**
 * Who every unit of a country's funded book came from and went to: the same
 * counts as the book (rules.ts, settleProducerOrders.ts), rebuilt from the
 * settled orders and offers and split by kind of account, so screens can show
 * rows that add up to their totals. `marketAttributionGaps` flags any volume
 * counted without an attributed account. Pure.
 */
import type { ProducerOffer, PurchaseOrder } from "./producerQuotes";
import type { FundedCountryBookRow } from "./fundedBookRules";
import { fundedBuyerKind } from "./fundedBuyerDemandRules";

/** The kind of a market account: a company, or the kind of its wallet. */
export function marketAccountKind(accountId: string): MarketAccountKind {
  return fundedBuyerKind(accountId) ?? "company";
}

/**
 * Kinds of market account. `company` is a corporation; `wideEconomy` is the
 * background economy of a player country; `backgroundEconomy` is a country
 * outside the player economies.
 */
export const MARKET_ACCOUNT_KINDS = [
  "company",
  "households",
  "publicBuyer",
  "investmentBuyer",
  "backgroundEconomy",
  "wideEconomy",
  "other",
] as const;
export type MarketAccountKind = (typeof MARKET_ACCOUNT_KINDS)[number];

/** Units by account kind; kinds with nothing are left out. */
export type UnitsByKind = Partial<Record<MarketAccountKind, number>>;

export interface CountryBookAttribution {
  countryId: string;
  commodity: string;
  supplyBy: UnitsByKind;
  demandBy: UnitsByKind;
  requestedBy: UnitsByKind;
  filledBy: UnitsByKind;
  /** Part of the company supply that is stock from earlier turns; absent when none. */
  carriedStock?: number;
}

/** One company's part of a country's book for one good. */
export interface CompanyBookRow {
  countryId: string;
  commodity: string;
  accountId: string;
  offered: number;
  sold: number;
  requested: number;
  filled: number;
}

/** Player-facing names for each kind, on the side it appears. */
export const MARKET_KIND_LABELS: Record<MarketAccountKind, { sellers: string; buyers: string }> = {
  company: { sellers: "Player and AI companies", buyers: "Player and AI companies" },
  households: { sellers: "Households", buyers: "Households" },
  publicBuyer: { sellers: "Governments", buyers: "Governments" },
  investmentBuyer: { sellers: "Construction", buyers: "Construction buyers" },
  backgroundEconomy: {
    sellers: "Background economy (countries without companies)",
    buyers: "Background economy (countries without companies)",
  },
  wideEconomy: {
    sellers: "Background economy (sellers)",
    buyers: "Background economy (buyers)",
  },
  other: { sellers: "Other sellers", buyers: "Other buyers" },
};

const positive = (x: number | null | undefined): number =>
  typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;

const add = (target: UnitsByKind, kind: MarketAccountKind, units: number) => {
  if (!(units > 0)) return;
  target[kind] = (target[kind] ?? 0) + units;
};

/**
 * The attributed book for one settled market. `kindOf` names the kind of each
 * account. The wider economy's seller counts only what it sold, as the book
 * does (withWideEconomyFills); every other seller counts what it offered.
 */
export function attributeCountryBooks(input: {
  orders: readonly PurchaseOrder[];
  offers: readonly ProducerOffer[];
  orderResults: ReadonlyMap<string, { deliveredUnits: number }>;
  offerResults: ReadonlyMap<string, { deliveredUnits: number }>;
  kindOf: (accountId: string) => MarketAccountKind;
}): { books: CountryBookAttribution[]; companies: CompanyBookRow[] } {
  const books = new Map<string, CountryBookAttribution>();
  const book = (countryId: string, commodity: string) => {
    const key = JSON.stringify([countryId, commodity]);
    let b = books.get(key);
    if (!b) {
      b = { countryId, commodity, supplyBy: {}, demandBy: {}, requestedBy: {}, filledBy: {} };
      books.set(key, b);
    }
    return b;
  };
  const companies = new Map<string, CompanyBookRow>();
  const company = (countryId: string, commodity: string, accountId: string) => {
    const key = JSON.stringify([countryId, commodity, accountId]);
    let c = companies.get(key);
    if (!c) {
      c = { countryId, commodity, accountId, offered: 0, sold: 0, requested: 0, filled: 0 };
      companies.set(key, c);
    }
    return c;
  };

  for (const offer of input.offers) {
    if (!offer.countryId) continue;
    const kind = input.kindOf(offer.accountId);
    const sold = positive(input.offerResults.get(offer.id)?.deliveredUnits);
    const available = Math.min(
      positive(offer.units),
      offer.deliverableUnits == null ? positive(offer.units) : positive(offer.deliverableUnits)
    );
    add(
      book(offer.countryId, offer.commodity).supplyBy,
      kind,
      kind === "wideEconomy" ? sold : available
    );
    if (kind === "company") {
      const c = company(offer.countryId, offer.commodity, offer.accountId);
      c.offered += available;
      c.sold += sold;
    }
  }

  // Requested counts a reservation group once, at most its target, as the book does.
  const groupTarget = new Map<string, number>();
  const groupAsked = new Map<string, number>();
  for (const o of input.orders) {
    if (!o.quantityGroup) continue;
    groupTarget.set(o.quantityGroup.id, o.quantityGroup.maximumUnits);
    groupAsked.set(o.quantityGroup.id, (groupAsked.get(o.quantityGroup.id) ?? 0) + o.units);
  }
  const groupCounted = new Set<string>();
  for (const o of input.orders) {
    if (!o.countryId) continue;
    const kind = input.kindOf(o.accountId);
    const b = book(o.countryId, o.commodity);
    const delivered = positive(input.orderResults.get(o.id)?.deliveredUnits);
    const lowerStep = !!(o.demandStep && o.demandStep > 0);
    let requested = 0;
    if (lowerStep) {
      // A lower step (the wider economy's buyer, a household price ladder) is
      // demand only for what it bought.
      add(b.demandBy, kind, delivered);
      requested = delivered;
    } else {
      add(b.demandBy, kind, positive(o.units));
      const group = o.quantityGroup?.id;
      if (group === undefined) requested = positive(o.units);
      else if (!groupCounted.has(group)) {
        groupCounted.add(group);
        requested = Math.min(groupTarget.get(group)!, groupAsked.get(group)!);
      }
    }
    add(b.requestedBy, kind, requested);
    add(b.filledBy, kind, delivered);
    if (kind === "company") {
      const c = company(o.countryId, o.commodity, o.accountId);
      c.requested += requested;
      c.filled += delivered;
    }
  }
  const byKey = (a: { countryId: string; commodity: string }, b: typeof a) =>
    a.commodity === b.commodity
      ? a.countryId < b.countryId
        ? -1
        : a.countryId > b.countryId
          ? 1
          : 0
      : a.commodity < b.commodity
        ? -1
        : 1;
  return {
    books: [...books.values()].sort(byKey),
    companies: [...companies.values()].sort(
      (a, b) => byKey(a, b) || (a.accountId < b.accountId ? -1 : 1)
    ),
  };
}

/** Sum of a split. */
export function totalOf(units: UnitsByKind | undefined): number {
  return Object.values(units ?? {}).reduce((sum, v) => sum + (v ?? 0), 0);
}

/** A row whose attributed parts do not add up to its total. */
export interface MarketAttributionGap {
  countryId: string;
  commodity: string;
  measure: "supply" | "demand" | "requested" | "filled";
  total: number;
  attributed: number;
}

/**
 * Every book row whose total is not fully accounted for by attributed
 * accounts, beyond rounding. Empty when every unit has a named source.
 */
export function marketAttributionGaps(
  books: readonly Pick<
    FundedCountryBookRow,
    "countryId" | "commodity" | "supply" | "demand" | "requested" | "filled"
  >[],
  attribution: readonly CountryBookAttribution[]
): MarketAttributionGap[] {
  const parts = new Map(attribution.map((a) => [JSON.stringify([a.countryId, a.commodity]), a]));
  const gaps: MarketAttributionGap[] = [];
  const check = (
    row: (typeof books)[number],
    measure: MarketAttributionGap["measure"],
    total: number | undefined,
    split: UnitsByKind | undefined
  ) => {
    if (total == null) return;
    const attributed = totalOf(split);
    if (Math.abs(total - attributed) > 1e-6 * Math.max(1, Math.abs(total)))
      gaps.push({ countryId: row.countryId, commodity: row.commodity, measure, total, attributed });
  };
  for (const row of books) {
    const a = parts.get(JSON.stringify([row.countryId, row.commodity]));
    check(row, "supply", row.supply, a?.supplyBy);
    check(row, "demand", row.demand, a?.demandBy);
    check(row, "requested", row.requested, a?.requestedBy);
    check(row, "filled", row.filled, a?.filledBy);
  }
  return gaps;
}

/** A split scaled to another unit basis. */
export function scaleUnits(units: UnitsByKind, factor: number): UnitsByKind {
  return Object.fromEntries(
    Object.entries(units).map(([k, v]) => [k, (v ?? 0) * factor])
  ) as UnitsByKind;
}

/**
 * Plants' stock from earlier turns offered again this turn, per country book:
 * what each offered beyond this turn's output left after its own sites took
 * theirs. Part of the company supply, on the same per-turn basis; kept apart
 * so screens can tell new output from an old stock overhang. Keyed by
 * JSON [countryId, commodity]; books without stock are absent.
 */
export function carriedStockByBook(
  producers: readonly {
    id: string;
    products: readonly {
      commodity: string;
      producedUnits?: number;
      offeredUnits?: number;
      internalDeliveredUnits?: number;
    }[];
  }[],
  countryOf: (producerId: string) => string | null | undefined
): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of producers) {
    const countryId = countryOf(p.id);
    if (!countryId) continue;
    for (const x of p.products) {
      const forSale = Math.max(0, positive(x.producedUnits) - positive(x.internalDeliveredUnits));
      const stock = positive(x.offeredUnits) - forSale;
      if (!(stock > 1e-9)) continue;
      const key = JSON.stringify([countryId, x.commodity]);
      out.set(key, (out.get(key) ?? 0) + stock);
    }
  }
  return out;
}

/** Each book with its old stock, never more than the company supply it is part of. */
export function withCarriedStock(
  books: readonly CountryBookAttribution[],
  stock: ReadonlyMap<string, number>
): CountryBookAttribution[] {
  return books.map((b) => {
    const units = Math.min(
      stock.get(JSON.stringify([b.countryId, b.commodity])) ?? 0,
      b.supplyBy.company ?? 0
    );
    return units > 0 ? { ...b, carriedStock: units } : b;
  });
}
