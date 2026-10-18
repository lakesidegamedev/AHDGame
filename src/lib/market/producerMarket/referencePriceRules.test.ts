import { describe, expect, it } from "vitest";
import { nextReferencePrice, REFERENCE_MAX_MOVE } from "./referencePriceRules";

const book = (over: Partial<Parameters<typeof nextReferencePrice>[1]> = {}) => ({
  settledUnitPrice: 100,
  unmetUnits: 0,
  unsoldUnits: 0,
  tradedUnits: 100,
  ...over,
});

describe("reference prices answer to the settled market", () => {
  it("holds when the market cleared exactly at the reference", () => {
    expect(nextReferencePrice(100, book())).toBe(100);
  });
  it("rises when funded buyers went short, capped per turn", () => {
    expect(nextReferencePrice(100, book({ unmetUnits: 100 }))).toBeCloseTo(
      100 * (1 + REFERENCE_MAX_MOVE),
      12
    );
  });
  it("falls when sellers were left with stock, capped per turn", () => {
    expect(nextReferencePrice(100, book({ unsoldUnits: 100 }))).toBeCloseTo(
      100 * (1 - REFERENCE_MAX_MOVE),
      12
    );
  });
  it("moves toward the settled price when balanced", () => {
    expect(nextReferencePrice(100, book({ settledUnitPrice: 103 }))).toBeCloseTo(103, 12);
  });
  it("holds with no trades and no imbalance, and rejects a bad prior", () => {
    expect(nextReferencePrice(80, book({ settledUnitPrice: null, tradedUnits: 0 }))).toBe(80);
    expect(() => nextReferencePrice(0, book())).toThrow();
  });
  it("has no memory: a past shortage does not keep a balanced price high", () => {
    let p = 100;
    for (let i = 0; i < 5; i++)
      p = nextReferencePrice(p, book({ settledUnitPrice: p, unmetUnits: 100 }));
    const peak = p;
    for (let i = 0; i < 20; i++) p = nextReferencePrice(p, book({ settledUnitPrice: 100 }));
    expect(peak).toBeGreaterThan(120);
    expect(p).toBeCloseTo(100, 6);
  });
});
