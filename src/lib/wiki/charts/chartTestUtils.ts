import { expect } from "vitest";
import type { WikiChartSpec } from "./types";

/** Shape checks every registered chart must pass. */
export function expectValidChart(id: string, spec: WikiChartSpec): void {
  expect(spec.title.length, `${id} title`).toBeGreaterThan(0);
  expect(spec.xLabel.length, `${id} xLabel`).toBeGreaterThan(0);
  expect(spec.yLabel.length, `${id} yLabel`).toBeGreaterThan(0);
  expect(spec.series.length, `${id} series`).toBeGreaterThan(0);
  for (const s of spec.series) {
    expect(s.points.length, `${id}/${s.name} points`).toBeGreaterThanOrEqual(2);
    for (const [x, y] of s.points) {
      expect(Number.isFinite(x), `${id}/${s.name} x`).toBe(true);
      expect(Number.isFinite(y), `${id}/${s.name} y`).toBe(true);
    }
  }
  for (const m of spec.markers ?? []) {
    expect(m.x !== undefined || m.y !== undefined, `${id} marker ${m.label}`).toBe(true);
    if (m.x !== undefined) expect(Number.isFinite(m.x)).toBe(true);
    if (m.y !== undefined) expect(Number.isFinite(m.y)).toBe(true);
  }
  if (spec.categories) {
    for (const s of spec.series) {
      for (const [x] of s.points) expect(spec.categories[x], `${id} category ${x}`).toBeDefined();
    }
  }
  expect(/[\u2013\u2014]/.test(JSON.stringify(spec)), `${id} has no dashes`).toBe(false);
}
