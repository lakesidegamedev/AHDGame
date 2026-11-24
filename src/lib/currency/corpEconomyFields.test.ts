import { describe, expect, it } from "vitest";
import { readCorpEconomicAnchor, writeCorpEconomicLocal } from "./corpEconomyFields";

describe("corpEconomyFields", () => {
  it("passes values through unchanged when corp has no liquidCurrencyCode (pre-forex)", () => {
    expect(readCorpEconomicAnchor(100, undefined, 0.5)).toBe(100);
    expect(writeCorpEconomicLocal(100, undefined, 0.5)).toBe(100);
    expect(readCorpEconomicAnchor(100, null, 0.5)).toBe(100);
    expect(writeCorpEconomicLocal(100, "", 0.5)).toBe(100);
  });

  it("divides local by rate to recover anchor when code is present", () => {
    // 200 GBP at rate 0.5 GBP-per-anchor → 400 ₳
    expect(readCorpEconomicAnchor(200, "GBP", 0.5)).toBe(400);
    // 100 USD at rate 1.0 → 100 ₳
    expect(readCorpEconomicAnchor(100, "USD", 1.0)).toBe(100);
  });

  it("multiplies anchor by rate to express in local currency", () => {
    // 400 ₳ at rate 0.5 GBP-per-anchor → 200 GBP
    expect(writeCorpEconomicLocal(400, "GBP", 0.5)).toBe(200);
    // 100 ₳ at rate 100 JPY-per-anchor → 10,000 JPY
    expect(writeCorpEconomicLocal(100, "JPY", 100)).toBe(10_000);
  });

  it("round-trips anchor → local → anchor without loss at rate=1", () => {
    const anchor = 1234.56;
    const local = writeCorpEconomicLocal(anchor, "USD", 1);
    expect(readCorpEconomicAnchor(local, "USD", 1)).toBe(anchor);
  });

  it("round-trips anchor → local → anchor at rate=2", () => {
    const anchor = 1000;
    const local = writeCorpEconomicLocal(anchor, "GBP", 2);
    expect(local).toBe(2000);
    expect(readCorpEconomicAnchor(local, "GBP", 2)).toBe(anchor);
  });

  it("refuses named-currency conversion when the rate is invalid", () => {
    expect(() => readCorpEconomicAnchor(100, "USD", 0)).toThrow(/Exchange rate unavailable/);
    expect(() => readCorpEconomicAnchor(100, "USD", -1)).toThrow(/Exchange rate unavailable/);
    expect(() => readCorpEconomicAnchor(100, "USD", Number.NaN)).toThrow(
      /Exchange rate unavailable/
    );
    expect(() => readCorpEconomicAnchor(100, "USD", Number.POSITIVE_INFINITY)).toThrow(
      /Exchange rate unavailable/
    );
    expect(() => writeCorpEconomicLocal(100, "USD", 0)).toThrow(/Exchange rate unavailable/);
    expect(() => writeCorpEconomicLocal(100, "USD", -1)).toThrow(/Exchange rate unavailable/);
    expect(() => writeCorpEconomicLocal(100, "USD", Number.NaN)).toThrow(
      /Exchange rate unavailable/
    );
  });

  it("handles zero values cleanly in both directions", () => {
    expect(readCorpEconomicAnchor(0, "GBP", 2)).toBe(0);
    expect(writeCorpEconomicLocal(0, "GBP", 2)).toBe(0);
  });
});
