import { describe, expect, it } from "vitest";
import { povertyAnchorOffset } from "./povertyAnchors";

describe("poverty anchor offsets", () => {
  it("lifts the US and Canada to their OECD half-median rates and leaves others alone", () => {
    expect(8.4 + povertyAnchorOffset("US")).toBeCloseTo(18.1, 1);
    expect(8.4 + povertyAnchorOffset("CA")).toBeCloseTo(12.2, 1);
    expect(povertyAnchorOffset("UK")).toBe(0);
    expect(povertyAnchorOffset(undefined)).toBe(0);
  });
});
