import type { MetricCategoryId } from "@/lib/db/types";

/**
 * What the globe is coloured by. Lives here rather than beside the panel so
 * pure URL and highlight rules can depend on the shape without importing a
 * React component.
 */
export type MetricFilter =
  | { type: "none" }
  | { type: "overall" }
  | { type: "category"; categoryId: MetricCategoryId }
  | { type: "metric"; categoryId: MetricCategoryId; metricId: string }
  | { type: "party" }
  | { type: "corps" }
  /** Treaty Blocs, including player-founded poles. See `worldBlocs.ts`. */
  | { type: "blocs" };
