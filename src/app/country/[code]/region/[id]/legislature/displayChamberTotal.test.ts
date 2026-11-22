import { describe, expect, it } from "vitest";
import { displayChamberTotal } from "./displayChamberTotal";

describe("displayChamberTotal", () => {
  it("raises a too-small configured total to the filled seats", () => {
    const total = displayChamberTotal(6, 87);
    expect(total).toBe(87);
    expect((24 / total) * 100 + (63 / total) * 100).toBeCloseTo(100, 5);
  });
  it("keeps a larger configured total so vacancies still show", () => {
    expect(displayChamberTotal(100, 87)).toBe(100);
  });
  it("handles missing filled count", () => {
    expect(displayChamberTotal(6, undefined)).toBe(6);
  });
});
