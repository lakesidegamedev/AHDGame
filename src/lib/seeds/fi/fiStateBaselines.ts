import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { fiStateMetrics } from "./fiStateMetrics";

/** Finland region metric baselines — derived 1:1 from fiStateMetrics. */

export const fiStateBaselines: StateMetricBaseline[] = fiStateMetrics.map(toStateMetricBaseline);
