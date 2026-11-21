import { describe, expect, it } from "vitest";
import { buildCompareSeries } from "./compareSeries";

const series = (pairs: [number, number][]) => pairs.map(([turn, rate]) => ({ turn, rate }));

describe("buildCompareSeries", () => {
  it("returns null when either side has fewer than two points", () => {
    expect(
      buildCompareSeries(
        series([[1, 2]]),
        series([
          [1, 2],
          [2, 3],
        ])
      )
    ).toBeNull();
    expect(
      buildCompareSeries(
        series([]),
        series([
          [1, 2],
          [2, 3],
        ])
      )
    ).toBeNull();
  });

  it("uses one shared y scale across both nations", () => {
    const chart = buildCompareSeries(
      series([
        [1, 1],
        [2, 2],
      ]),
      series([
        [1, 10],
        [2, 11],
      ])
    );
    expect(chart?.min).toBe(1);
    expect(chart?.max).toBe(11);
  });

  it("spans the full width from the first to the last turn", () => {
    const chart = buildCompareSeries(
      series([
        [10, 1],
        [20, 2],
      ]),
      series([
        [10, 3],
        [20, 4],
      ])
    );
    const xs = chart!.a.split(" ").map((pair) => Number(pair.split(",")[0]));
    expect(xs[0]).toBeCloseTo(0, 5);
    expect(xs[xs.length - 1]).toBeCloseTo(100, 5);
  });

  it("places both nations on the turn axis even when sample counts differ", () => {
    const chart = buildCompareSeries(
      series([
        [1, 1],
        [2, 2],
        [3, 3],
      ]),
      series([
        [1, 2],
        [3, 4],
      ])
    );
    const ax = chart!.a.split(" ").map((pair) => Number(pair.split(",")[0]));
    const bx = chart!.b.split(" ").map((pair) => Number(pair.split(",")[0]));
    expect(ax[0]).toBeCloseTo(0, 5);
    expect(bx[0]).toBeCloseTo(0, 5);
    expect(ax[2]).toBeCloseTo(100, 5);
    expect(bx[1]).toBeCloseTo(100, 5);
  });

  it("reads the latest value by turn, not by array order", () => {
    const chart = buildCompareSeries(
      series([
        [3, 30],
        [1, 10],
        [2, 20],
      ]),
      series([
        [1, 1],
        [2, 2],
      ])
    );
    expect(chart?.latestA).toBe(30);
    expect(chart?.latestB).toBe(2);
  });

  it("draws a flat series without dividing by zero", () => {
    const chart = buildCompareSeries(
      series([
        [1, 5],
        [2, 5],
      ]),
      series([
        [1, 5],
        [2, 5],
      ])
    );
    expect(chart).not.toBeNull();
    expect(chart!.min).toBeLessThan(5);
    expect(chart!.max).toBeGreaterThan(5);
    for (const pair of [...chart!.a.split(" "), ...chart!.b.split(" ")]) {
      expect(Number(pair.split(",")[1])).toBeGreaterThanOrEqual(0);
      expect(Number(pair.split(",")[1])).toBeLessThanOrEqual(30);
    }
  });

  it("drops points with a non-finite turn or rate", () => {
    const chart = buildCompareSeries(
      series([
        [1, 1],
        [Number.NaN, 2],
        [2, Number.POSITIVE_INFINITY],
        [3, 3],
      ]),
      series([
        [1, 2],
        [3, 4],
      ])
    );
    expect(chart?.latestA).toBe(3);
  });

  it("counts the distinct turns both series cover", () => {
    const chart = buildCompareSeries(
      series([
        [1, 1],
        [2, 2],
      ]),
      series([
        [2, 3],
        [3, 4],
      ])
    );
    expect(chart?.points).toBe(3);
  });

  it("keeps every drawn point inside the view box", () => {
    const chart = buildCompareSeries(
      series([
        [1, -3],
        [2, 40],
      ]),
      series([
        [1, 5],
        [2, 6],
      ])
    );
    for (const pair of chart!.a.split(" ")) {
      const [, y] = pair.split(",").map(Number);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(30);
    }
  });
});
