import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { huStateMetrics2027 } from "./huStateMetrics2027";

/** Hungary region metric baselines (2027) — derived 1:1 from huStateMetrics2027. */

export const huStateBaselines2027: StateMetricBaseline[] =
  huStateMetrics2027.map(toStateMetricBaseline);
export default huStateBaselines2027;
