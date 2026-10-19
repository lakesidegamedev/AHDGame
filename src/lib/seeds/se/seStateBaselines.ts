import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { seStateMetrics } from "./seStateMetrics";

/** Sweden region metric baselines — derived 1:1 from seStateMetrics. */

export const seStateBaselines: StateMetricBaseline[] = seStateMetrics.map(toStateMetricBaseline);
