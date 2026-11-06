import { describe, expect, it } from "vitest";
import { decisionProfit } from "./internalTransferPricingRules";
import { strugglingReason } from "./transitionRules";

// A mine whose whole output went to its own steel plant at market value.
const seller = { soldUnits: 0, profit: -30, internalSupplyIncome: 50 };
// The steel plant that took it: sells, books a small economic profit.
const receiver = { soldUnits: 10, profit: 20, internalSupplyCharge: 50 };

describe("decisionProfit", () => {
  it("adds own-site income and subtracts own-site charges on management accounts", () => {
    expect(decisionProfit(seller, true)).toBe(20);
    expect(decisionProfit(receiver, true)).toBe(-30);
    expect(decisionProfit(seller, true) + decisionProfit(receiver, true)).toBe(
      seller.profit + receiver.profit
    );
  });

  it("is the economic profit below stage 3", () => {
    expect(decisionProfit(seller, false)).toBe(-30);
    expect(decisionProfit(receiver, false)).toBe(20);
  });

  it("ignores missing or invalid entries", () => {
    expect(decisionProfit({ profit: 5 }, true)).toBe(5);
    expect(decisionProfit({ profit: 5, internalSupplyIncome: Number.NaN }, true)).toBe(5);
  });
});

describe("strugglingReason on management accounts", () => {
  it("does not mark a captive-only seller at stage 3", () => {
    expect(strugglingReason(seller, true)).toBeNull();
    expect(strugglingReason({ ...seller, soldUnits: 5 }, true)).toBeNull();
  });

  it("marks the receiving site losing once it carries the charge", () => {
    expect(strugglingReason(receiver, true)).toBe("losing");
  });

  it("is unchanged below stage 3", () => {
    expect(strugglingReason(seller)).toBe("zeroSales");
    expect(strugglingReason({ ...seller, soldUnits: 5 })).toBe("losing");
    expect(strugglingReason(receiver)).toBeNull();
  });
});
