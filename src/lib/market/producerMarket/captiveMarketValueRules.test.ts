import { describe, expect, it } from "vitest";
import {
  captiveMarketValue,
  laneClearingPrices,
  valuationCreditAccounts,
} from "./captiveMarketValueRules";

describe("valuationCreditAccounts", () => {
  const plans = [
    { accountId: "free" },
    { accountId: "priced" },
    { accountId: "optedIn", ownSiteMarketValue: true },
  ];
  const pricedAccounts = new Set(["priced"]);

  it("skips an account with an explicit transfer price", () => {
    const set = valuationCreditAccounts({ plans, pricedAccounts, marketValueBooked: false });
    expect(set.has("priced")).toBe(false);
    expect(set.has("free")).toBe(true);
  });

  it("skips an opted-in account only while its market-value entries are booked", () => {
    const booked = valuationCreditAccounts({ plans, pricedAccounts, marketValueBooked: true });
    expect([...booked]).toEqual(["free"]);
    const unbooked = valuationCreditAccounts({ plans, pricedAccounts, marketValueBooked: false });
    expect([...unbooked].sort()).toEqual(["free", "optedIn"]);
  });
});

describe("own-site valuation credit through captiveMarketValue", () => {
  const offers = new Map([
    ["mine", { accountId: "corp", commodity: "ore", book: "world", unitPrice: 10 }],
    ["quarry", { accountId: "corp", commodity: "stone", book: "world", unitPrice: 4 }],
  ]);
  const deliveries = [
    { offerId: "mine", orderId: "mill", units: 5 },
    { offerId: "quarry", orderId: "mill", units: 3 },
  ];
  const clearing = laneClearingPrices([{ commodity: "ore", book: "world", units: 10, value: 80 }]);

  it("credits suppliers and charges the receiver the lane price, falling back to the ask", () => {
    const out = captiveMarketValue({
      deliveries,
      offers,
      clearingByLane: clearing,
      valuedAccounts: new Set(["corp"]),
    });
    expect(out.incomeByOffer.get("mine")).toBeCloseTo(40, 8);
    expect(out.incomeByOffer.get("quarry")).toBeCloseTo(12, 8);
    expect(out.chargeByOrder.get("mill")).toBeCloseTo(52, 8);
  });

  it("nets credits and charges to zero and skips accounts that are not valued", () => {
    const out = captiveMarketValue({
      deliveries,
      offers,
      clearingByLane: clearing,
      valuedAccounts: new Set(["corp"]),
    });
    const credit = [...out.incomeByOffer.values()].reduce((n, x) => n + x, 0);
    const charge = [...out.chargeByOrder.values()].reduce((n, x) => n + x, 0);
    expect(credit).toBeCloseTo(charge, 8);
    const none = captiveMarketValue({
      deliveries,
      offers,
      clearingByLane: clearing,
      valuedAccounts: new Set(["other"]),
    });
    expect(none.incomeByOffer.size).toBe(0);
    expect(none.chargeByOrder.size).toBe(0);
  });
});
