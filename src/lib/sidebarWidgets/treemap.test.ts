import { describe, expect, it } from "vitest";
import { treemapLayout } from "./treemap";

const area = (r: { w: number; h: number }) => r.w * r.h;

describe("treemapLayout", () => {
  it("gives each tile an area in proportion to its weight and fills the box", () => {
    const rects = treemapLayout([50, 25, 15, 10], 2);
    expect(rects).toHaveLength(4);
    expect(rects.reduce((sum, r) => sum + area(r), 0)).toBeCloseTo(1, 9);
    expect(area(rects[0]!)).toBeCloseTo(0.5, 9);
    expect(area(rects[3]!)).toBeCloseTo(0.1, 9);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("splits a wide box side by side first", () => {
    const [left, right] = treemapLayout([1, 1], 3);
    expect(left).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(right).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
  });

  it("copes with no tiles, one tile and zero weights", () => {
    expect(treemapLayout([])).toEqual([]);
    expect(treemapLayout([7])).toEqual([{ x: 0, y: 0, w: 1, h: 1 }]);
    expect(treemapLayout([0, 0]).every((r) => area(r) > 0)).toBe(true);
  });
});
