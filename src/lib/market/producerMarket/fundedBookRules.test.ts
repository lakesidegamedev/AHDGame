import { describe, expect, it } from "vitest";
import type { CountryId } from "@/lib/constants/countries";
import type { CommodityType } from "@/lib/constants/commodities";
import {
  fundedReachableBooks,
  selectFundedReachableBooks,
  sortFundedCountryBookRows,
  type FundedCountryBookRow,
} from "./fundedBookRules";

const countries = ["US", "UK"] as CountryId[];
const commodities = ["gas", "food"] as CommodityType[];

const row = (over: Partial<FundedCountryBookRow> = {}): FundedCountryBookRow => ({
  countryId: "US",
  commodity: "gas",
  supply: 0,
  demand: 0,
  imports: 0,
  exports: 0,
  ...over,
});

describe("funded reachable books", () => {
  it("uses ordered units as demand and net imports the same way the clearing book does", () => {
    const books = fundedReachableBooks(
      [
        row({ supply: 100, demand: 200, imports: 50 }),
        row({ countryId: "UK", supply: 0, demand: 40, exports: 0 }),
      ],
      countries,
      commodities
    );
    expect(books.get("US")!.get("gas")).toMatchObject({
      supply: 100,
      demand: 150,
      domesticDemand: 200,
      imports: 50,
      exports: 0,
      blockedSupply: 0,
      untradedSupply: 0,
      unmetForeignDemand: 0,
    });
    expect(books.get("UK")!.get("gas")).toMatchObject({
      supply: 0,
      demand: 40,
      domesticDemand: 40,
    });
  });

  it("drops countries and commodities the price phase does not trade", () => {
    const books = fundedReachableBooks(
      [
        row({ countryId: "ZZ", supply: 10, demand: 10 }),
        row({ commodity: "unobtanium", supply: 10, demand: 10 }),
        row({ supply: 5, demand: 5 }),
      ],
      countries,
      commodities
    );
    expect(books.get("US")!.size).toBe(1);
    expect(books.get("UK")!.size).toBe(0);
    expect(books.get("ZZ" as CountryId)).toBeUndefined();
  });

  it("omits a book with no funded activity and sanitises non-finite units", () => {
    const books = fundedReachableBooks(
      [
        row({ supply: Number.NaN, demand: -5, imports: Number.POSITIVE_INFINITY }),
        row({ commodity: "food", supply: 0, demand: 0 }),
      ],
      countries,
      commodities
    );
    expect(books.get("US")!.has("gas")).toBe(false);
    expect(books.get("US")!.has("food")).toBe(false);
  });

  it("reports exports as reachable demand, matching reachableDemandUnits", () => {
    const books = fundedReachableBooks(
      [row({ supply: 300, demand: 100, exports: 120, imports: 0 })],
      countries,
      commodities
    );
    expect(books.get("US")!.get("gas")).toMatchObject({ demand: 220, domesticDemand: 100 });
  });

  it("keeps the modelled book until the stage is on and the funded market published rows", () => {
    const modelled = fundedReachableBooks(
      [row({ supply: 10, demand: 90 })],
      countries,
      commodities
    );
    const funded = [row({ supply: 50, demand: 60 })];
    const base = { countries, commodities, modelled };
    expect(selectFundedReachableBooks({ ...base, stage: 0, rows: funded })).toBe(modelled);
    expect(selectFundedReachableBooks({ ...base, stage: undefined, rows: funded })).toBe(modelled);
    expect(selectFundedReachableBooks({ ...base, stage: 1, rows: [] })).toBe(modelled);
    expect(selectFundedReachableBooks({ ...base, stage: 1, rows: undefined })).toBe(modelled);
    expect(selectFundedReachableBooks({ ...base, stage: 1, rows: funded })).not.toBe(modelled);
  });

  it("sorts rows deterministically by commodity then country", () => {
    const rows = [
      row({ countryId: "UK", commodity: "food" }),
      row({ countryId: "US", commodity: "gas" }),
      row({ countryId: "US", commodity: "food" }),
    ];
    expect(sortFundedCountryBookRows(rows).map((r) => `${r.commodity}:${r.countryId}`)).toEqual([
      "food:UK",
      "food:US",
      "gas:US",
    ]);
  });
});
