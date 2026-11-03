import { describe, expect, it } from "vitest";
import { fundedClearingReading } from "./fundedClearingReading";

describe("fundedClearingReading", () => {
  it("reads an unsold run of unstorable output as nothing sold, not a full clear", () => {
    const reading = fundedClearingReading(
      {
        turn: 575,
        offeredUnits: 10_639,
        soldUnits: 0,
        revenue: 0,
        products: [
          {
            offeredUnits: 10_639,
            soldUnits: 0,
            internalDeliveredUnits: 106,
            revenue: 0,
            askingUnitPrice: 40,
          },
        ],
      },
      576
    );
    expect(reading).not.toBeNull();
    expect(reading!.soldFraction).toBe(0);
    expect(reading!.ownSiteFraction).toBeCloseTo(106 / 10_639, 9);
    expect(reading!.clearingFactor).toBe(0);
  });

  it("realizes revenue against the outside offer at the asking price", () => {
    const reading = fundedClearingReading(
      {
        turn: 9,
        offeredUnits: 100,
        soldUnits: 60,
        revenue: 180,
        products: [
          {
            offeredUnits: 100,
            soldUnits: 60,
            internalDeliveredUnits: 40,
            revenue: 180,
            askingUnitPrice: 3,
          },
        ],
      },
      10
    );
    expect(reading).toEqual({ soldFraction: 0.6, ownSiteFraction: 0.4, clearingFactor: 1 });
  });

  it("gives no reading for a stale receipt or an empty offer", () => {
    expect(fundedClearingReading({ turn: 5, offeredUnits: 10, soldUnits: 10 }, 10)).toBeNull();
    expect(fundedClearingReading({ turn: 9, offeredUnits: 0, soldUnits: 0 }, 10)).toBeNull();
    expect(fundedClearingReading(null, 10)).toBeNull();
  });
});
