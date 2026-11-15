import { describe, expect, it } from "vitest";
import { fundedTreasuryPaymentLegs } from "./treasuryAccrual";

describe("funded Treasury payment witnesses", () => {
  it("mirrors incoming funded aid without duplicating the signed-position owner", () => {
    const legs = fundedTreasuryPaymentLegs({
      country: "CA",
      currency: "CAD",
      amount: 125,
      rate: 1.25,
      signedPositionOwned: false,
      incoming: true,
    });
    expect(legs.filter((leg) => leg.role === "primary")).toEqual([
      expect.objectContaining({
        account: "government_cash:CA:CAD",
        amount: 125,
        anchorAmount: 100,
      }),
    ]);
    expect(legs.reduce((sum, leg) => sum + leg.anchorAmount, 0)).toBe(0);
  });
  it.each([false, true])(
    "reconciles overlapping cash and fiscal stocks, signed ownership %s",
    (signedPositionOwned) => {
      const legs = fundedTreasuryPaymentLegs({
        country: "CA",
        currency: "CAD",
        amount: 125,
        rate: 1.25,
        signedPositionOwned,
      });
      expect(legs.reduce((sum, leg) => sum + leg.anchorAmount, 0)).toBe(0);
      expect(
        legs.filter((leg) => leg.role === "primary").map((leg) => [leg.account, leg.amount])
      ).toEqual(
        signedPositionOwned
          ? [
              ["government_cash:CA:CAD", -125],
              ["government:CA:CAD", -125],
            ]
          : [["government_cash:CA:CAD", -125]]
      );
    }
  );
  it("rejects invalid funding amounts and valuations", () => {
    for (const [amount, rate] of [
      [-1, 1],
      [NaN, 1],
      [1, 0],
    ])
      expect(() =>
        fundedTreasuryPaymentLegs({
          country: "US",
          currency: "USD",
          amount,
          rate,
          signedPositionOwned: true,
        })
      ).toThrow();
  });
});
