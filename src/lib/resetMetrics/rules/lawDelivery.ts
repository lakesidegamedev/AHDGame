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
  /** Annual spending booked for an opening regional source claim; zero means no funding path. */
  openingAnnualBooked?: number;
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

/**
 * An unreplaced regional opening statute that books no regional spending has no
 * settlement path, so it can never show funding evidence. It stays in force as
 * written; reading it as defunded would push every region below its opening.
 */
export function isUnbookedOpeningStatute(
  program: MetricLawProgram,
  settlements: ReadonlyMap<string, MetricLawSettlement>
): boolean {
  return (
    program.scope === "regional" &&
    program.settlementLawId !== undefined &&
    program.openingAnnualBooked === 0 &&
    !settlements.has(program._id)
  );
}

/**
 * Statutory pressure relative to the opening law, per law family and metric.
 * The opening observation already embodies its statutes at full delivery, so
 * only change from that reference moves a metric: a replacement law, a defunded
 * opening law, or a newly funded one. `programs` are the current programs
 * (replacements plus unreplaced opening laws) and `opening` the full opening
 * reference, both already filtered to the board they apply to.
 */
export function netMetricLawPressureByFamily(
  programs: readonly MetricLawProgram[],
  opening: readonly MetricLawProgram[],
  settlements: ReadonlyMap<string, MetricLawSettlement>,
  turn: number
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const add = (familyId: string, metricId: string, points: number) => {
    if (!/^\d{2}$/.test(metricId) || !Number.isFinite(points)) return;
    const family = (out[familyId] ??= {});
    family[metricId] = (family[metricId] ?? 0) + points;
  };
  for (const program of programs) {
    const factor = isUnbookedOpeningStatute(program, settlements)
      ? 1
      : deliveredLawFactor(program, settlements.get(program._id), turn);
    if (factor === 0) continue;
    for (const effect of program.primaryMetricEffects)
      add(program.familyId, effect.metricId, effect.favorableNormalizedPoints * factor);
  }
  for (const program of opening)
    for (const effect of program.primaryMetricEffects)
      add(program.familyId, effect.metricId, -effect.favorableNormalizedPoints);
  for (const [familyId, metrics] of Object.entries(out)) {
    for (const [metricId, points] of Object.entries(metrics)) {
      const rounded = Number(points.toFixed(4));
      if (rounded === 0) delete metrics[metricId];
      else metrics[metricId] = rounded;
    }
    if (Object.keys(metrics).length === 0) delete out[familyId];
  }
  return out;
}

/** Net statutory pressure per metric, summed across law families. */
export function netMetricLawPressure(
  byFamily: Readonly<Record<string, Readonly<Record<string, number>>>>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const metrics of Object.values(byFamily))
    for (const [metricId, points] of Object.entries(metrics))
      out[metricId] = (out[metricId] ?? 0) + points;
  return out;
}
