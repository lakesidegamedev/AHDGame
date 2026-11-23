import {
  deliveredMetricEffects,
  metricLawApplies,
  type MetricLawProgram,
  type MetricLawSettlement,
} from "./lawDelivery";

export const MAX_POLICY_PRESSURE = 1.2;

export interface MetricPolicyPressure {
  grossLaw: number;
  openingLaw: number;
  netLaw: number;
  cabinet: number;
  combined: number;
}

export function metricPolicyPressure(input: {
  board: { countryId: string; scope: "national" | "regional"; regionId?: string };
  programs: readonly MetricLawProgram[];
  opening: readonly MetricLawProgram[];
  settlements: ReadonlyMap<string, MetricLawSettlement>;
  turn: number;
  temporary: readonly { target: string; favorableNormalizedPoints: number }[];
}): Record<string, MetricPolicyPressure> {
  const gross = deliveredMetricEffects(
    input.programs.filter((p) => metricLawApplies(p, input.board)),
    input.settlements,
    input.turn
  );
  const opening: Record<string, number> = {};
  for (const program of input.opening.filter((p) => metricLawApplies(p, input.board)))
    for (const effect of program.primaryMetricEffects)
      opening[effect.metricId] = (opening[effect.metricId] ?? 0) + effect.favorableNormalizedPoints;
  const cabinet: Record<string, number> = {};
  for (const effect of input.temporary)
    if (/^M\d{2}$/.test(effect.target)) {
      const id = effect.target.slice(1);
      cabinet[id] = (cabinet[id] ?? 0) + effect.favorableNormalizedPoints;
    }
  return Object.fromEntries(
    [...new Set([...Object.keys(gross), ...Object.keys(opening), ...Object.keys(cabinet)])].map(
      (id) => {
        const netLaw = (gross[id] ?? 0) - (opening[id] ?? 0);
        return [
          id,
          {
            grossLaw: gross[id] ?? 0,
            openingLaw: opening[id] ?? 0,
            netLaw,
            cabinet: cabinet[id] ?? 0,
            combined: Math.max(
              -MAX_POLICY_PRESSURE,
              Math.min(MAX_POLICY_PRESSURE, Number((netLaw + (cabinet[id] ?? 0)).toFixed(4)))
            ),
          },
        ];
      }
    )
  );
}
