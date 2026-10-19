import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { ddStateMetrics } from "./ddStateMetrics";

/** East Germany region metric baselines — derived 1:1 from ddStateMetrics. */

export const ddStateBaselines: StateMetricBaseline[] = ddStateMetrics.map(toStateMetricBaseline);
