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
  /** Actual outlay in the source ledger's monetary units, not an appropriation. */
  outlaid?: number;
  /** Identity of the original payment, shared by any views of that payment. */
  paymentKey?: string;
  /** Annual regional spending funded by the budget, not a current-turn cash payment. */
  fundedAnnualAmount?: number;
  fundingKey?: string;
}

/** A reviewed mechanism classification belongs to one enacted option, not its reusable id alone. */
export interface MetricLawRoleBinding {
  programId: string;
  familyId: string;
  effectiveTurn: number;
  choice?: string;
}

export function metricLawRoleMatches(
  program: MetricLawProgram,
  role: MetricLawRoleBinding | undefined
): boolean {
  return (
    !!role &&
    role.programId === program._id &&
    role.familyId === program.familyId &&
    role.effectiveTurn === program.effectiveTurn &&
    role.choice === program.choice
  );
}

export function hasCurrentLawSettlement(
  program: MetricLawProgram,
  paid: MetricLawSettlement | undefined,
  turn: number
): boolean {
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
    return false;
  return true;
}

export function deliveredLawFactor(
  program: MetricLawProgram,
  paid: MetricLawSettlement | undefined,
  turn: number
): number {
  return hasCurrentLawSettlement(program, paid, turn)
    ? Math.max(0, Math.min(1, paid!.implementationFactor))
    : 0;
}

/** Scope matching is shared by mechanism owners, never inferred from a region id alone. */
export function metricLawApplies(
  program: Pick<MetricLawProgram, "country" | "scope" | "regionId">,
  target: { countryId: string; scope: "national" | "regional"; regionId?: string }
): boolean {
  return (
    program.country === target.countryId &&
    (program.scope === "national" ||
      (target.scope === "regional" && !!target.regionId && program.regionId === target.regionId))
  );
}

/**
 * Actual payments are not implementation percentages. A capacity-limited service
 * can spend money with zero implementation. Multi-turn settlements do not prove
 * how much cash was paid on each later covered turn, so no daily split is invented.
 * This is payment evidence, not permission to treat services as household cash.
 */
export function metricLawOutlaysAtTurn(
  programs: readonly MetricLawProgram[],
  settlements: ReadonlyMap<string, MetricLawSettlement>,
  turn: number
): { paymentKey: string; amount: number; programIds: string[] }[] {
  const payments = new Map<string, { paymentKey: string; amount: number; programIds: string[] }>();
  for (const program of programs) {
    const paid = settlements.get(program._id);
    if (
      !hasCurrentLawSettlement(program, paid, turn) ||
      paid!.lastSettledTurn !== turn ||
      !paid!.paymentKey ||
      !Number.isSafeInteger(paid!.outlaid) ||
      paid!.outlaid! < 0
    )
      continue;
    const previous = payments.get(paid!.paymentKey!);
    if (previous) {
      if (previous.amount !== paid!.outlaid) throw new Error("Conflicting metric payment evidence");
      if (!previous.programIds.includes(program._id)) previous.programIds.push(program._id);
    } else {
      payments.set(paid!.paymentKey!, {
        paymentKey: paid!.paymentKey!,
        amount: paid!.outlaid!,
        programIds: [program._id],
      });
    }
  }
  return [...payments.values()];
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
