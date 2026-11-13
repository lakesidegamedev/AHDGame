import { describe, expect, it } from "vitest";
import { parsePreviewRows, topBondsForPreview, topStocksForPreview } from "./overviewPreview";

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
