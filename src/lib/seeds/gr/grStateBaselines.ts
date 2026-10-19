import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { grStateMetrics } from "./grStateMetrics";

/** Greece region metric baselines — derived 1:1 from grStateMetrics. */

export const grStateBaselines: StateMetricBaseline[] = grStateMetrics.map(toStateMetricBaseline);
