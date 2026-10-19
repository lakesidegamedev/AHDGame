import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { ngStateMetrics } from "./ngStateMetrics";

/**
 * Nigeria geopolitical-zone metric baselines — the "resting" value each metric
 * decays toward when no policy intervention is active.
 *
 * Derived from ngStateMetrics so a freshly seeded game has zero decay
 * pressure (baselines match current values 1:1). Any metric that changes
 * in ngStateMetrics automatically updates the baseline here.
 */

export const ngStateBaselines: StateMetricBaseline[] = ngStateMetrics.map(toStateMetricBaseline);
