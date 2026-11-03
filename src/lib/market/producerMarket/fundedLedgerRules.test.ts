import { describe, expect, it } from "vitest";
import { fundedLedgerRows, fundedLedgers, withStatelessCountryDemand } from "./fundedLedgerRules";

describe("funded supply and demand ledgers", () => {
  const rows = fundedLedgerRows({
    outcomes: [
      { commodity: "food", book: "world", accountId: "hh-ca", requestedUnits: 10 },
      { commodity: "food", book: "world", accountId: "public-us", requestedUnits: 4 },
      { commodity: "healthcare_services", book: "state:NY", accountId: "hh-ca", requestedUnits: 2 },
      { commodity: "food", book: "world", accountId: "hh-ca", requestedUnits: 0 },
    ],
    products: [
      { producerId: "farm-tx", commodity: "food", book: "world", offeredUnits: 30 },
      { producerId: "clinic", commodity: "healthcare_services", book: "state:NY", offeredUnits: 1 },
    ],
    stateOfAccount: (id) => (id === "hh-ca" ? "CA" : null),
    stateOfProducer: (id) => (id === "farm-tx" ? "TX" : null),
    unitScale: 24,
  });

  it("places demand at the buyer, supply at the seller and local services in their state", () => {
    expect(rows).toHaveLength(4);
    expect(rows).toEqual(
      expect.arrayContaining([
        { commodity: "food", stateId: "CA", supply: 0, demand: 240 },
        { commodity: "food", stateId: "TX", supply: 720, demand: 0 },
        { commodity: "food", stateId: null, supply: 0, demand: 96 },
        { commodity: "healthcare_services", stateId: "NY", supply: 24, demand: 48 },
      ])
    );
  });

  it("counts stateless buyers in the world total only", () => {
    const { global, byState } = fundedLedgers(rows);
    expect(global.get("food")).toEqual({ supply: 720, demand: 336 });
    expect(byState.get("CA")?.get("food")).toEqual({ supply: 0, demand: 240 });
    expect([...byState.keys()].sort()).toEqual(["CA", "NY", "TX"]);
  });

  it("gives every commodity a row in every book, zero when nothing traded", () => {
    const { global, byState } = fundedLedgers(rows);
    expect(global.get("steel")).toEqual({ supply: 0, demand: 0 });
    expect(byState.get("CA")?.get("steel")).toEqual({ supply: 0, demand: 0 });
  });

  it("leaves rows unchanged when no country lookup is given (stage off)", () => {
    expect(rows.every((r) => !("countryId" in r))).toBe(true);
    expect(fundedLedgers(rows).statelessByCountry.size).toBe(0);
  });
});

describe("stateless national buyers in the national book", () => {
  const outcomes = [
    { commodity: "ordnance", book: "world", accountId: "hh-ca", requestedUnits: 1 },
    { commodity: "ordnance", book: "world", accountId: "public-us", requestedUnits: 50 },
    { commodity: "ordnance", book: "world", accountId: "public-jp", requestedUnits: 20 },
    { commodity: "ordnance", book: "world", accountId: "orphan", requestedUnits: 5 },
    {
      commodity: "healthcare_services",
      book: "state:CA",
      accountId: "public-us",
      requestedUnits: 7,
    },
  ];
  const products = [
    { producerId: "arsenal-ca", commodity: "ordnance", book: "world", offeredUnits: 40 },
  ];
  const base = {
    outcomes,
    products,
    stateOfAccount: (id: string) => (id === "hh-ca" ? "CA" : null),
    stateOfProducer: (id: string) => (id === "arsenal-ca" ? "CA" : null),
    unitScale: 1,
  };
  const country = (id: string) =>
    id === "public-us" ? "US" : id === "public-jp" ? "JP" : id === "hh-ca" ? "US" : null;
  const off = fundedLedgerRows(base);
  const on = fundedLedgerRows({ ...base, countryOfAccount: country });

  it("keys a stateless buyer's orders to its country, not one shared world-only row", () => {
    expect(off.filter((r) => r.stateId == null)).toEqual([
      { commodity: "ordnance", stateId: null, supply: 0, demand: 75 },
    ]);
    expect(on.filter((r) => r.stateId == null)).toEqual([
      { commodity: "ordnance", stateId: null, supply: 0, demand: 5 },
      { commodity: "ordnance", stateId: null, countryId: "JP", supply: 0, demand: 20 },
      { commodity: "ordnance", stateId: null, countryId: "US", supply: 0, demand: 50 },
    ]);
  });

  it("keeps state rows, local-service books and the world total identical", () => {
    const stateRows = (r: typeof on) => r.filter((x) => x.stateId != null);
    expect(stateRows(on)).toEqual(stateRows(off));
    const a = fundedLedgers(off);
    const b = fundedLedgers(on);
    expect(b.global).toEqual(a.global);
    expect(b.byState).toEqual(a.byState);
    expect(b.byState.get("CA")?.get("healthcare_services")).toEqual({ supply: 0, demand: 7 });
  });

  it("adds each country's stateless demand to its national aggregate only", () => {
    const { byState, statelessByCountry } = fundedLedgers(on);
    const aggregate = new Map([["US", new Map(byState.get("CA"))]]);
    const national = withStatelessCountryDemand(aggregate, statelessByCountry);
    expect(national.get("US")?.get("ordnance")).toEqual({ supply: 40, demand: 51 });
    // A country with only stateless orders still gets a dense national book.
    expect(national.get("JP")?.get("ordnance")).toEqual({ supply: 0, demand: 20 });
    expect(national.get("JP")?.get("steel")).toEqual({ supply: 0, demand: 0 });
    // The unattributed order stays world-only.
    expect([...national.keys()].sort()).toEqual(["JP", "US"]);
    // Inputs are not mutated.
    expect(aggregate.get("US")?.get("ordnance")).toEqual({ supply: 40, demand: 1 });
  });

  it("returns an equal copy when nothing is stateless (flag-off byte identity)", () => {
    const { byState, statelessByCountry } = fundedLedgers(off);
    const aggregate = new Map([["US", new Map(byState.get("CA"))]]);
    const national = withStatelessCountryDemand(aggregate, statelessByCountry);
    expect(national).toEqual(aggregate);
    expect([...national.get("US")!.keys()]).toEqual([...aggregate.get("US")!.keys()]);
  });
});
