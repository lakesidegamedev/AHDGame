import { describe, expect, it } from "vitest";
import { applyExportPriceFeedback } from "./exportPriceFeedback";
import type { SourcingForeignQuote } from "@/lib/logistics/sourcing";

type Input = Parameters<typeof applyExportPriceFeedback>[0];
const quote = (
  exporter: string,
  overrides: Partial<SourcingForeignQuote> = {}
): SourcingForeignQuote => ({
  commodity: "food",
  exporter,
  importer: "US",
  tariffRatePct: 0,
  rawShippingPerUnit: 0,
  shippingAskShare: 0,
  shippingMaxAskShare: 0.4,
  ...overrides,
});
function input(overrides: Partial<Input> = {}): Input {
  return {
    commodity: "food",
    prices: { IE: 280, JP: 270 },
    marketCountries: new Set(["IE", "JP"]),
    destinations: [
      ["IE", 100],
      ["JP", 500],
    ].map(([country, offer]) => ({
      commodity: "food",
      country: String(country),
      foreignOfferUnits: Number(offer),
      demandUnits: 0,
      supplyUnits: Number(offer),
      localUnits: 0,
      interStateUnits: 0,
      importUnits: 0,
      unmetUnits: 0,
      toleranceBoundUnits: 0,
      capacityBoundUnits: 0,
    })),
    pairs: [
      {
        commodity: "food",
        exporter: "IE",
        importer: "US",
        dispatchedUnits: 100,
        deliveredUnits: 100,
        askValue: 26000,
        freightPaid: 0,
        tariffPaid: 0,
        landedValue: 26000,
        tariffRateUnits: 0,
        legs: 1,
      },
    ],
    quotes: [quote("IE"), quote("JP")],
    ...overrides,
  };
}

describe("applyExportPriceFeedback", () => {
  it("uses the next rival quote, stays strictly below ties and does not mutate inputs", () => {
    const args = input();
    expect(applyExportPriceFeedback(args)).toEqual({ IE: 269.99, JP: 270 });
    expect(args.prices.IE).toBe(280);
  });
  it("preserves a lower market target", () => {
    expect(applyExportPriceFeedback(input({ prices: { IE: 250, JP: 270 } })).IE).toBe(250);
  });
  it("compares landed costs with exporter-specific tariffs rather than raw asks", () => {
    const args = input({ quotes: [quote("IE", { tariffRatePct: 20 }), quote("JP")] });
    expect(applyExportPriceFeedback(args).IE).toBe(224.99);
  });
  it("inverts both branches of capped freight charges", () => {
    const quotes = [quote("IE", { rawShippingPerUnit: 100 }), quote("JP")];
    expect(applyExportPriceFeedback(input({ quotes })).IE).toBe(192.85);
    expect(
      applyExportPriceFeedback(
        input({ quotes: [quote("IE", { rawShippingPerUnit: 20 }), quote("JP")] })
      ).IE
    ).toBe(249.99);
  });
  it("accounts for grid wheeling proportional to ask", () => {
    expect(
      applyExportPriceFeedback(
        input({
          quotes: [quote("IE", { shippingAskShare: 0.12, shippingMaxAskShare: 0 }), quote("JP")],
        })
      ).IE
    ).toBe(241.07);
  });
  it("allows shortage price growth when all offers sell", () => {
    const args = input();
    args.pairs = [
      ...args.pairs,
      {
        ...args.pairs[0],
        exporter: "JP",
        dispatchedUnits: 500,
        deliveredUnits: 500,
      },
    ];
    expect(applyExportPriceFeedback(args)).toEqual(args.prices);
  });
  it("ignores a rival without enough surplus to replace the route", () => {
    const args = input();
    args.destinations[1].foreignOfferUnits = 99;
    expect(applyExportPriceFeedback(args)).toEqual(args.prices);
  });
  it("leaves unsold exporters and administered countries unchanged", () => {
    const args = input();
    args.destinations[0].foreignOfferUnits = 200;
    expect(applyExportPriceFeedback(args)).toEqual(args.prices);
    expect(applyExportPriceFeedback(input({ marketCountries: new Set(["JP"]) })).IE).toBe(280);
  });
  it("ignores embargoed or otherwise ineligible rivals absent from route quotes", () => {
    expect(applyExportPriceFeedback(input({ quotes: [quote("IE")] })).IE).toBe(280);
  });
  it("does not infer trade from domestic pairs or another commodity", () => {
    const args = input();
    args.pairs[0].importer = "IE";
    expect(applyExportPriceFeedback(args)).toEqual(args.prices);
    args.pairs[0].importer = "US";
    args.pairs[0].commodity = "coal";
    expect(applyExportPriceFeedback(args)).toEqual(args.prices);
  });
});
