import { describe, expect, it } from "vitest";
import {
  allocatePoliticalAdOrders,
  politicalMediaFillRatio,
  type PoliticalAdOrderDemand,
  type PoliticalAdSellerOffer,
} from "./rules";

const order = (overrides: Partial<PoliticalAdOrderDemand> = {}): PoliticalAdOrderDemand => ({
  orderId: "order-1",
  countryId: "US",
  stateId: "CA",
  createdTurn: 12,
  budgetAnchor: 100,
  ...overrides,
});

const seller = (overrides: Partial<PoliticalAdSellerOffer> = {}): PoliticalAdSellerOffer => ({
  sectorId: "sector-1",
  corporationId: "corp-1",
  countryId: "US",
  stateId: "CA",
  unsoldUnits: 10,
  offeredUnits: 20,
  unitPriceAnchor: 10,
  sellerLocalPerAnchor: 1.25,
  ...overrides,
});

describe("allocatePoliticalAdOrders", () => {
  it("scales effects from delivered funded value only", () => {
    expect(politicalMediaFillRatio(25, 100)).toBe(0.25);
    expect(politicalMediaFillRatio(120, 100)).toBe(1);
    expect(politicalMediaFillRatio(0, 100)).toBe(0);
    expect(politicalMediaFillRatio(25, 0)).toBe(0);
  });

  it("matches only unsold output in the requested state and conserves the order budget", () => {
    const result = allocatePoliticalAdOrders(
      [order()],
      [
        seller(),
        seller({ sectorId: "sector-commercially-sold", unsoldUnits: 0 }),
        seller({ sectorId: "sector-other-state", stateId: "NY" }),
        seller({ sectorId: "sector-other-country", countryId: "CA" }),
      ]
    )[0];

    expect(result.deliveredAnchor).toBe(100);
    expect(result.unfilledAnchor).toBe(0);
    expect(result.deliveredUnits).toBe(10);
    expect(result.sellers).toEqual([
      expect.objectContaining({
        sectorId: "sector-1",
        amountAnchor: 100,
        sellerLocalAmount: 125,
        soldFractionAfterAllocation: 1,
      }),
    ]);
  });

  it("partially fills and leaves the exact unspent amount for refund", () => {
    const result = allocatePoliticalAdOrders([order()], [seller({ unsoldUnits: 3 })])[0];

    expect(result.deliveredAnchor).toBe(30);
    expect(result.unfilledAnchor).toBe(70);
    expect(result.deliveredUnits).toBe(3);
    expect(result.sellers[0]?.soldFractionAfterAllocation).toBe(1);
  });

  it("returns an unfilled order when the target state has no available ad units", () => {
    const result = allocatePoliticalAdOrders(
      [order()],
      [seller({ stateId: "NY" }), seller({ unsoldUnits: 0 })]
    )[0];

    expect(result).toMatchObject({ deliveredAnchor: 0, unfilledAnchor: 100, deliveredUnits: 0 });
    expect(result.sellers).toEqual([]);
  });

  it("orders seller fills by price with stable tie breakers and orders by turn then id", () => {
    const results = allocatePoliticalAdOrders(
      [
        order({ orderId: "later", createdTurn: 13, budgetAnchor: 20 }),
        order({ orderId: "earlier", budgetAnchor: 20 }),
      ],
      [
        seller({
          sectorId: "z-sector",
          corporationId: "z-corp",
          unitPriceAnchor: 5,
          unsoldUnits: 4,
        }),
        seller({
          sectorId: "b-sector",
          corporationId: "b-corp",
          unitPriceAnchor: 5,
          unsoldUnits: 4,
        }),
        seller({
          sectorId: "cheap-sector",
          corporationId: "a-corp",
          unitPriceAnchor: 2,
          unsoldUnits: 2,
        }),
      ]
    );

    expect(results.map((result) => result.orderId)).toEqual(["earlier", "later"]);
    expect(results[0]?.sellers.map((allocation) => allocation.sectorId)).toEqual([
      "cheap-sector",
      "b-sector",
    ]);
    expect(results[1]?.sellers.map((allocation) => allocation.sectorId)).toEqual([
      "b-sector",
      "z-sector",
    ]);
  });

  it("lets a national campaign order buy airtime elsewhere in its country once its state is sold out", () => {
    const [result] = allocatePoliticalAdOrders(
      [order({ stateId: "NY", budgetAnchor: 100, countryWide: true })],
      [
        seller({ sectorId: "ny-sold-out", stateId: "NY", unsoldUnits: 0 }),
        seller({ sectorId: "ca-spare", stateId: "CA", unsoldUnits: 4, unitPriceAnchor: 10 }),
        seller({ sectorId: "tx-spare", stateId: "TX", unsoldUnits: 10, unitPriceAnchor: 20 }),
        seller({ sectorId: "foreign", countryId: "CA", stateId: "ON", unitPriceAnchor: 1 }),
      ]
    );

    expect(result.sellers.map((allocation) => [allocation.sectorId, allocation.units])).toEqual([
      ["ca-spare", 4],
      ["tx-spare", 3],
    ]);
    expect(result.deliveredAnchor).toBe(100);
    expect(result.unfilledAnchor).toBe(0);
  });

  it("keeps regional orders in their state and serves each state's own orders before national spill", () => {
    const results = allocatePoliticalAdOrders(
      [
        order({ orderId: "a-national", stateId: "NY", budgetAnchor: 100, countryWide: true }),
        order({ orderId: "b-regional-ny", stateId: "NY", budgetAnchor: 100 }),
        order({ orderId: "c-local-ca", stateId: "CA", budgetAnchor: 30 }),
      ],
      [seller({ sectorId: "ca-spare", stateId: "CA", unsoldUnits: 5, unitPriceAnchor: 10 })]
    );
    const byId = new Map(results.map((result) => [result.orderId, result]));

    expect(byId.get("c-local-ca")?.deliveredAnchor).toBe(30);
    expect(byId.get("a-national")?.deliveredAnchor).toBe(20);
    expect(byId.get("b-regional-ny")?.deliveredAnchor).toBe(0);
    expect(byId.get("b-regional-ny")?.sellers).toEqual([]);
  });

  it("never emits a dust seller receipt that cash cannot represent", () => {
    const [result] = allocatePoliticalAdOrders(
      [order({ budgetAnchor: 462_000 })],
      [seller({ unsoldUnits: 2.842170943040401e-14, unitPriceAnchor: 12.5 })]
    );

    expect(result.sellers).toEqual([]);
    expect(result.deliveredAnchor).toBe(0);
    expect(result.deliveredUnits).toBe(0);
    expect(result.unfilledAnchor).toBe(462_000);
  });
});
