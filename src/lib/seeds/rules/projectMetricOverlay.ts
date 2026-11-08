import { getMetricDefinition } from "@/lib/constants/metricDefinitions";

/**
 * Projects a region metric overlay from its calibrated base year to a later
 * preset. National changes apply to every region, then per-region changes on
 * top, so the base year's regional pattern carries over where nothing moved
 * it. Results stay inside each metric's defined bounds.
 */

type CategoryId = Parameters<typeof getMetricDefinition>[0];

export type RegionMetricOverlay = Record<string, Record<string, number>>;

export interface MetricOverlayChange {
  /** Value set outright in every region. */
  set?: Record<string, number>;
  /** Added to every region's value. */
  shift?: Record<string, number>;
  /** Multiplies every region's value, before shifts. */
  scale?: Record<string, number>;
  /** Added to one region's value, after the national change. */
  regionShift?: Record<string, Record<string, number>>;
}

function bounded(path: string, value: number): number {
  const [category, id] = path.split(".");
  const definition = getMetricDefinition(category as CategoryId, id);
  const min = definition?.minValue ?? 0;
  const max = definition?.maxValue ?? 100;
  return Number(Math.min(max, Math.max(min, value)).toFixed(1));
}

export function projectMetricOverlay(
  base: RegionMetricOverlay,
  change: MetricOverlayChange
): RegionMetricOverlay {
  const paths = new Set(Object.values(base).flatMap((metrics) => Object.keys(metrics)));
  const named = [
    ...Object.keys(change.set ?? {}),
    ...Object.keys(change.shift ?? {}),
    ...Object.keys(change.scale ?? {}),
    ...Object.values(change.regionShift ?? {}).flatMap((metrics) => Object.keys(metrics)),
  ];
  for (const path of named) {
    if (!paths.has(path)) throw new Error(`Metric overlay change names unknown path ${path}`);
  }
  for (const region of Object.keys(change.regionShift ?? {})) {
    if (!base[region]) throw new Error(`Metric overlay change names unknown region ${region}`);
  }
  return Object.fromEntries(
    Object.entries(base).map(([region, metrics]) => [
      region,
      Object.fromEntries(
        Object.entries(metrics).map(([path, value]) => {
          let next = change.set?.[path] ?? value * (change.scale?.[path] ?? 1);
          next += (change.shift?.[path] ?? 0) + (change.regionShift?.[region]?.[path] ?? 0);
          return [path, bounded(path, next)];
        })
      ),
    ])
  );
}
