import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { roStateMetrics2027 } from "./roStateMetrics2027";

/** Romania region metric baselines (2027) — derived 1:1 from roStateMetrics2027. */

export const roStateBaselines2027: StateMetricBaseline[] =
  roStateMetrics2027.map(toStateMetricBaseline);
export default roStateBaselines2027;
