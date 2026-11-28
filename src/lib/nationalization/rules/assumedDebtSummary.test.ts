import { expect, it } from "vitest";
import { assumedDebtSummary } from "./assumedDebtSummary";
const bond = {
  principal: 1000,
  couponRate: 5,
  currencyCode: "USD",
  matured: false,
  status: "Performing",
};
it("prices annual coupons per turn and converts every liability into the target currency", () => {
  const result = assumedDebtSummary(
    [bond, { ...bond, currencyCode: "CAD" }],
    "CAD",
    new Map([
      ["USD", 1],
      ["CAD", 2],
    ])
  );
  expect(result.principalLocal).toBe(3000);
  expect(result.couponPerTurnLocal).toBeCloseTo(150 / 48, 10);
});
it("keeps unavailable FX unknown and excludes matured or non-accruing coupons", () => {
  expect(assumedDebtSummary([bond], "CAD", new Map()).couponPerTurnLocal).toBeNull();
  expect(
    assumedDebtSummary(
      [
        { ...bond, status: "Watch" },
        { ...bond, matured: true },
      ],
      "USD",
      new Map()
    )
  ).toEqual({ principalLocal: 1000, couponPerTurnLocal: 0 });
});
