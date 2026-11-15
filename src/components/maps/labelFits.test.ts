import { describe, expect, it } from "vitest";
import { labelFits } from "./RegionalGeoMap";

describe("labelFits", () => {
  it("keeps a short label on a roomy region", () => {
    expect(labelFits(4, 80, 40, 1)).toBe(true);
  });

  it("hides a long label on a narrow region", () => {
    expect(labelFits(12, 30, 40, 1)).toBe(false);
  });

  it("hides labels on regions that are too short", () => {
    expect(labelFits(2, 80, 6, 1)).toBe(false);
  });

  it("shows the label again once zoomed in", () => {
    expect(labelFits(12, 30, 40, 1)).toBe(false);
    expect(labelFits(12, 30, 40, 3)).toBe(true);
  });
});
