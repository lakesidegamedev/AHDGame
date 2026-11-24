/** Consolidated corporate tax uses losses once, then allocates the remaining base. */
export function consolidatedTaxScale(net: readonly number[]): number {
  const positive = net.reduce((sum, value) => sum + Math.max(0, value), 0);
  const total = net.reduce((sum, value) => sum + value, 0);
  return positive > 0 ? Math.max(0, Math.min(1, total / positive)) : 0;
}

export interface SectorTaxAssessment {
  turn: number;
  /** All amounts are anchor units per turn, frozen with the assessment. */
  national: number;
  regional: number;
  taxableProfit: number;
  overheadShare: number;
  nationalRate: number;
  regionalRate: number;
}

export function recordedSectorTax(assessment: SectorTaxAssessment | undefined, factor: number) {
  if (!assessment || !Number.isFinite(factor) || factor <= 0) return null;
  return {
    turn: assessment.turn,
    federalTax: assessment.national * factor,
    stateTax: assessment.regional * factor,
    taxableProfit: assessment.taxableProfit * factor,
    overheadShare: assessment.overheadShare * factor,
    federalRate: assessment.nationalRate,
    stateRate: assessment.regionalRate,
  };
}
