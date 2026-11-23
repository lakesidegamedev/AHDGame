import { POSITIVE_MODIFIER_NET_CAP, type ActiveModifier } from "../activeModifier";
const GENERATED_IDS = [
  "approval_events",
  "approval_positive_cap",
  "approval_smoothing",
  "approval_bounds",
];

/** The adjustment shares the same positive cap as every other authored modifier. */
export function adjustmentContribution(modifiers: readonly ActiveModifier[], adjustment: number) {
  const positives = modifiers
    .filter((m) => !GENERATED_IDS.includes(m.id))
    .reduce((sum, m) => sum + Math.max(0, m.effect), 0);
  return (
    Math.min(POSITIVE_MODIFIER_NET_CAP, positives + Math.max(0, adjustment)) -
    Math.min(POSITIVE_MODIFIER_NET_CAP, positives) +
    Math.min(0, adjustment)
  );
}

/** Persist decisions atomically with their capped contribution and explanatory chip. */
export function approvalDeltaUpdate(delta: number, extraSet: Record<string, unknown> = {}) {
  if (!Number.isFinite(delta)) throw new Error("Approval delta must be finite");
  const current = { $ifNull: ["$approvalAdjustment", 0] };
  const next = { $add: [current, delta] };
  const modifiers = {
    $ifNull: ["$activeNationalModifiers", { $ifNull: ["$activeModifiers", []] }],
  };
  const authored = {
    $filter: {
      input: modifiers,
      as: "modifier",
      cond: { $not: [{ $in: ["$$modifier.id", GENERATED_IDS] }] },
    },
  };
  const positives = {
    $sum: { $map: { input: authored, as: "modifier", in: { $max: [0, "$$modifier.effect"] } } },
  };
  const contribution = (amount: unknown) => ({
    $add: [
      {
        $subtract: [
          { $min: [POSITIVE_MODIFIER_NET_CAP, { $add: [positives, { $max: [0, amount] }] }] },
          { $min: [POSITIVE_MODIFIER_NET_CAP, positives] },
        ],
      },
      { $min: [0, amount] },
    ],
  });
  const raw = {
    $add: [
      { $ifNull: ["$approvalRawRating", { $ifNull: ["$approvalRating", 50] }] },
      { $subtract: [contribution(next), contribution(current)] },
    ],
  };
  const replaceChip = (field: string) => ({
    $cond: [
      { $eq: [{ $type: field }, "array"] },
      {
        $concatArrays: [
          {
            $filter: {
              input: field,
              as: "modifier",
              cond: { $ne: ["$$modifier.id", "approval_events"] },
            },
          },
          {
            $cond: [
              { $ne: [next, 0] },
              [
                {
                  id: "approval_events",
                  label: "Events and government decisions",
                  effect: next,
                  source: "metric",
                  marginEffect: 0,
                },
              ],
              [],
            ],
          },
        ],
      },
      "$$REMOVE",
    ],
  });
  return [
    {
      $set: {
        approvalAdjustment: next,
        approvalRawRating: raw,
        approvalRating: { $max: [0, { $min: [100, raw] }] },
        activeNationalModifiers: replaceChip("$activeNationalModifiers"),
        activeModifiers: replaceChip("$activeModifiers"),
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

/** Keep explanatory lines separate from the authored inputs used for cap arithmetic. */
export function approvalModifiersForDisplay(
  base: number,
  raw: number,
  rating: number,
  modifiers: readonly ActiveModifier[]
) {
  const authored = modifiers.filter(
    (m) => !GENERATED_IDS.includes(m.id) || m.id === "approval_events"
  );
  const positive = authored.reduce((sum, m) => sum + Math.max(0, m.effect), 0);
  const lines = [...authored];
  const add = (id: string, label: string, effect: number) => {
    const rounded = Math.round(effect * 10) / 10;
    if (rounded !== 0) lines.push({ id, label, effect: rounded, marginEffect: 0 });
  };
  add(
    "approval_positive_cap",
    "Cap on combined positive effects",
    Math.min(positive, POSITIVE_MODIFIER_NET_CAP) - positive
  );
  add(
    "approval_smoothing",
    "Gradual movement toward target",
    raw - unclampedApproval(base, authored)
  );
  add("approval_bounds", "Approval floor or ceiling", rating - raw);
  return lines;
}

/** Smooth underlying performance independently of durable event decisions. */
export function regionalApprovalSnapshot(
  base: number,
  modifiers: readonly ActiveModifier[],
  adjustment: number,
  previous?: {
    approvalRating: number;
    approvalRawRating?: number;
    approvalAdjustment?: number;
    activeModifiers?: ActiveModifier[];
  },
  maxStep = 2
) {
  const target = unclampedApproval(base, modifiers);
  const previousRaw = previous?.approvalRawRating ?? previous?.approvalRating;
  const prior =
    previousRaw === undefined
      ? undefined
      : previousRaw -
        adjustmentContribution(previous?.activeModifiers ?? [], previous?.approvalAdjustment ?? 0);
  const performance =
    prior === undefined || !Number.isFinite(prior)
      ? target
      : prior + Math.max(-maxStep, Math.min(maxStep, target - prior));
  const raw = performance + adjustmentContribution(modifiers, adjustment);
  const approval = Math.max(0, Math.min(100, raw));
  return {
    approval,
    raw,
    modifiers: approvalModifiersForDisplay(base, raw, approval, [
      ...modifiers,
      ...adjustmentModifiers(adjustment),
    ]),
  };
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
