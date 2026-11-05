import { describe, expect, it } from "vitest";
import { freeTransferMemo, internalSupplyView } from "./internalSupplyView";
import { NET_MARGIN_FLOOR_PCT } from "./netMargin";

describe("internalSupplyView", () => {
  it("counts priced internal income and charges on one basis (ticket 1763)", () => {
    // A chemicals site: booked loss on outside sales, priced deliveries to own sites.
    const v = internalSupplyView({
      profit: -5_980_000,
      revenue: 5_820_000,
      totalCost: 11_800_000,
      income: 13_570_000,
      charge: 6_560_000,
    });
    expect(v.profit).toBe(1_030_000);
    expect(v.revenue).toBe(19_390_000);
    expect(v.totalCost).toBe(18_360_000);
    expect(v.ownSiteMemo).toBe(0);
    expect(v.netMarginPct).toBeCloseTo((1_030_000 / 19_390_000) * 100, 6);
  });

  it("gives a free supplier a memo at its ask instead of the -999% floor", () => {
    const booked = internalSupplyView({ profit: -238_578, revenue: 0, totalCost: 238_578 });
    expect(booked.netMarginPct).toBe(NET_MARGIN_FLOOR_PCT);
    const v = internalSupplyView({
      profit: -238_578,
      revenue: 0,
      totalCost: 238_578,
      ownSiteValue: 400_000,
    });
    expect(v.profit).toBe(-238_578);
    expect(v.ownSiteMemo).toBe(400_000);
    expect(v.netMarginPct).toBeCloseTo(((400_000 - 238_578) / 400_000) * 100, 6);
  });

  it("never adds the memo once the deliveries were priced", () => {
    expect(freeTransferMemo({ income: 10, ownSiteValue: 500 })).toBe(0);
    expect(freeTransferMemo({ income: 0, ownSiteValue: 500 })).toBe(500);
    const v = internalSupplyView({
      profit: 0,
      revenue: 100,
      totalCost: 100,
      income: 50,
      ownSiteValue: 500,
    });
    expect(v.ownSiteMemo).toBe(0);
    expect(v.revenue).toBe(150);
  });

  it("leaves a site with no internal supply on its booked figures", () => {
    const v = internalSupplyView({ profit: 20, revenue: 100, totalCost: 80 });
    expect(v).toMatchObject({ profit: 20, revenue: 100, totalCost: 80, ownSiteMemo: 0 });
    expect(v.netMarginPct).toBe(20);
  });

  it("ignores junk and negative internal figures", () => {
    const v = internalSupplyView({
      profit: 20,
      revenue: 100,
      totalCost: 80,
      income: Number.NaN,
      charge: -5,
      ownSiteValue: Number.POSITIVE_INFINITY,
    });
    expect(v).toMatchObject({ profit: 20, revenue: 100, income: 0, charge: 0, ownSiteMemo: 0 });
  });
});
