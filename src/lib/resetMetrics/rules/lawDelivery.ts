/** Funded law effects require current, post-enactment settlement evidence. */
export interface MetricLawProgram {
  _id: string;
  country: string;
  scope: "national" | "regional";
  regionId?: string;
  familyId: string;
  fundingAccountId: string;
  effectiveTurn: number;
  choice?: string;
  settlementLawId?: string;
  annualAgencyAllocation?: number;
  primaryMetricEffects: readonly { metricId: string; favorableNormalizedPoints: number }[];
}

export interface MetricLawSettlement {
  implementationFactor: number;
  lastSettledTurn: number;
  validThroughTurn?: number;
  legislationTypeId?: string;
}

export function deliveredLawFactor(
  program: MetricLawProgram,
  paid: MetricLawSettlement | undefined,
  turn: number
): number {
  if (
    !Number.isSafeInteger(turn) ||
    turn < 1 ||
    !Number.isSafeInteger(program.effectiveTurn) ||
    program.effectiveTurn < 1 ||
    program.effectiveTurn > turn ||
    program.choice === "leave_to_states" ||
    !paid ||
    !Number.isSafeInteger(paid.lastSettledTurn) ||
    !Number.isSafeInteger(paid.validThroughTurn ?? paid.lastSettledTurn) ||
    paid.lastSettledTurn < program.effectiveTurn ||
    paid.lastSettledTurn > turn ||
    (paid.validThroughTurn ?? paid.lastSettledTurn) < turn ||
    !Number.isFinite(paid.implementationFactor)
  )
    return 0;
  return Math.max(0, Math.min(1, paid.implementationFactor));
}

/** Sum without a display cap; consumers own their target's diminishing returns. */
export function deliveredMetricEffects(
  programs: readonly MetricLawProgram[],
  settlements: ReadonlyMap<string, MetricLawSettlement>,
  turn: number
): Record<string, number> {
  const effects: Record<string, number> = {};
  for (const program of programs) {
    const factor = deliveredLawFactor(program, settlements.get(program._id), turn);
    if (factor === 0) continue;
    for (const effect of program.primaryMetricEffects) {
      if (/^\d{2}$/.test(effect.metricId) && Number.isFinite(effect.favorableNormalizedPoints)) {
        effects[effect.metricId] =
          (effects[effect.metricId] ?? 0) + effect.favorableNormalizedPoints * factor;
      }
    }
  }
  return effects;
}
