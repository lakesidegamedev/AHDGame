import { describe, expect, it } from "vitest";
import type { CorporateSector } from "@/lib/db/types";
import type { FundedReceipt } from "@/lib/market/producerMarket/fundedSectorRules";
import { fundedReceiptOf } from "./fundedProducerTurn";
import { fundedSectorValuation } from "./fundedSectorValuation";

const sector = { capacityBookAnchor: 1000 } as unknown as CorporateSector;
const base: FundedReceipt = {
  revenue: 0,
  profit: -10,
  producedUnits: 20,
  soldUnits: 0,
};
const value = (receipt: FundedReceipt, costs = 10) =>
  fundedSectorValuation({
    sector,
    receipt,
    result: { hourlyRevenue: receipt.revenue, costs },
    currentTurn: 5,
    currentYear: 2020,
    eraUnitScale: 1,
  }).valueAnchor;

describe("fundedSectorValuation own-site credit", () => {
  it("values a supplier with no revenue at its book floor when no credit is on the receipt", () => {
    expect(value(base)).toBe(1000);
  });

  it("values the same supplier above the floor once its own-site deliveries are credited", () => {
    // (0 - 10 + 100) * 48 turns / 0.15 = 28,800
    expect(value({ ...base, valuationCredit: 100 })).toBe(28800);
  });

  it("charges the receiving site the same amount, never below its floor", () => {
    const receiver: FundedReceipt = { ...base, revenue: 200, profit: 150 };
    const free = value(receiver, 50);
    expect(value({ ...receiver, valuationCharge: 100 }, 50)).toBeLessThan(free);
    expect(value({ ...receiver, valuationCharge: 10_000 }, 50)).toBe(1000);
  });

  it("carries the two figures from the settlement onto the receipt only when present", () => {
    const settled = { revenue: 0, profit: -10, producedUnits: 20, soldUnits: 0 };
    const plain = fundedReceiptOf(settled, 0);
    expect(plain).not.toHaveProperty("valuationCredit");
    expect(plain).not.toHaveProperty("valuationCharge");
    const credited = fundedReceiptOf({ ...settled, valuationCredit: 100, valuationCharge: 7 }, 0);
    expect(credited.valuationCredit).toBe(100);
    expect(credited.valuationCharge).toBe(7);
    // Accounts stay as they were: no site income or charge is carried.
    expect(credited.internalSupplyIncome).toBeUndefined();
    expect(credited.internalSupplyCharge).toBeUndefined();
  });
});
