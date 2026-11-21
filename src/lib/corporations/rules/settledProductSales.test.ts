import { describe, expect, it } from "vitest";
import { settledProductSales } from "./settledProductSales";

describe("settledProductSales", () => {
  const receipt = {
    turn: 106,
    products: [
      {
        commodity: "electronics",
        producedUnits: 20,
        offeredUnits: 20,
        soldUnits: 12,
        internalDeliveredUnits: 0,
        revenue: 120,
      },
      {
        commodity: "electronics",
        producedUnits: 5,
        offeredUnits: 5,
        soldUnits: 2.5,
        internalDeliveredUnits: 0,
        revenue: 30,
      },
      {
        commodity: "energy",
        producedUnits: 104,
        offeredUnits: 104,
        soldUnits: 0,
        internalDeliveredUnits: 104,
        revenue: 0,
      },
    ],
  };

  it("reconciles outside sales, transfers, and unsold offers by product", () => {
    const sales = settledProductSales(receipt, 107);
    expect(sales?.get("electronics")).toEqual({
      produced: 25,
      offered: 25,
      sold: 14.5,
      ownSites: 0,
      unsold: 10.5,
      revenue: 150,
    });
    expect(sales?.get("energy")).toEqual({
      produced: 104,
      offered: 104,
      sold: 0,
      ownSites: 104,
      unsold: 0,
      revenue: 0,
    });
  });

  it("ignores missing, expired, and future settlements", () => {
    expect(settledProductSales(null, 106)).toBeNull();
    expect(settledProductSales(receipt, 108)).toBeNull();
    expect(settledProductSales(receipt, 105)).toBeNull();
  });
});
