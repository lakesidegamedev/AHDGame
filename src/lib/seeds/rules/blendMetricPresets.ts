export type MetricBundle = Record<string, Record<string, number>>;

/**
 * Linear blend of two authored era bundles for a year between them. A metric
 * authored on one side only keeps that side's value, so a path never drops out.
 */
export function blendMetricPresets(
  earlier: MetricBundle,
  later: MetricBundle,
  earlierYear: number,
  laterYear: number,
  year: number
): MetricBundle {
  const t = (year - earlierYear) / (laterYear - earlierYear);
  const out: MetricBundle = {};
  for (const region of new Set([...Object.keys(earlier), ...Object.keys(later)])) {
    const a = earlier[region] ?? {};
    const b = later[region] ?? {};
    const blended: Record<string, number> = {};
    for (const path of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const from = a[path];
      const to = b[path];
      blended[path] =
        from === undefined
          ? to
          : to === undefined
            ? from
            : Math.round((from + (to - from) * t) * 100) / 100;
    }
    out[region] = blended;
  }
  return out;
}
