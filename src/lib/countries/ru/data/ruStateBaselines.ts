import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { ruStateMetrics } from "@/lib/seeds/ru/ruStateMetrics";

/**
 * USSR region metric baselines — the resting value each metric decays toward.
 * Derived 1:1 from ruStateMetrics so a freshly seeded game has zero decay
 * pressure.
 */

export const ruStateBaselines: StateMetricBaseline[] = ruStateMetrics.map(toStateMetricBaseline);
