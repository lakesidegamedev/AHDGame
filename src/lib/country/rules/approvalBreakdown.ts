import { POSITIVE_MODIFIER_NET_CAP, type ActiveModifier } from "@/lib/approval/activeModifier";

export interface ApprovalBreakdown {
  /** Population-weighted state average, before any national adjustment. */
  stateAverage: number;
  /** Each national adjustment that moves the rating, rounded for display. */
  nationalAdjustments: ActiveModifier[];
  /** Sum of the adjustments as `applyModifiers` applied them (cap included). */
  nationalNet: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export const NATIONAL_CAP_ADJUSTMENT_ID = "national_positive_cap";

/**
 * Split a stored national rating into the state average and the national
 * adjustments applied after it.
 *
 * The snapshot runs every national modifier through one `applyModifiers` call
 * (positives capped, negatives not) and stores the consumed list, so the state
 * average is the rating minus that call's net effect. Derived rather than
 * stored: it reconciles with the stored rating by construction and works for
 * older snapshots. A "cap" line keeps lines adding up when positives overshoot
 * the cap; adjustments rounding to zero are dropped.
 */
export function buildApprovalBreakdown(
  approval: number,
  nationalModifiers: ActiveModifier[],
  storedStateAverage?: number
): ApprovalBreakdown {
  let positive = 0;
  let negative = 0;
  for (const m of nationalModifiers) {
    if (!Number.isFinite(m.effect)) continue;
    if (m.effect >= 0) positive += m.effect;
    else negative += m.effect;
  }
  const cappedPositive = Math.min(positive, POSITIVE_MODIFIER_NET_CAP);
  const nationalNet = round1(cappedPositive + negative);

  const lines: ActiveModifier[] = nationalModifiers
    .filter((m) => Number.isFinite(m.effect) && round1(m.effect) !== 0)
    .map((m) => ({ ...m, effect: round1(m.effect) }));
  if (positive > cappedPositive) {
    lines.push({
      id: NATIONAL_CAP_ADJUSTMENT_ID,
      label: "Cap on combined positive effects",
      effect: round1(cappedPositive - positive),
      marginEffect: 0,
    });
  }

  const stateAverage = Number.isFinite(storedStateAverage)
    ? storedStateAverage!
    : Math.max(0, Math.min(100, approval - nationalNet));
  const clamp = round1(approval - (stateAverage + nationalNet));
  if (clamp !== 0)
    lines.push({
      id: "approval_bounds",
      label: "Approval floor or ceiling",
      effect: clamp,
      marginEffect: 0,
    });
  return {
    stateAverage: round1(stateAverage),
    nationalAdjustments: lines,
    nationalNet: round1(nationalNet + clamp),
  };
}

/** Display rounding for a modifier effect: one decimal, and null when it rounds to nothing. */
export function displayEffect(effect: number): number | null {
  if (!Number.isFinite(effect)) return null;
  if (effect === 0) return 0;
  const rounded = round1(effect);
  return rounded === 0 ? null : rounded;
}

/**
 * Population-weighted mean of the ratings a region list shows, and how far the
 * stored national average sits from it. The two differ because the national
 * average leaves out governor-only effects and moves gradually on its own.
 */
export function listedRegionAverage(
  regions: readonly { approval: number; population?: number }[],
  storedAverage: number
): { listedAverage: number; gap: number } | null {
  let weighted = 0;
  let total = 0;
  for (const region of regions) {
    const population = region.population;
    if (!Number.isFinite(region.approval) || !Number.isFinite(population) || !population) continue;
    if (population <= 0) continue;
    weighted += region.approval * population;
    total += population;
  }
  if (total <= 0 || !Number.isFinite(storedAverage)) return null;
  const listedAverage = round1(weighted / total);
  return { listedAverage, gap: round1(storedAverage - listedAverage) };
}
