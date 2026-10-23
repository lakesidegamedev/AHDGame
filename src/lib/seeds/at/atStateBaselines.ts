import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { atStateMetrics } from "./atStateMetrics";

/** Austria region metric baselines — derived 1:1 from atStateMetrics. */

export const atStateBaselines: StateMetricBaseline[] = atStateMetrics.map(toStateMetricBaseline);
