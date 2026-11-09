/**
 * Supply and demand from a settled funded market, in the shape the commodity
 * price phase already prices from (funded-market cutover, phase B slice S7).
 *
 * Demand is what funded buyers asked for; supply is what producers offered.
 * Local-service books carry their own state. Other books are placed where the
 * buyer (demand) or the seller (supply) is; an account with no state counts
 * in the world total only, unless the caller names its country (public,
 * military and investment buyers order from national wallets). Formula demand
 * never enters these rows.
 *
 * Pure: settlement outcomes in, ledger rows out.
 */
import { COMMODITY_TYPES } from "@/lib/constants/commodities";
import { commodityStateKey } from "./laneKey";
/** Settled funded supply and demand per turn, read by the price phase. */
export const PRODUCER_MARKET_OUTCOMES = "producerMarketOutcomes";

export interface FundedLedgerRow {
  commodity: string;
  /** Null: counted in the world total only. */
  stateId: string | null;
  /**
   * Set only on a stateless row whose buyer belongs to a country: the national
   * book counts it there, state books still do not. Absent otherwise.
   */
  countryId?: string;
  supply: number;
  demand: number;
}

export function fundedLedgerRows(input: {
  outcomes: readonly {
    commodity: string;
    book: string;
    accountId: string;
    requestedUnits: number;
  }[];
  products: readonly {
    producerId: string;
    commodity: string;
    book: string;
    offeredUnits: number;
  }[];
  stateOfAccount: (accountId: string) => string | null;
  /**
   * Country of a buyer with no state. Omitted (stage off): every stateless
   * order shares one world-only row, as before.
   */
  countryOfAccount?: (accountId: string) => string | null;
  stateOfProducer: (producerId: string) => string | null;
  /** Converts settlement units per turn to the price phase's unit basis. */
  unitScale: number;
}): FundedLedgerRow[] {
  const rows = new Map<string, FundedLedgerRow>();
  const row = (commodity: string, stateId: string | null, countryId?: string | null) => {
    const key =
      stateId == null && countryId
        ? commodityStateKey(commodity, `country:${countryId}`)
        : commodityStateKey(commodity, stateId);
    const r =
      rows.get(key) ??
      (stateId == null && countryId
        ? { commodity, stateId, countryId, supply: 0, demand: 0 }
        : { commodity, stateId, supply: 0, demand: 0 });
    rows.set(key, r);
    return r;
  };
  const bookState = (book: string) => (book.startsWith("state:") ? book.slice(6) : null);
  for (const o of input.outcomes)
    if (Number.isFinite(o.requestedUnits) && o.requestedUnits > 0) {
      const stateId = bookState(o.book) ?? input.stateOfAccount(o.accountId);
      const countryId = stateId == null ? input.countryOfAccount?.(o.accountId) : null;
      row(o.commodity, stateId, countryId).demand += o.requestedUnits * input.unitScale;
    }
  for (const p of input.products)
    if (Number.isFinite(p.offeredUnits) && p.offeredUnits > 0)
      row(p.commodity, bookState(p.book) ?? input.stateOfProducer(p.producerId)).supply +=
        p.offeredUnits * input.unitScale;
  return [...rows.values()].sort((a, b) =>
    a.commodity !== b.commodity
      ? a.commodity.localeCompare(b.commodity)
      : a.stateId !== b.stateId
        ? String(a.stateId).localeCompare(String(b.stateId))
        : String(a.countryId ?? "").localeCompare(String(b.countryId ?? ""))
  );
}

/** World and per-state balances for the price phase. */
export function fundedLedgers(rows: readonly FundedLedgerRow[]): {
  global: Map<string, { supply: number; demand: number }>;
  byState: Map<string, Map<string, { supply: number; demand: number }>>;
  /** Stateless rows that name a country, per country. Empty when none do. */
  statelessByCountry: Map<string, Map<string, { supply: number; demand: number }>>;
} {
  // Dense, like the formula ledgers the price phase replaces: every commodity
  // has a row in the world book and in each state book, zero when nothing
  // traded, so national aggregation never meets a missing commodity.
  const zeroBook = () =>
    new Map<string, { supply: number; demand: number }>(
      COMMODITY_TYPES.map((c) => [c, { supply: 0, demand: 0 }])
    );
  const global = zeroBook();
  const byState = new Map<string, Map<string, { supply: number; demand: number }>>();
  const statelessByCountry = new Map<string, Map<string, { supply: number; demand: number }>>();
  for (const r of rows) {
    const g = global.get(r.commodity) ?? { supply: 0, demand: 0 };
    g.supply += r.supply;
    g.demand += r.demand;
    global.set(r.commodity, g);
    if (r.stateId == null) {
      if (!r.countryId) continue;
      const m = statelessByCountry.get(r.countryId) ?? new Map();
      const c = m.get(r.commodity) ?? { supply: 0, demand: 0 };
      c.supply += r.supply;
      c.demand += r.demand;
      m.set(r.commodity, c);
      statelessByCountry.set(r.countryId, m);
      continue;
    }
    const m = byState.get(r.stateId) ?? zeroBook();
    const s = m.get(r.commodity) ?? { supply: 0, demand: 0 };
    s.supply += r.supply;
    s.demand += r.demand;
    m.set(r.commodity, s);
    byState.set(r.stateId, m);
  }
  return { global, byState, statelessByCountry };
}

/**
 * National balances with each country's stateless buyers added to the
 * state-built aggregate. A country with only stateless orders gets a book of
 * its own. State books are untouched; the input maps are not mutated.
 */
export function withStatelessCountryDemand<C extends string>(
  byCountry: ReadonlyMap<string, ReadonlyMap<C, { supply: number; demand: number }>>,
  statelessByCountry: ReadonlyMap<string, ReadonlyMap<string, { supply: number; demand: number }>>
): Map<string, Map<C, { supply: number; demand: number }>> {
  const out = new Map<string, Map<C, { supply: number; demand: number }>>();
  for (const [countryId, m] of byCountry)
    out.set(countryId, new Map([...m].map(([c, b]) => [c, { ...b }])));
  for (const [countryId, extra] of statelessByCountry) {
    const m =
      out.get(countryId) ??
      new Map<C, { supply: number; demand: number }>(
        COMMODITY_TYPES.map((c) => [c as C, { supply: 0, demand: 0 }])
      );
    for (const [commodity, b] of extra) {
      const cur = m.get(commodity as C) ?? { supply: 0, demand: 0 };
      m.set(commodity as C, { supply: cur.supply + b.supply, demand: cur.demand + b.demand });
    }
    out.set(countryId, m);
  }
  return out;
}
