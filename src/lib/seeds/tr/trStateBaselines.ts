import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { trStateMetrics } from "./trStateMetrics";

/** Turkey region metric baselines — derived 1:1 from trStateMetrics. */

export const trStateBaselines: StateMetricBaseline[] = trStateMetrics.map(toStateMetricBaseline);
