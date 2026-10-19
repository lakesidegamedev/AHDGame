import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { esStateMetrics } from "./esStateMetrics";

/** Spain region metric baselines — derived 1:1 from esStateMetrics. */

export const esStateBaselines: StateMetricBaseline[] = esStateMetrics.map(toStateMetricBaseline);
