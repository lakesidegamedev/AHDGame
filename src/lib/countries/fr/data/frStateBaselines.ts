import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { frStateMetrics } from "@/lib/seeds/fr/frStateMetrics";

/**
 * France region metric baselines — resting values, derived 1:1 from frStateMetrics
 * so a freshly seeded game has zero decay pressure.
 */

export const frStateBaselines: StateMetricBaseline[] = frStateMetrics.map(toStateMetricBaseline);
