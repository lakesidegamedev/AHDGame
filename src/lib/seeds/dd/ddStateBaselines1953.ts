import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import { toStateMetricBaseline } from "@/lib/seeds/shared/stateMetricBaseline";
import { ddStateMetrics1953 } from "./ddStateMetrics1953";

/**
 * East Germany region metric baselines — 1953, derived 1:1 from ddStateMetrics1953.
 *
 * The bundle is already authored for 1953 (the decay targets ARE the era-correct
 * values), so — unlike the 1979 path — no applyEra1953BaselineAdjustments transform
 * is applied on top. Keyed to the eastern-Laender codes (BEO/MV/BB/ST/SN/TH).
 */

export const ddStateBaselines1953: StateMetricBaseline[] =
  ddStateMetrics1953.map(toStateMetricBaseline);
