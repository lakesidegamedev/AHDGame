import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { ruStateMetrics2027 } from "./ruStateMetrics2027";

/** Russian Federation region metric baselines (2027) — derived 1:1 from ruStateMetrics2027. */

export const ruStateBaselines2027: StateMetricBaseline[] =
  ruStateMetrics2027.map(toStateMetricBaseline);
export default ruStateBaselines2027;
