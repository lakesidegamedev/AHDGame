import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { itStateMetrics } from "@/lib/seeds/it/itStateMetrics";

/** Italy region metric baselines — derived 1:1 from itStateMetrics. */

export const itStateBaselines: StateMetricBaseline[] = itStateMetrics.map(toStateMetricBaseline);
