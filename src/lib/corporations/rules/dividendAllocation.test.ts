import { describe, expect, it } from "vitest";
import { planDividendAllocation } from "./dividendAllocation";
import { shareStructureEligibility } from "./shareStructure";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";

for (const [country, currency] of Object.entries(COUNTRY_CURRENCY_MAP)) {
  describe(`${country}/${currency} dividend allocation`, () => {
    it.each([
      { unplacedIpoShares: 0, expectedHolder: 80, expectedFloat: 20 },
      { unplacedIpoShares: 100_000, expectedHolder: (100 * 8) / 9, expectedFloat: 100 / 9 },
      { unplacedIpoShares: 200_000, expectedHolder: 100, expectedFloat: 0 },
      { unplacedIpoShares: 2_000_000, expectedHolder: 100, expectedFloat: 0 },
      { unplacedIpoShares: 20_000_000, expectedHolder: 100, expectedFloat: 0 },
    ])(
      "bounds holder and float payments with $unplacedIpoShares unplaced shares",
      ({ unplacedIpoShares, expectedHolder, expectedFloat }) => {
        const result = planDividendAllocation({
          pool: 100,
          totalShares: 1_000_000,
          publicFloat: 200_000,
          unplacedIpoShares,
          holderShares: [800_000],
        });
        expect(result.holders[0]).toBeCloseTo(expectedHolder, 10);
        expect(result.publicFloat).toBeCloseTo(expectedFloat, 10);
        expect(result.holders.reduce((a, b) => a + b, result.publicFloat)).toBeLessThanOrEqual(100);
      }
    );
  });
}

it("bounds multiple holder kinds and duplicate register rows by one pool", () => {
  const result = planDividendAllocation({
    pool: 125,
    totalShares: 100,
    publicFloat: 50,
    unplacedIpoShares: 200,
    holderShares: [60, 50, 30, 40, 20, 60],
  });
  expect(result.holders.reduce((a, b) => a + b, result.publicFloat)).toBeCloseTo(125, 12);
  expect(result.publicFloat).toBe(0);
});
it.each([NaN, Infinity, -1])(
  "rejects invalid holder quantities %s before crediting money",
  (shares) => {
    expect(() =>
      planDividendAllocation({
        pool: 100,
        totalShares: 100,
        publicFloat: 0,
        unplacedIpoShares: 0,
        holderShares: [shares],
      })
    ).toThrow();
  }
);
it("allows restructuring after an issuance has finished", () => {
  expect(
    shareStructureEligibility({ totalShares: 100, pendingShareIssuance: { remainingShares: 0 } })
  ).toEqual({ ok: true });
});
it.each(["ipo", "vote"])("blocks uncompleted %s share units", () => {
  expect(
    shareStructureEligibility({ totalShares: 100, pendingShareIssuance: { remainingShares: 1 } }).ok
  ).toBe(false);
});
