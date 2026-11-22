import { describe, expect, it } from "vitest";
import { quoteShareIssuance } from "./shareIssuanceQuote";

describe("quoteShareIssuance", () => {
  it("keeps the price level when new shares sell at the current price", () => {
    const q = quoteShareIssuance({ sharePrice: 3.6, totalShares: 3_086_415, issuePercent: 20 });
    expect(q.newShares).toBe(617_283);
    expect(q.proceeds).toBeCloseTo(617_283 * 3.6, 6);
    expect(q.priceAfterIssue).toBeCloseTo(3.6, 9);
    expect(q.priceChangePct).toBeCloseTo(0, 9);
    expect(q.ownershipGivenUpPct).toBeCloseTo(16.67, 1);
  });

  it("handles a zero issue", () => {
    const q = quoteShareIssuance({ sharePrice: 5, totalShares: 1000, issuePercent: 0 });
    expect(q.priceAfterIssue).toBe(5);
    expect(q.ownershipGivenUpPct).toBe(0);
  });
});
