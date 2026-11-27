import { describe, expect, it } from "vitest";
import { convertCommodityPrice, formatCommodityPrice } from "./commodityPriceDisplay";
import { convertFromInternal } from "@/lib/utils/formattersCore";
import { priceColor } from "./commodityMapColorScale";

describe("commodity currency evidence", () => {
  it.each([undefined, {}, { CAD: 0 }, { CAD: -1 }, { CAD: NaN }, { CAD: Infinity }])(
    "does not invent a conversion from missing/invalid rates %j",
    (rates) => {
      expect(convertFromInternal(100, "CAD", rates)).toBeNull();
      expect(convertCommodityPrice(100, "CAD", true, rates)).toBeNull();
      expect(formatCommodityPrice(100, "CAD", true, rates)).toBe("Price unavailable");
    }
  );
  it("uses the known rate once, including a zero-valued price", () => {
    expect(convertCommodityPrice(100, "CAD", true, { CAD: 1.25 })).toBe(125);
    expect(formatCommodityPrice(100, "CAD", true, { CAD: 1.25 })).toContain("125");
    expect(convertCommodityPrice(0, "CAD", true, { CAD: 1.25 })).toBe(0);
    expect(convertCommodityPrice(100, "CAD", false)).toBe(100);
  });
  it("does not turn unknown prices into a shortage/surplus color", () => {
    expect(priceColor(null, 100, 20)).toBe("rgba(148, 163, 184, 0.15)");
    expect(priceColor(100, null, 20)).toBe("rgba(148, 163, 184, 0.15)");
  });
});

it("does not treat unknown FX status as disabled", () => {
  expect(convertCommodityPrice(100, "JPY", null)).toBeNull();
  expect(formatCommodityPrice(100, "JPY", null)).toBe("Price unavailable");
});
