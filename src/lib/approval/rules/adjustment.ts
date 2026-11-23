import { POSITIVE_MODIFIER_NET_CAP, type ActiveModifier } from "../activeModifier";
/** Persist additive effects separately from the derived rating so snapshots cannot erase them. */
export function approvalDeltaUpdate(delta: number, extraSet: Record<string, unknown> = {}) {
  if (!Number.isFinite(delta)) throw new Error("Approval delta must be finite");
  const raw = {
    $add: [{ $ifNull: ["$approvalRawRating", { $ifNull: ["$approvalRating", 50] }] }, delta],
  };
  return [
    {
      $set: {
        approvalAdjustment: { $add: [{ $ifNull: ["$approvalAdjustment", 0] }, delta] },
        approvalRawRating: raw,
        approvalRating: { $max: [0, { $min: [100, raw] }] },
        ...extraSet,
      },
    },
    {
      $set: {
        disapprovalRating: { $subtract: [100, "$approvalRating"] },
        netApproval: { $subtract: [{ $multiply: [2, "$approvalRating"] }, 100] },
      },
    },
  ];
}

export function adjustmentModifiers(adjustment: number | undefined) {
  return Number.isFinite(adjustment) && adjustment !== 0
    ? [
        {
          id: "approval_events",
          label: "Events and government decisions",
          effect: adjustment!,
          source: "metric" as const,
          marginEffect: 0,
        },
      ]
    : [];
}

export function unclampedApproval(base: number, modifiers: readonly ActiveModifier[]): number {
  let positive = 0;
  let negative = 0;
  for (const modifier of modifiers) {
    if (modifier.effect >= 0) positive += modifier.effect;
    else negative += modifier.effect;
  }
  return Math.round((base + Math.min(positive, POSITIVE_MODIFIER_NET_CAP) + negative) * 10) / 10;
}
