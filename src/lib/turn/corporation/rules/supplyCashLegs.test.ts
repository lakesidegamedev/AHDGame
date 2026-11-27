import { describe, expect, it } from "vitest";
import { supplyCashLegs } from "./supplyCashLegs";
describe("supply cash denomination", () => {
  it.each([27.5, -27.5, 0.0005, 1e12 + 0.5])(
    "conserves a signed anchor transfer %s across mixed quotes",
    (amount) => {
      for (const source of [1, 2, 100, 1.37])
        for (const target of [1, 2, 100, 0.81]) {
          const result = supplyCashLegs(
            amount,
            { currencyCode: "USD", rate: source },
            { currencyCode: "CAD", rate: target }
          );
          const drift = result.supplierLocal / source - result.buyerLocal / target;
          expect(Math.abs(drift)).toBeLessThanOrEqual(
            Number.EPSILON * Math.max(1, Math.abs(amount)) * 4
          );
        }
    }
  );
  it("does not round away either side of a 27.5 anchor transfer", () => {
    expect(
      supplyCashLegs(27.5, { currencyCode: "USD", rate: 1 }, { currencyCode: "CAD", rate: 2 })
    ).toEqual({ supplierLocal: 27.5, buyerLocal: 55 });
  });
  it.each([0, NaN, Infinity])("refuses a missing or invalid named quote %s", (rate) => {
    expect(() =>
      supplyCashLegs(10, { currencyCode: "USD", rate }, { currencyCode: "CAD", rate: 2 })
    ).toThrow();
  });
});
