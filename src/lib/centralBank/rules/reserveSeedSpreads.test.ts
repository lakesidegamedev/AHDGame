import { expect, it } from "vitest";
import { reserveSeedSpreadSample } from "./reserveSeedSpreads";
it("normalizes source fees in both trade directions using the executed cross rate", () => {
  const trades = [
    { fromCurrency: "USD", toCurrency: "JPY", spread: 2, rate: 100 },
    { fromCurrency: "JPY", toCurrency: "USD", spread: 200, rate: 0.01 },
  ];
  expect(reserveSeedSpreadSample(trades, "USD")).toEqual({ spread: 4, excluded: 0 });
  expect(reserveSeedSpreadSample(trades, "JPY")).toEqual({ spread: 400, excluded: 0 });
});
it("retains reversals and exposes missing conversion evidence instead of assuming parity", () => {
  expect(
    reserveSeedSpreadSample(
      [
        { fromCurrency: "USD", toCurrency: "JPY", spread: -2, rate: 100 },
        { fromCurrency: "CAD", toCurrency: "JPY", spread: 3, rate: Number.NaN },
      ],
      "JPY"
    )
  ).toEqual({ spread: -200, excluded: 1 });
});
