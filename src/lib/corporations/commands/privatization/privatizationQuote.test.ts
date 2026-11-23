import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { privatizationFunding, quotePrivatizationBuyout } from "./privatizationQuote";
import { privatizeBlockedReason } from "@/components/corporation/CorporationStructureActions";

const referenceValuationMock = vi.hoisted(() => vi.fn());
vi.mock("../acquisitions/referenceValuation", () => ({
  referenceValuation: referenceValuationMock,
}));
vi.mock("@/lib/currency/corporationCapital", () => ({
  loadFxRatesByCurrency: vi.fn().mockResolvedValue(new Map()),
  fxRateForCorpFromMap: vi.fn().mockReturnValue(1),
  anchorToCorpCapital: (anchor: number) => anchor,
  corpCapitalToAnchor: (value: number) => value,
}));
vi.mock("@/lib/banking/policy", () => ({ loadBankingPolicy: vi.fn() }));

function corp() {
  const ceoId = new ObjectId();
  return {
    _id: new ObjectId(),
    ceoId,
    sharePrice: 5.4545,
    totalShares: 10_000_000,
    publicFloat: 0,
    liquidCurrencyCode: "USD",
    shareholders: [{ characterId: ceoId, shares: 7_654_321 }],
  };
}

describe("quotePrivatizationBuyout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("quotes market +10% when no floor binds", async () => {
    referenceValuationMock.mockResolvedValue({ minimumPriceAnchor: 0 });
    const q = await quotePrivatizationBuyout({} as Db, corp() as never, 7_654_321);
    expect(q.nonCeoShares).toBe(2_345_679);
    expect(q.lockedBuyoutPrice).toBe(6);
    expect(q.priceBasis).toBe("market");
    expect(q.totalReservedCash).toBe(Math.ceil(2_345_679 * 6));
  });

  it("reserves at the asset floor price and reports it as the basis", async () => {
    referenceValuationMock.mockResolvedValue({ minimumPriceAnchor: 63_100_000 });
    const q = await quotePrivatizationBuyout({} as Db, corp() as never, 7_654_321);
    expect(q.marketPrice).toBe(6);
    expect(q.lockedBuyoutPrice).toBeCloseTo(6.31, 6);
    expect(q.priceBasis).toBe("assetValue");
    expect(q.totalReservedCash).toBe(Math.ceil(q.nonCeoShares * q.lockedBuyoutPrice));
  });

  it("keeps the market basis when the asset floor is below it", async () => {
    referenceValuationMock.mockResolvedValue({ minimumPriceAnchor: 10_000_000 });
    const q = await quotePrivatizationBuyout({} as Db, corp() as never, 7_654_321);
    expect(q.priceBasis).toBe("market");
    expect(q.lockedBuyoutPrice).toBe(6);
  });
});

describe("privatizationFunding", () => {
  it("is unaffordable when personal cash is a tenth of the reserve", () => {
    expect(privatizationFunding(14_800_000, 1_440_000)).toEqual({
      affordable: false,
      shortfall: 13_360_000,
    });
  });
  it("is affordable at exactly the reserve", () => {
    expect(privatizationFunding(1000, 1000)).toEqual({ affordable: true, shortfall: 0 });
  });
});

describe("privatizeBlockedReason", () => {
  const fmt = (n: number) => `$${n}`;
  it("names personal cash and the shortfall", () => {
    const r = privatizeBlockedReason(
      { affordable: false, shortfall: 500, crossCurrency: false },
      fmt
    );
    expect(r).toContain("personal cash");
    expect(r).toContain("$500");
  });
  it("is null when fundable", () => {
    expect(
      privatizeBlockedReason({ affordable: true, shortfall: 0, crossCurrency: false }, fmt)
    ).toBeNull();
  });
});
