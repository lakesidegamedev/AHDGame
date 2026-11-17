/**
 * Encode the globe's view for a shared link.
 *
 * A comparison is read through a filter: the same two nations look like a
 * bloc story under blocs and a trend story under a metric. Carrying only the
 * country ids reopened the receiver on whatever filter their page defaulted
 * to, so the link no longer showed what the sender saw.
 *
 * The value is a compact token rather than JSON so links stay readable. Unknown
 * categories and metrics parse to null and the caller keeps its own default;
 * links written before filters were encoded have no `filter` value at all and
 * land on the default view, which is the old behaviour.
 */

import { CATEGORY_LABELS, getMetricDefinition } from "@/lib/constants/metricDefinitions";
import type { MetricCategoryId } from "@/lib/db/types";
import type { MetricFilter } from "./metricFilter";

export const DEFAULT_COMPARE_CATEGORY: MetricCategoryId = "economic";

export function isMetricCategory(value: string): value is MetricCategoryId {
  return Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, value);
}

/** `none` is a real view, so it is written rather than omitted. */
export function metricFilterParam(filter: MetricFilter): string {
  switch (filter.type) {
    case "none":
      return "none";
    case "overall":
      return "overall";
    case "party":
      return "party";
    case "corps":
      return "corps";
    case "blocs":
      return "blocs";
    case "category":
      return `category:${filter.categoryId}`;
    case "metric":
      return `metric:${filter.categoryId}:${filter.metricId}`;
  }
}

export function parseMetricFilterParam(value: string | null | undefined): MetricFilter | null {
  if (!value) return null;
  if (value === "none") return { type: "none" };
  if (value === "overall") return { type: "overall" };
  if (value === "party") return { type: "party" };
  if (value === "corps") return { type: "corps" };
  if (value === "blocs") return { type: "blocs" };

  if (value.startsWith("category:")) {
    const categoryId = value.slice("category:".length);
    return isMetricCategory(categoryId) ? { type: "category", categoryId } : null;
  }

  if (value.startsWith("metric:")) {
    const rest = value.slice("metric:".length);
    const split = rest.indexOf(":");
    if (split <= 0) return null;
    const categoryId = rest.slice(0, split);
    const metricId = rest.slice(split + 1);
    if (!isMetricCategory(categoryId) || !metricId) return null;
    if (!getMetricDefinition(categoryId, metricId)) return null;
    return { type: "metric", categoryId, metricId };
  }

  return null;
}

/** The panel's category is written only when it differs from the default. */
export function compareCategoryParam(category: MetricCategoryId): string | null {
  return category === DEFAULT_COMPARE_CATEGORY ? null : category;
}

export function parseCompareCategoryParam(
  value: string | null | undefined
): MetricCategoryId | null {
  if (!value || !isMetricCategory(value)) return null;
  return value;
}
