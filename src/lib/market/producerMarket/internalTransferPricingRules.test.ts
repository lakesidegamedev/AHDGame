import { describe, expect, it } from "vitest";
import { internalTransferAccount, internalTransferUnitPrice } from "./internalTransferPricingRules";
import { settleProducerMarket } from "./rules";

describe("internal transfer pricing", () => {
  it("allocates site accounts without mutating the economic figures", () => {
    const supplier = { revenue: 0, costs: 50, profit: -50 };
    const buyer = { revenue: 1000, costs: 500, profit: 500 };
    const supplied = internalTransferAccount({ ...supplier, income: 300 });
    const received = internalTransferAccount({ ...buyer, charge: 300 });
    expect(supplied).toEqual({ revenue: 300, costs: 50, profit: 250 });
    expect(received).toEqual({ revenue: 1000, costs: 800, profit: 200 });
    expect(supplied.profit + received.profit).toBe(supplier.profit + buyer.profit);
    expect(supplier).toEqual({ revenue: 0, costs: 50, profit: -50 });
    expect(buyer).toEqual({ revenue: 1000, costs: 500, profit: 500 });
    expect(internalTransferAccount(supplier)).toEqual(supplier);
  });
  it("allocates different supplier costs pro rata and keeps outside sales at their posted price", () => {
    const result = settleProducerMarket({
      turn: 1,
      ownSitesFirst: true,
      accounts: [
        { id: "company", cash: 0 },
        { id: "outside", cash: 1000 },
      ],
      offers: [
        {
          id: "first",
          accountId: "company",
          commodity: "energy",
          book: "world",
          units: 10,
          unitPrice: 10,
          internalUnitPrice: 2,
        },
        {
          id: "second",
          accountId: "company",
          commodity: "energy",
          book: "world",
          units: 10,
          unitPrice: 20,
          internalUnitPrice: 5,
        },
      ],
      orders: [
        {
          id: "own",
          internalAccountingSiteId: "receiver",
          accountId: "company",
          commodity: "energy",
          book: "world",
          units: 10,
          maximumUnitPrice: 1,
        },
        {
          id: "outside",
          accountId: "outside",
          commodity: "energy",
          book: "world",
          units: 5,
          maximumUnitPrice: 100,
        },
      ],
    });
    expect(result.offers.find((o) => o.id === "first")?.internalValue).toBe(10);
    expect(result.offers.find((o) => o.id === "second")?.internalValue).toBe(25);
    expect(result.orders.find((o) => o.id === "own")?.internalCost).toBe(35);
    expect(result.orders.find((o) => o.id === "outside")).toMatchObject({
      cost: 50,
      deliveredUnits: 5,
    });
    expect(result.orders.find((o) => o.id === "outside")?.internalCost).toBeUndefined();
    expect(result.accounts.find((a) => a.id === "company")?.cash).toBe(50);
  });
  it("keeps existing policies free and prices cost and discounted market modes", () => {
    const prices = { marketPrice: 100, unitCost: 60 };
    expect(internalTransferUnitPrice({ ...prices })).toBe(0);
    expect(internalTransferUnitPrice({ ...prices, mode: "free", discount: 0.2 })).toBe(0);
    expect(internalTransferUnitPrice({ ...prices, mode: "cost", discount: 0.2 })).toBe(60);
    expect(internalTransferUnitPrice({ ...prices, mode: "market", discount: 0.2 })).toBe(80);
    expect(internalTransferUnitPrice({ ...prices, mode: "market", discount: 0 })).toBe(100);
  });

  it.each([true, false])(
    "records matched charges and credits without spending cash, own-first=%s",
    (ownSitesFirst) => {
      const result = settleProducerMarket({
        turn: 1,
        accounts: [{ id: "company", cash: 0 }],
        offers: [
          {
            id: "supplier",
            accountId: "company",
            commodity: "energy",
            book: "world",
            units: 10,
            unitPrice: 100,
            internalUnitPrice: 60,
          },
        ],
        orders: [
          {
            id: "buyer",
            internalAccountingSiteId: "receiver",
            accountId: "company",
            commodity: "energy",
            book: "world",
            units: 5,
            maximumUnitPrice: 100,
          },
        ],
        ownSitesFirst,
      });
      expect(result.accounts).toEqual([{ id: "company", cash: 0 }]);
      expect(result.offers[0]).toMatchObject({
        internalDeliveredUnits: 5,
        internalValue: 300,
        soldUnits: 0,
        revenue: 0,
      });
      expect(result.orders[0]).toMatchObject({ deliveredUnits: 5, internalCost: 300, cost: 0 });
    }
  );
});
