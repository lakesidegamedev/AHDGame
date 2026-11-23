import { describe, expect, it } from "vitest";
import {
  atPriceCap,
  parsePreviewRows,
  topBondsForPreview,
  topStocksForPreview,
} from "./overviewPreview";

describe("parsePreviewRows", () => {
  it("accepts a positive integer and caps it", () => {
    expect(parsePreviewRows("5")).toBe(5);
    expect(parsePreviewRows("500")).toBe(20);
  });
  it("rejects missing and invalid values", () => {
    expect(parsePreviewRows(null)).toBeNull();
    expect(parsePreviewRows("0")).toBeNull();
    expect(parsePreviewRows("x")).toBeNull();
    expect(parsePreviewRows("2.5")).toBeNull();
  });
});

describe("topBondsForPreview", () => {
  it("keeps open corporate bonds, highest yield first", () => {
    const bonds = [
      { id: "a", issuerType: "corporation", publicFloat: 3, yieldToMaturity: 4 },
      { id: "b", issuerType: "sovereign", publicFloat: 3, yieldToMaturity: 9 },
      { id: "c", issuerType: "corporation", publicFloat: 0, yieldToMaturity: 8 },
      { id: "d", issuerType: "corporation", publicFloat: 1, yieldToMaturity: 6, defaulted: true },
      { id: "e", issuerType: "corporation", publicFloat: 2, yieldToMaturity: 7 },
    ];
    expect(topBondsForPreview(bonds, 5).map((b) => b.id)).toEqual(["e", "a"]);
    expect(topBondsForPreview(bonds, 1).map((b) => b.id)).toEqual(["e"]);
  });
});

describe("topStocksForPreview", () => {
  it("drops party-owned listings and sorts by anchor cap", () => {
    const listings = [
      { id: "a", marketCap: 10 },
      { id: "b", marketCap: 5, marketCapAnchor: 50 },
      { id: "c", marketCap: 99, isNpp: true },
    ];
    expect(topStocksForPreview(listings, 5).map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("atPriceCap", () => {
  it("flags prices on the ceiling and ignores unknown ceilings", () => {
    expect(atPriceCap({ globalPrice: 358.1, priceCeiling: 360 })).toBe(true);
    expect(atPriceCap({ globalPrice: 200, priceCeiling: 360 })).toBe(false);
    expect(atPriceCap({ globalPrice: 200 })).toBe(false);
  });
});

describe("priceCapBasisText", () => {
  it("reads the multiple and index from the stored basis", async () => {
    const { priceCapBasisText, resolvePriceCapBasis } = await import("./priceCapBasis");
    expect(priceCapBasisText({ multiplier: 3, nominalIndex: 1.2 })).toBe(
      "3x the inflation-adjusted base (base x 1.20 = +260% vs original base)"
    );
    expect(priceCapBasisText(null)).toBeNull();
    expect(
      resolvePriceCapBasis({ producerPriceMaxMultiplier: 2.5, commodityNominalPriceIndex: 1.1 })
    ).toEqual({ multiplier: 2.5, nominalIndex: 1.1 });
    expect(resolvePriceCapBasis(null).nominalIndex).toBe(1);
  });
});
