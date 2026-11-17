import { describe, expect, it } from "vitest";
import { consolidatePositions, combineLiabilityBooks } from "./financialHoldings";

describe("successor financial books", () => {
  it("combines share books across legacy issuer and anchor costs without moving cash", () => {
    const combined = consolidatePositions(
      [
        { units: 100, unitCost: 20, superUnits: 50 },
        { units: 300, unitCost: 5, anchorBasis: true },
      ],
      2
    );
    expect(combined.units).toBe(400);
    expect(combined.units * combined.unitCost!).toBe(2500);
    expect(combined.superUnits).toBe(50);
  });
  it("retains an unknown cost instead of manufacturing a zero purchase price", () => {
    expect(consolidatePositions([{ units: 10 }, { units: 20 }], 1)).toEqual({
      units: 30,
      superUnits: 0,
    });
    expect(() => consolidatePositions([{ units: 10 }, { units: 20, unitCost: 5 }], 1)).toThrow(
      /untracked/
    );
  });
  it("conserves large denomination-separated arrears and refuses malformed books", () => {
    expect(combineLiabilityBooks({ CAD: 1e12, USD: 5 }, { CAD: 1e12, USD: 7 })).toEqual({
      CAD: 2e12,
      USD: 12,
    });
    expect(() => combineLiabilityBooks({ CAD: NaN }, {})).toThrow();
    expect(() => consolidatePositions([{ units: Infinity }], 1)).toThrow();
  });
});
