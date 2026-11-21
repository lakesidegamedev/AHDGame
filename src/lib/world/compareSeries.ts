/**
 * Overlay two nations' recent history on one shared scale.
 *
 * Each series arrives as `{ turn, rate }` points from a country's economy
 * payload. The two nations may carry different sample counts or different turn
 * ranges, so the path is positioned by turn across the combined range and both
 * lines share one y-scale. A shared scale is the whole point: two sparklines on
 * their own autoscales can look identical while one nation's inflation is four
 * points higher than the other's.
 *
 * Pure: numbers in, SVG polyline strings out. No React, database or clock.
 */

export interface CompareSeriesPoint {
  turn: number;
  rate: number;
}

export interface CompareSeries {
  /** Polyline points for the first nation, in a 0..100 by 0..30 viewBox. */
  a: string;
  /** Polyline points for the second nation. */
  b: string;
  /** Shared y-scale bounds, for the caption. */
  min: number;
  max: number;
  /** Last recorded value of each nation, by turn. Null when that side has none. */
  latestA: number | null;
  latestB: number | null;
  /** Distinct turns covered by both series. */
  points: number;
}

const VIEW_W = 100;
const VIEW_H = 30;
const PAD_Y = 2;

function usable(points: readonly CompareSeriesPoint[]): CompareSeriesPoint[] {
  return points
    .filter((point) => Number.isFinite(point.turn) && Number.isFinite(point.rate))
    .slice()
    .sort((left, right) => left.turn - right.turn);
}

function toPath(
  points: CompareSeriesPoint[],
  minTurn: number,
  turnSpan: number,
  min: number,
  span: number
): string {
  return points
    .map((point, index) => {
      const x =
        turnSpan > 0
          ? ((point.turn - minTurn) / turnSpan) * VIEW_W
          : (index / Math.max(1, points.length - 1)) * VIEW_W;
      const y = VIEW_H - PAD_Y - ((point.rate - min) / span) * (VIEW_H - PAD_Y * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * Build both paths, or null when either side has fewer than two points, which is
 * not a path at all. A flat series is padded so it can still be drawn.
 */
export function buildCompareSeries(
  aPoints: readonly CompareSeriesPoint[],
  bPoints: readonly CompareSeriesPoint[]
): CompareSeries | null {
  const a = usable(aPoints);
  const b = usable(bPoints);
  if (a.length < 2 || b.length < 2) return null;

  const all = [...a, ...b];
  const turns = all.map((point) => point.turn);
  const minTurn = Math.min(...turns);
  const maxTurn = Math.max(...turns);
  const turnSpan = maxTurn - minTurn;

  const rates = all.map((point) => point.rate);
  let min = Math.min(...rates);
  let max = Math.max(...rates);
  if (!(max > min)) {
    // A flat line still needs a scale, or the division below is by zero.
    min -= 1;
    max += 1;
  }
  const span = max - min;

  return {
    a: toPath(a, minTurn, turnSpan, min, span),
    b: toPath(b, minTurn, turnSpan, min, span),
    min,
    max,
    latestA: a[a.length - 1]?.rate ?? null,
    latestB: b[b.length - 1]?.rate ?? null,
    points: new Set(turns).size,
  };
}
