import { expect, it } from "vitest";
import { aggregateByCountry } from "./commodityAggregation";
it("uses the stored national quote instead of reconstructing a second price", () => {
  const result = aggregateByCountry(
    { ON: 100 },
    { ON: 100 },
    { ON: 99 },
    new Map([["ON", "CA"]]),
    100,
    100,
    { CA: 100 },
    { CA: 100 },
    { CA: 132 }
  );
  expect(result.CA.avgPrice).toBe(132);
});
it("leaves a missing national quote unavailable", () => {
  expect(
    aggregateByCountry({}, {}, { ON: 99 }, new Map([["ON", "CA"]]), 100, 100).CA.avgPrice
  ).toBeNull();
});
