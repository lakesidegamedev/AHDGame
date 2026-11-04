import { describe, expect, it } from "vitest";
import type { FundedCountryBookRow } from "./fundedBookRules";
import {
  fundedCountryMarket,
  fundedCountryMarketsByCommodity,
  fundedReachableBookEntries,
  overlayFundedNationalBalances,
  priceRowsTurn,
} from "./fundedCountryViewRules";

const row = (over: Partial<FundedCountryBookRow>): FundedCountryBookRow => ({
  countryId: "US",
  commodity: "ordnance",
  supply: 0,
  demand: 0,
  imports: 0,
  exports: 0,
  ...over,
});

// Shaped like a live turn: almost all ordnance demand is public buyers with no
// state, so the stored national demand saw a sliver of it.
const books = {
  turn: 10,
  rows: [
    row({
      supply: 24450,
      demand: 59905,
      requested: 59905,
      funded: 48027,
      filled: 513,
      imports: 120,
      exports: 24057,
    }),
    row({ countryId: "UK", supply: 17180, demand: 62638, imports: 38023, exports: 86 }),
    row({ commodity: "steel", supply: 100, demand: 90 }),
  ],
};

const price = {
  commodity: "ordnance",
  turn: 10,
  globalSupply: 41630,
  globalDemand: 122543,
  nationalSupply: { US: 24450, UK: 17180, FR: 5 },
  nationalDemand: { US: 513, UK: 1637, FR: 9 },
};

describe("fundedCountryMarket", () => {
  it("reads demand as requested when recorded, else demand", () => {
    expect(fundedCountryMarket(row({ demand: 120, requested: 100 })).demand).toBe(100);
    expect(fundedCountryMarket(row({ demand: 120 })).demand).toBe(120);
  });

  it("reads first-choice demand: household spillover is reported beside it, not in it", () => {
    // Chemicals shape: 26k units of substitution orders on 386 first-choice units.
    const m = fundedCountryMarket(
      row({ demand: 26386, requested: 26386, spilloverRequested: 26000, filled: 386 })
    );
    expect(m.demand).toBe(386);
    expect(m.spilloverRequested).toBe(26000);
    expect(m.filled).toBe(386);
    expect(fundedCountryMarket(row({ requested: 10, spilloverRequested: 50 }))).toMatchObject({
      demand: 0,
      spilloverRequested: 10,
    });
    expect(fundedCountryMarket(row({ requested: 10 })).spilloverRequested).toBe(0);
  });

  it("keeps fills, and reports them as unknown on older books", () => {
    expect(fundedCountryMarket(row({ filled: 7 })).filled).toBe(7);
    expect(fundedCountryMarket(row({})).filled).toBeNull();
  });

  it("clamps non-finite and negative figures to zero", () => {
    const m = fundedCountryMarket(row({ supply: Number.NaN, demand: -5, imports: Infinity }));
    expect(m).toMatchObject({ supply: 0, demand: 0, imports: 0 });
  });
});

describe("overlayFundedNationalBalances", () => {
  it("replaces national supply and demand with the funded book of the same turn", () => {
    const view = overlayFundedNationalBalances(price, books);
    expect(view.nationalBalanceSource).toBe("funded_book");
    expect(view.nationalSupply).toEqual({ US: 24450, UK: 17180 });
    expect(view.nationalDemand).toEqual({ US: 59905, UK: 62638 });
    expect(view.fundedCountryBooks?.US?.filled).toBe(513);
    // World figures are untouched.
    expect(view.globalDemand).toBe(122543);
  });

  it("drops countries the book does not list instead of keeping stale stored figures", () => {
    const view = overlayFundedNationalBalances(price, books);
    expect(view.nationalDemand).not.toHaveProperty("FR");
  });

  it("falls back to the stored figures without a book, or with a book from another turn", () => {
    for (const b of [null, { ...books, turn: 9 }, { turn: 10, rows: [] }]) {
      const view = overlayFundedNationalBalances(price, b);
      expect(view.nationalBalanceSource).toBe("modelled");
      expect(view.nationalDemand).toEqual(price.nationalDemand);
      expect(view.fundedCountryBooks).toBeUndefined();
    }
  });

  it("gives a commodity with no funded rows empty national maps", () => {
    const view = overlayFundedNationalBalances({ ...price, commodity: "timber" }, books);
    expect(view.nationalBalanceSource).toBe("funded_book");
    expect(view.nationalDemand).toEqual({});
  });

  it("sums to the world demand the funded ledger publishes", () => {
    const byCommodity = fundedCountryMarketsByCommodity(books.rows);
    const view = overlayFundedNationalBalances(price, books, byCommodity);
    const sum = Object.values(view.nationalDemand ?? {}).reduce((a, b) => a + b, 0);
    expect(sum).toBe(59905 + 62638);
  });
});

describe("fundedReachableBookEntries", () => {
  it("shapes the funded book like the price phase's reachable book", () => {
    const markets = fundedCountryMarketsByCommodity(books.rows).get("ordnance")!;
    const entries = fundedReachableBookEntries(markets);
    expect(entries.US).toEqual({
      supply: 24450,
      demand: 59905 - 120 + 24057,
      domesticDemand: 59905,
      imports: 120,
      exports: 24057,
      blockedSupply: 0,
      untradedSupply: 0,
      unmetForeignDemand: 0,
    });
  });
});

describe("priceRowsTurn", () => {
  it("takes the newest turn and ignores rows without one", () => {
    expect(priceRowsTurn([{ turn: 9 }, {}, { turn: 10 }])).toBe(10);
    expect(priceRowsTurn([])).toBeNull();
  });
});
