import type { DemographicEffect, LegislationType } from "@/lib/db/types/legislation";

/**
 * Lean effects for Japan's law types: a passed law (national, or regional in one
 * prefecture group) drifts the regional economicLean / socialLean of the Layer-1
 * buckets it plausibly touches (dims: ethnicity, age, education, income,
 * urbanization — see layer1Model.ts). Direction is positive: a bucket's lean
 * follows the enacted option's score (right option → rightward).
 *
 * Attached by rule instead of hand-written on ~60 types: the axis comes from
 * which score the law's options actually vary on, the audience from its
 * policyDomain. Types that already author demographicEffects are left alone.
 */
type Audience = ReadonlyArray<readonly [dim: string, bucket: string, direction: number]>;

const DEFAULT_ECONOMIC: Audience = [
  ["income", "middle", 0.4],
  ["income", "low", 0.3],
  ["education", "high_school", 0.2],
];
const DEFAULT_SOCIAL: Audience = [
  ["education", "university", 0.3],
  ["urbanization", "urban", 0.3],
  ["age", "young", 0.2],
  ["education", "graduate", 0.2],
];
const SECURITY_SOCIAL: Audience = [
  ["age", "senior", 0.3],
  ["urbanization", "rural", 0.3],
  ["education", "high_school", 0.2],
];

const ECONOMIC_BY_DOMAIN: Record<string, Audience> = {
  tax: [
    ["income", "middle", 0.4],
    ["income", "high", 0.3],
    ["income", "low", 0.2],
  ],
  healthcare: [
    ["age", "senior", 0.4],
    ["age", "mature", 0.3],
    ["income", "low", 0.2],
  ],
  education: [
    ["education", "university", 0.3],
    ["age", "young", 0.3],
    ["income", "middle", 0.2],
  ],
  economic: [
    ["income", "middle", 0.4],
    ["income", "low", 0.3],
    ["education", "vocational", 0.2],
  ],
  agriculture: [
    ["urbanization", "rural", 0.4],
    ["education", "primary_or_below", 0.2],
    ["age", "senior", 0.2],
  ],
  infrastructure: [
    ["urbanization", "rural", 0.3],
    ["urbanization", "suburban", 0.2],
    ["income", "middle", 0.2],
  ],
  environment: [
    ["education", "university", 0.3],
    ["urbanization", "urban", 0.2],
    ["age", "young", 0.2],
  ],
  social: [
    ["age", "mature", 0.3],
    ["income", "low", 0.3],
    ["urbanization", "urban", 0.2],
  ],
};
const SOCIAL_BY_DOMAIN: Record<string, Audience> = {
  defense: SECURITY_SOCIAL,
  law_justice: SECURITY_SOCIAL,
};

/** National laws spread over 8 regions (1/8); regional laws apply at full scope. */
const NATIONAL_MAGNITUDE = 2;
export const REGIONAL_MAGNITUDE = 1;
/** A social score this large is a real social-axis law, not an incidental stance tag. */
const REAL_SOCIAL_SCORE = 5;

/** Audience for a lean axis and a JP policy-domain key (unknown domain: the axis default). */
export function leanAudience(axis: "economic" | "social", domain: string): Audience {
  return axis === "economic"
    ? (ECONOMIC_BY_DOMAIN[domain] ?? DEFAULT_ECONOMIC)
    : (SOCIAL_BY_DOMAIN[domain] ?? DEFAULT_SOCIAL);
}

function effectsFor(type: LegislationType): DemographicEffect[] {
  const options = type.policyOptions ?? [];
  const hasEconomic = options.some((o) => o.economic !== 0);
  const maxSocial = Math.max(0, ...options.map((o) => Math.abs(o.social)));
  const magnitude = type.nationalOnly ? NATIONAL_MAGNITUDE : REGIONAL_MAGNITUDE;
  const domain = type.policyDomain;
  const out: DemographicEffect[] = [];
  if (hasEconomic) {
    for (const [dim, bucket, direction] of ECONOMIC_BY_DOMAIN[domain] ?? DEFAULT_ECONOMIC) {
      out.push({ dim, bucket, target: "economicLean", direction, magnitude });
    }
  }
  if (maxSocial >= REAL_SOCIAL_SCORE || (!hasEconomic && maxSocial > 0)) {
    for (const [dim, bucket, direction] of SOCIAL_BY_DOMAIN[domain] ?? DEFAULT_SOCIAL) {
      out.push({
        dim,
        bucket,
        target: "socialLean",
        direction,
        magnitude,
        strengthAxis: "social",
      });
    }
  }
  return out;
}

export function withJpLeanEffects(types: LegislationType[]): LegislationType[] {
  return types.map((type) => {
    if (type.demographicEffects?.length) return type;
    const demographicEffects = effectsFor(type);
    return demographicEffects.length > 0 ? { ...type, demographicEffects } : type;
  });
}
