import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { brStateMetrics } from "@/lib/seeds/br/brStateMetrics";

/**
 * Brazil macro-region metric baselines — the "resting" value each metric
 * decays toward when no policy intervention is active.
 *
 * Derived from brStateMetrics so a freshly seeded game has zero decay
 * pressure (baselines match current values 1:1). Any metric that changes
 * in brStateMetrics automatically updates the baseline here.
 */

export const brStateBaselines: StateMetricBaseline[] = brStateMetrics.map(toStateMetricBaseline);
