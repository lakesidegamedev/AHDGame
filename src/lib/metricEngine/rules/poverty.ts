/**
 * Modeled poverty responds to employment, inequality and delivered relief.
 * povertyTarget is a calibrated population-share proxy, not a household survey;
 * funded law relief replaces legacy booked social spending in v2 countries.
 */

/** Historical unattributed adjustments lose half their effect over 48 turns. */
export const POVERTY_OFFSET_RETENTION = Math.pow(0.5, 1 / 48);

/** Round decayed offsets toward zero so two-decimal storage cannot preserve a tail forever. */
export function decayPovertyOffset(delta: number, fundedLawOwner = true): number {
  // Legacy worlds still depend on their policy offsets. Do not withdraw that
  // channel before their laws have a funded target owner to replace it.
  if (!fundedLawOwner) return delta;
  return (
    (Math.sign(delta) * Math.floor(Math.abs(delta) * POVERTY_OFFSET_RETENTION * 100 + 1e-9)) / 100
  );
}

export interface PovertyPolicyInput {
  /** Sum of favorable normalized law effects times actual implementation. */
  deliveredPressure: number;
}

export interface PovertyProgram {
  _id: string;
  country: string;
  scope: "national" | "regional";
  regionId?: string;
  familyId: string;
  fundingAccountId: string;
  effectiveTurn: number;
  choice?: string;
  /** Present only for an unreplaced opening regional source claim. */
  settlementLawId?: string;
  primaryMetricEffects: readonly { metricId: string; favorableNormalizedPoints: number }[];
}

export interface PovertyDelivery {
  implementationFactor: number;
  lastSettledTurn: number;
  validThroughTurn?: number;
  legislationTypeId?: string;
}

/** Missing, expired or pre-enactment settlements never imply full funding. */
export function povertyDeliveredPressure(
  programs: readonly PovertyProgram[],
  delivery: ReadonlyMap<string, PovertyDelivery>,
  turn: number
): number {
  let pressure = 0;
  if (!Number.isSafeInteger(turn) || turn < 1) return pressure;
  for (const program of programs) {
    const paid = delivery.get(program._id);
    if (
      !Number.isSafeInteger(program.effectiveTurn) ||
      program.effectiveTurn < 1 ||
      program.effectiveTurn > turn ||
      program.choice === "leave_to_states" ||
      !paid ||
      !Number.isSafeInteger(paid.lastSettledTurn) ||
      !Number.isSafeInteger(paid.validThroughTurn ?? paid.lastSettledTurn) ||
      paid.lastSettledTurn < program.effectiveTurn ||
      paid.lastSettledTurn > turn ||
      (paid.validThroughTurn ?? paid.lastSettledTurn) < turn
    )
      continue;
    const factor = Number.isFinite(paid.implementationFactor)
      ? Math.max(0, Math.min(1, paid.implementationFactor))
      : 0;
    for (const effect of program.primaryMetricEffects) {
      if (effect.metricId === "03" && Number.isFinite(effect.favorableNormalizedPoints)) {
        pressure += effect.favorableNormalizedPoints * factor;
      }
    }
  }
  return pressure;
}

/** Diminishing returns preserve funding sensitivity even with several enacted laws. */
export function povertyLawRelief(pressure: number): number {
  if (!Number.isFinite(pressure)) return 0;
  return (6 * pressure) / (1 + Math.abs(pressure));
}

export function povertyTarget(input: {
  unemployment?: number;
  inequality?: number;
  crime?: number;
  socialSpending?: number;
  policy?: PovertyPolicyInput;
}): number {
  const safe = (value: number | undefined, fallback: number) =>
    value !== undefined && Number.isFinite(value) ? value : fallback;
  const spending = Math.max(0, safe(input.socialSpending, 0));
  const relief = input.policy
    ? povertyLawRelief(input.policy.deliveredPressure)
    : (6 * spending) / (spending + 2700);
  return (
    13 +
    (safe(input.unemployment, 5) - 5) * 0.6 +
    (safe(input.inequality, 42) - 42) * 0.15 +
    (safe(input.crime, 4500) - 4500) * 0.0004 -
    relief
  );
}
