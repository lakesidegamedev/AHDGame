/**
 * Data contract for constants-driven wiki charts.
 *
 * A chart is a function that computes its series from imported game constants
 * and formulas, so the picture cannot drift from the game. Chart modules must
 * stay pure: no database, wall clock, randomness or server-only imports,
 * because the widget renders them in the browser.
 */

export type WikiChartKind = "line" | "bar" | "step";

export interface WikiChartSeries {
  name: string;
  /** [x, y] pairs. For bar charts with `categories`, x is the category index. */
  points: [number, number][];
  /** Which y axis the series reads from. Defaults to the left axis. */
  axis?: "left" | "right";
}

export interface WikiChartMarker {
  /** Vertical reference line at this x. */
  x?: number;
  /** Horizontal reference line at this y. */
  y?: number;
  label: string;
}

export interface WikiChartSpec {
  title: string;
  kind: WikiChartKind;
  xLabel: string;
  yLabel: string;
  /** Unit suffix for y values in tooltips and the axis label, e.g. "%" or "points". */
  unit?: string;
  series: WikiChartSeries[];
  markers?: WikiChartMarker[];
  caption?: string;
  /** Bar charts: x values are indices into this list and render as category labels. */
  categories?: string[];
  /** Bar charts: stack the series instead of grouping them. */
  stacked?: boolean;
  /** Label and unit for the right axis when any series sets `axis: "right"`. */
  y2Label?: string;
  y2Unit?: string;
}

export type WikiChartBuilder = () => WikiChartSpec;
