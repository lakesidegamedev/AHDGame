import { describe, expect, it } from "vitest";
import {
  dividendShareBasis,
  dividendShareFraction,
  payFromDividendPool,
  scalePendingIssuanceForStructureChange,
  unplacedIpoShares,
} from "./dividendShares";

const ipo = (remainingShares: number) => ({
  remainingShares,
  requestedShares: 2_500_000,
  source: "ipo",
  issuedUpfront: true,
  createdAtTurn: 1,
  initialPriceLocal: 2_000,
});

// The live shape: remainder above both float and total after a consolidation.
const corrupt = {
  totalShares: 1_000_000,
  publicFloat: 200_000,
  pendingShareIssuance: ipo(2_013_914),
};

describe("unplacedIpoShares", () => {
  it("clamps a remainder above the float to the float", () => {
    expect(unplacedIpoShares(corrupt)).toBe(200_000);
  });

  it("ignores pending issues that are not upfront IPOs", () => {
    expect(
      unplacedIpoShares({
        ...corrupt,
        pendingShareIssuance: { ...ipo(50_000), issuedUpfront: false },
      })
    ).toBe(0);
    expect(
      unplacedIpoShares({ ...corrupt, pendingShareIssuance: { ...ipo(50_000), source: "vote" } })
    ).toBe(0);
  });

  it("returns the stored remainder when it is consistent", () => {
    expect(unplacedIpoShares({ ...corrupt, pendingShareIssuance: ipo(150_000) })).toBe(150_000);
  });
});

describe("dividendShareBasis", () => {
  it("never drops below the shares actually held", () => {
    const basis = dividendShareBasis(corrupt, [800_000]);
    expect(basis.denominator).toBe(800_000);
    expect(basis.placedFloatShares).toBe(0);
  });

  it("counts placed float alongside holders", () => {
    const basis = dividendShareBasis({ ...corrupt, pendingShareIssuance: ipo(150_000) }, [800_000]);
    expect(basis.denominator).toBe(850_000);
    expect(basis.placedFloatShares).toBe(50_000);
  });

  it("covers holders even when the register exceeds totalShares", () => {
    const basis = dividendShareBasis({ totalShares: 100, publicFloat: 0 }, [80, 80]);
    expect(basis.denominator).toBe(160);
  });

  it("uses the fallback total when totalShares is missing", () => {
    expect(dividendShareBasis({}, [1_000], 10_000_000).denominator).toBe(10_000_000);
  });
});

describe("dividend pool payments", () => {
  it("caps a holder's fraction at the whole pool", () => {
    expect(dividendShareFraction(800_000, 1)).toBe(1);
    expect(dividendShareFraction(5, 0)).toBe(0);
  });

  it("pays the live shape at most the pool", () => {
    const pool = 1_000;
    const { denominator } = dividendShareBasis(corrupt, [800_000]);
    const paid = payFromDividendPool(pool, 0, 800_000, denominator);
    expect(paid).toBe(pool);
  });

  it("stops paying once the pool is spent, whatever the inputs", () => {
    const pool = 1_000;
    let paid = 0;
    for (const shares of [80, 80, 80]) {
      paid += payFromDividendPool(pool, paid, shares, 100);
    }
    expect(paid).toBeCloseTo(pool, 9);
  });
});

describe("scalePendingIssuanceForStructureChange", () => {
  it("scales an upfront IPO through a 12.5:1 consolidation and keeps it in the float", () => {
    const scaled = scalePendingIssuanceForStructureChange(
      ipo(2_013_914),
      12_500_000,
      1_000_000,
      200_000
    );
    expect(scaled.remainingShares).toBe(161_113);
    expect(scaled.requestedShares).toBe(200_000);
    expect(scaled.initialPriceLocal).toBe(25_000);
    expect(scaled.source).toBe("ipo");
  });

  it("clamps an upfront IPO remainder to the new float", () => {
    const scaled = scalePendingIssuanceForStructureChange(
      ipo(2_500_000),
      12_500_000,
      1_000_000,
      150_000
    );
    expect(scaled.remainingShares).toBe(150_000);
  });

  it("scales an authorized issue forward through a split without a float clamp", () => {
    const scaled = scalePendingIssuanceForStructureChange(
      { ...ipo(100_000), source: "vote", issuedUpfront: false, requestedShares: 100_000 },
      1_000_000,
      2_000_000,
      0
    );
    expect(scaled.remainingShares).toBe(200_000);
    expect(scaled.requestedShares).toBe(200_000);
    expect(scaled.initialPriceLocal).toBe(1_000);
  });
});
