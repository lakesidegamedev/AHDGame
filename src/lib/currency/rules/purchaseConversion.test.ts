import { planEuroSettlement } from "../euro/rules";
import { describe, expect, it } from "vitest";
import { MARKET_MAKER_SPREAD } from "@/lib/constants/currencies";
import {
  purchaseConversionDelivered,
  purchaseConversionMinimumSpend,
  purchaseConversionRequired,
  purchaseConversionSpend,
  purchaseSpreadRate,
} from "./purchaseConversion";

describe("purchase conversion funding", () => {
  it.each([0.5, 1, 1.5])("covers the actual source spread strength %s", (strength) => {
    const target = 100000;
    const rate = 0.8;
    const spend = purchaseConversionSpend(target, rate, 200000, false, strength);
    const fee = Math.round(spend * MARKET_MAKER_SPREAD * strength);
    expect(Math.round((spend - fee) * rate)).toBeGreaterThanOrEqual(target);
    expect(purchaseConversionRequired(target, rate, false, strength)).toBeCloseTo(
      target / ((1 - MARKET_MAKER_SPREAD * strength) * rate)
    );
  });
  it("caps spend at the wallet and preserves fee-free fixed settlement", () => {
    expect(purchaseConversionSpend(1000, 1, 500, false, 1.5)).toBe(500);
    expect(purchaseConversionSpend(1000, 4 / 3, 750, true, 1.5)).toBe(750);
    expect(purchaseConversionRequired(1000, 4 / 3, true, 1.5)).toBe(750);
  });
});

it("waives internal euro payout fees and uses common policy for external payouts", () => {
  const union = planEuroSettlement({
    year: 1999,
    turn: 385,
    preset: "1991-default",
    europeanMembers: ["DE", "IE", "UK"],
    consentedCountries: ["DE", "IE", "UK"],
    rates: { EUR: 0.8, IEP: 0.7, GBP: 0.6 },
  }).union;
  expect(purchaseSpreadRate("GBP", "EUR", union, { EUR: 1.5 })).toBe(0);
  expect(purchaseSpreadRate("GBP", "USD", union, { EUR: 1.5, GBP: 0.5 })).toBe(
    MARKET_MAKER_SPREAD * 1.5
  );
});

describe("explicit-pay minimum spend", () => {
  it("delivers the full target at a rate where the closed form fell short", () => {
    const rate = 199.64422498404926;
    const target = 1_056_600_000;
    const closedForm = purchaseConversionRequired(target, rate, false);
    expect(purchaseConversionDelivered(closedForm, rate, false)).toBeLessThan(target);
    const spend = purchaseConversionMinimumSpend(target, rate, false);
    expect(purchaseConversionDelivered(spend, rate, false)).toBeGreaterThanOrEqual(target);
    // Within a few whole source units of the closed form, not a blanket overpay.
    expect(spend - closedForm).toBeLessThan(2);
  });

  it.each([
    [0.0093, 12_345.67, 1],
    [1, 1_000_000, 0.5],
    [9.940268785543603, 28_046_445, 1],
    [320.4892268567733, 452_129_270.4, 1.5],
    [106, 99_999, 1],
  ])("covers rate %s target %s strength %s", (rate, target, strength) => {
    const spend = purchaseConversionMinimumSpend(target, rate, false, strength);
    expect(purchaseConversionDelivered(spend, rate, false, strength)).toBeGreaterThanOrEqual(
      target
    );
  });

  it("covers fixed euro settlement with floor rounding", () => {
    const spend = purchaseConversionMinimumSpend(1000, 4 / 3, true);
    expect(purchaseConversionDelivered(spend, 4 / 3, true)).toBeGreaterThanOrEqual(1000);
  });
});
