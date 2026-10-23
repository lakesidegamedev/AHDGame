import { describe, expect, it } from "vitest";
import { fundedLedgerRows, fundedLedgers } from "./fundedLedgerRules";

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
});
