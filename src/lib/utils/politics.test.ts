import { describe, it, expect } from "vitest";
import {
  roundLabelBucket,
  getEconomicPositionName,
  getSocialPositionName,
  positionBucketHex,
  interpolateLeanHex,
  positionBucketColorClass,
  getLeanLabel,
  getLeanLabelHex,
  getSocialLeanLabelHex,
  snapToPositionGrid,
  POSITION_GRID,
  buildGeneralColors,
} from "./politics";

describe("buildGeneralColors", () => {
  it("keeps distinct parties on their own pure party color", () => {
    const colors = buildGeneralColors([
      { id: "a", party: "democrat", partyColor: "#2563EB" },
      { id: "b", party: "republican", partyColor: "#DC2626" },
    ]);
    // One candidate per party → pure party hex, and the two differ.
    expect(colors.get("a")).not.toBe(colors.get("b"));
  });

  it("gives same-party candidates distinct shades (#272 USSR single-party general)", () => {
    const colors = buildGeneralColors([
      { id: "a", party: "communist", partyColor: "#B91C1C" },
      { id: "b", party: "communist", partyColor: "#B91C1C" },
      { id: "c", party: "communist", partyColor: "#B91C1C" },
    ]);
    const distinct = new Set([colors.get("a"), colors.get("b"), colors.get("c")]);
    expect(distinct.size).toBe(3);
  });
});

describe("roundLabelBucket", () => {
  it("rounds half away from zero (±0.50 → next whole)", () => {
    expect(roundLabelBucket(0.5)).toBe(1);
    expect(roundLabelBucket(-0.5)).toBe(-1);
    expect(roundLabelBucket(1.5)).toBe(2);
    expect(roundLabelBucket(-1.5)).toBe(-2);
  });
  it("rounds toward zero below the half mark", () => {
    expect(roundLabelBucket(0.49)).toBe(0);
    expect(roundLabelBucket(-0.49)).toBe(-0);
    expect(roundLabelBucket(-0.76)).toBe(-1);
    expect(roundLabelBucket(2.06)).toBe(2);
  });
  it("is identity on integers", () => {
    expect(roundLabelBucket(-2)).toBe(-2);
    expect(roundLabelBucket(0)).toBe(0);
    expect(roundLabelBucket(5)).toBe(5);
  });
});

describe("position namers use the 0.5 bucket ruler", () => {
  it("labels a mild left median as Center-Left, not Centrist or Lean Left", () => {
    expect(getEconomicPositionName(-0.76)).toBe("Center-Left");
    expect(getSocialPositionName(-0.66)).toBe("Center-Liberal");
  });
  it("rounds exact half-steps outward", () => {
    expect(getEconomicPositionName(-1.5)).toBe("Lean Left"); // was Center-Left under Math.round
    expect(getEconomicPositionName(1.5)).toBe("Lean Right");
    expect(getEconomicPositionName(-0.5)).toBe("Center-Left");
  });
  it("keeps integer labels stable", () => {
    expect(getEconomicPositionName(-2)).toBe("Lean Left");
    expect(getEconomicPositionName(-1)).toBe("Center-Left");
    expect(getEconomicPositionName(0)).toBe("Centrist");
    expect(getSocialPositionName(2)).toBe("Lean Trad");
  });
});

describe("positionBucketHex", () => {
  it("maps economic buckets blue(left)→red(right)", () => {
    expect(positionBucketHex(-5, "economic")).toBe("#1d4ed8");
    expect(positionBucketHex(0, "economic")).toBe("#a855f7");
    expect(positionBucketHex(5, "economic")).toBe("#b91c1c");
  });
  it("swaps economic left/right for European convention", () => {
    expect(positionBucketHex(-5, "economic", true)).toBe(positionBucketHex(5, "economic", false));
  });
  it("uses the same bucket as the label (−0.76 → bucket −1 colour)", () => {
    expect(positionBucketHex(-0.76, "economic")).toBe(positionBucketHex(-1, "economic"));
  });
  it("maps social teal(liberal)→amber(trad), no euro swap", () => {
    expect(positionBucketHex(-5, "social")).toBe("#0d9488");
    expect(positionBucketHex(5, "social")).toBe("#b45309");
    expect(positionBucketHex(-5, "social", true)).toBe("#0d9488");
  });
});

describe("interpolateLeanHex", () => {
  it("maps zero to the centre stop regardless of range", () => {
    expect(interpolateLeanHex(0, "economic", 0.8)).toBe("#a855f7");
    expect(interpolateLeanHex(0, "social", 3)).toBe("#a855f7");
  });
  it("hits the ramp ends at ±halfRange", () => {
    expect(interpolateLeanHex(-0.8, "economic", 0.8)).toBe("#1d4ed8");
    expect(interpolateLeanHex(0.8, "economic", 0.8)).toBe("#b91c1c");
    expect(interpolateLeanHex(0.8, "social", 0.8)).toBe("#b45309");
  });
  it("clamps values beyond the range", () => {
    expect(interpolateLeanHex(4, "economic", 0.8)).toBe("#b91c1c");
  });
  it("distinguishes values the 0.5 bucket ruler collapses", () => {
    expect(interpolateLeanHex(0.1, "economic", 0.8)).not.toBe(
      interpolateLeanHex(0.4, "economic", 0.8)
    );
  });
  it("swaps economic sides for the European convention, social untouched", () => {
    expect(interpolateLeanHex(-0.8, "economic", 0.8, true)).toBe("#b91c1c");
    expect(interpolateLeanHex(-0.8, "social", 0.8, true)).toBe("#0d9488");
  });
});

describe("positionBucketColorClass", () => {
  it("center bucket is muted, off-center is coloured by the bucket", () => {
    expect(positionBucketColorClass(0.4, "economic")).toBe(positionBucketColorClass(0, "economic"));
    expect(positionBucketColorClass(-0.76, "economic")).toBe(
      positionBucketColorClass(-1, "economic")
    );
  });
});

describe("snapToPositionGrid", () => {
  it("snaps to the nearest 0.05", () => {
    expect(POSITION_GRID).toBe(0.05);
    expect(snapToPositionGrid(-0.763)).toBeCloseTo(-0.75, 5);
    expect(snapToPositionGrid(1.221)).toBeCloseTo(1.2, 5);
  });
  it("is idempotent on on-grid values", () => {
    expect(snapToPositionGrid(-0.75)).toBeCloseTo(-0.75, 5);
    expect(snapToPositionGrid(-2)).toBeCloseTo(-2, 5);
  });
});

describe("politics region labelers delegate to the ruler", () => {
  it("getLeanLabel uses candidate-scale words + bucket colour", () => {
    expect(getLeanLabel(-0.76).label).toBe("Center-Left");
    expect(getLeanLabel(-0.76).color).toBe(positionBucketColorClass(-0.76, "economic"));
  });
  it("getLeanLabelHex / getSocialLeanLabelHex label+colour agree with the bucket", () => {
    expect(getLeanLabelHex(-0.76).label).toBe("Center-Left");
    expect(getLeanLabelHex(-0.76).color).toBe(positionBucketHex(-0.76, "economic"));
    expect(getSocialLeanLabelHex(-0.66).label).toBe("Center-Liberal");
    expect(getSocialLeanLabelHex(-0.66).color).toBe(positionBucketHex(-0.66, "social"));
  });
});

describe("getOfficeCountry — ambiguous office types", () => {
  it("returns undefined for premier (CN and RU both use it) so callers fall back to the character's country", async () => {
    const { getOfficeCountry } = await import("./politics");
    expect(getOfficeCountry("premier")).toBeUndefined();
    // Unambiguous neighbours keep their mapping.
    expect(getOfficeCountry("npcDelegate")).toBe("CN");
    expect(getOfficeCountry("supremeSovietDeputy")).toBe("RU");
  });
});
