import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { ieStateMetrics } from "@/lib/seeds/ie/ieStateMetrics";

/**
 * Ireland planning region metric baselines — the "resting" value each metric
 * decays toward when no policy intervention is active.
 *
 * Derived from ieStateMetrics so a freshly seeded game has zero decay
 * pressure (baselines match current values 1:1). Any metric that changes
 * in ieStateMetrics automatically updates the baseline here.
 */

export const ieStateBaselines: StateMetricBaseline[] = ieStateMetrics.map(toStateMetricBaseline);
