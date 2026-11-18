/**
 * Plain-text summary of a map comparison, for pasting into chat.
 *
 * A link alone gives a chat nothing to show, so the summary carries the few
 * figures that make the pair meaningful: both scores, the category average, and
 * a handful of metric lines. Pure: plain data in, a string out.
 */
import type { MetricCategoryId } from "@/lib/db/types";
import {
  CATEGORY_LABELS,
  formatMetricValue,
  getMetricDefinition,
} from "@/lib/constants/metricDefinitions";
import type { CompareCell, RankedNation } from "@/lib/world/rankings";

/** One side of the summary, already named for the reader. */
export interface CompareSummarySide {
  name: string;
  overall: RankedNation | null;
  categoryRank: RankedNation | null;
}

/** One metric line, its cells in the same order as the sides. */
export interface CompareSummaryRow {
  metric: string;
  cells: readonly [CompareCell | null, CompareCell | null];
}

export interface CompareSummaryInput {
  sides: readonly [CompareSummarySide, CompareSummarySide];
  category: MetricCategoryId | null;
  rows: readonly CompareSummaryRow[];
  /** Appended last so one paste carries both the lines and the way back. */
  url?: string | null;
}

/** Enough to set the scene in a chat, short enough to read without a click. */
const SUMMARY_METRIC_LINES = 3;

export function buildCompareSummary(input: CompareSummaryInput): string {
  const [left, right] = input.sides;
  const lines = [`${left.name} vs ${right.name}`];

  if (left.overall?.score != null || right.overall?.score != null) {
    lines.push(`Overall score: ${rankedLabel(left.overall)} vs ${rankedLabel(right.overall)}`);
  }

  const category = input.category;
  if (category && (left.categoryRank?.score != null || right.categoryRank?.score != null)) {
    lines.push(
      `${CATEGORY_LABELS[category]} average: ${rankedLabel(left.categoryRank)} vs ${rankedLabel(right.categoryRank)}`
    );
  }

  let written = 0;
  for (const row of input.rows) {
    if (written === SUMMARY_METRIC_LINES) break;
    const [a, b] = row.cells;
    // A line with a missing side compares nothing, so leave it to the panel.
    if (a?.value == null || b?.value == null) continue;
    lines.push(
      `${metricLabel(category, row.metric)}: ${metricCell(category, row.metric, a)} vs ${metricCell(category, row.metric, b)}`
    );
    written += 1;
  }

  if (input.url) lines.push(input.url);
  return lines.join("\n");
}

function rankedLabel(ranked: RankedNation | null): string {
  if (!ranked || ranked.score == null) return "n/a";
  return ranked.rank == null ? `${ranked.score}` : `${ranked.score} (#${ranked.rank})`;
}

function metricLabel(category: MetricCategoryId | null, metric: string): string {
  const definition = category ? getMetricDefinition(category, metric) : undefined;
  return definition?.shortName ?? definition?.name ?? metric;
}

function metricCell(category: MetricCategoryId | null, metric: string, cell: CompareCell): string {
  const definition = category ? getMetricDefinition(category, metric) : undefined;
  const value =
    cell.value == null
      ? "n/a"
      : definition
        ? formatMetricValue(cell.value, definition)
        : cell.value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return cell.rank == null ? value : `${value} (#${cell.rank})`;
}
