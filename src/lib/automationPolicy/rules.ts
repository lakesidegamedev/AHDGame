/**
 * Automation policy rules for the 2027 world: what the automation law track
 * does outside the metric board. Game design, deliberately small: the top rung
 * of any one law moves a cost by a few percent and the combined effect is capped.
 * Crew retention, automation input cost, wage cost, re-employment speed, union
 * bias and voter bucket impacts each have one pure function below.
 * Plain data in, plain data out: law levels arrive already read.
 */

const clamp = (value: number, lower: number, upper: number) =>
  Math.max(lower, Math.min(upper, value));

const finite = (value: number | null | undefined): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const level = (value: number | null | undefined): number => clamp(Math.round(finite(value)), 0, 4);

/** Enacted level (0 to 4) of each automation law in one country. */
export interface AutomationPolicy {
  automationTax: number;
  wageInsurance: number;
  retraining: number;
  hiringSubsidy: number;
  pensionLevy: number;
  transitionCompacts: number;
}

export const NO_AUTOMATION_POLICY: Readonly<AutomationPolicy> = {
  automationTax: 0,
  wageInsurance: 0,
  retraining: 0,
  hiringSubsidy: 0,
  pensionLevy: 0,
  transitionCompacts: 0,
};

/**
 * Law id slugs in each book; the shell prefixes the country. Laws with no
 * legacy slug exist only in the US and UK law book.
 */
export const AUTOMATION_LAW_SLUGS: Readonly<
  Record<keyof AutomationPolicy, { modern: string; legacy?: string }>
> = {
  automationTax: { modern: "automationTax", legacy: "automation_tax" },
  wageInsurance: { modern: "wageInsurance" },
  retraining: { modern: "retrainingGuarantee" },
  hiringSubsidy: { modern: "hiringSubsidy" },
  pensionLevy: { modern: "automationPensionLevy" },
  transitionCompacts: { modern: "transitionCompacts" },
};

// ─── Labour: crew retention and re-employment ───────────────────────────────

/** Share of the crew gap an automated plant keeps, by law level. */
const RETENTION_BY_LAW = {
  automationTax: [0, 0.04, 0.1, 0.18, 0.25],
  hiringSubsidy: [0, 0.03, 0.08, 0.14, 0.2],
  transitionCompacts: [0, 0.03, 0.07, 0.12, 0.18],
} as const;

/** No stack of laws keeps more than this share of the crew an automation method sheds. */
export const MAX_CREW_RETENTION = 0.45;

/** Share (0 to 0.45) of the shed crew that automated plants keep under the laws. */
export function automationCrewRetention(policy: AutomationPolicy): number {
  let shed = 1;
  for (const key of Object.keys(RETENTION_BY_LAW) as Array<keyof typeof RETENTION_BY_LAW>)
    shed *= 1 - RETENTION_BY_LAW[key][level(policy[key])];
  return Math.min(MAX_CREW_RETENTION, 1 - shed);
}

/**
 * Crew per unit of capacity after the laws: the automation factor lifted
 * towards 1 by the retained share. A plant that sheds no one stays at 1.
 */
export function retainedLabourFactor(factor: number, retention: number): number {
  if (!(factor > 0) || factor >= 1 || !(retention > 0)) return factor;
  return factor + (1 - factor) * retention;
}

/** Extra re-employment speed from the retraining guarantee, by level. */
const RETRAINING_SUPPORT = [0, 0.15, 0.35, 0.6, 0.8] as const;
/** Extra re-employment speed from the hiring subsidy, by level. */
const SUBSIDY_REEMPLOYMENT_SUPPORT = [0, 0.05, 0.12, 0.2, 0.3] as const;
/** Re-employment speed from the wage insurance law (US and UK ladders), by level. */
const WAGE_INSURANCE_LEVEL_SUPPORT = [0, 0.2, 0.45, 0.75, 1] as const;

/** How strongly wage insurance keeps displaced workers attached to work, 0 to 1. */
export function wageInsuranceLevelSupport(wageInsurance: number): number {
  return WAGE_INSURANCE_LEVEL_SUPPORT[level(wageInsurance)];
}

/**
 * Extra re-employment speed (0 to 1) from retraining and the hiring subsidy.
 * Wage insurance is counted separately by the absorption rules.
 */
export function reemploymentSupport(policy: AutomationPolicy): number {
  return clamp(
    RETRAINING_SUPPORT[level(policy.retraining)] +
      SUBSIDY_REEMPLOYMENT_SUPPORT[level(policy.hiringSubsidy)],
    0,
    1
  );
}

// ─── Corporate costs ────────────────────────────────────────────────────────

/** Production methods that replace workers: the ones the levies fall on. */
export const AUTOMATION_METHODS: ReadonlySet<string> = new Set([
  "humanoid_robotics",
  "agentic_services",
  "autonomous_factory",
  "autonomous_freight",
]);

/** Rise in an automation method's input bill, by law level. */
const LEVY_INPUT_PENALTY = {
  automationTax: [0, 0.01, 0.025, 0.045, 0.07],
  pensionLevy: [0, 0.005, 0.012, 0.02, 0.03],
} as const;

/** Ceiling on the combined levy rise in an automation method's input bill. */
export const MAX_LEVY_INPUT_PENALTY = 0.1;

/** Fraction an automation method's input bill rises by under the levies; 0 elsewhere. */
export function automationLevyInputPenalty(
  policy: AutomationPolicy,
  strategyId: string | null | undefined
): number {
  if (!strategyId || !AUTOMATION_METHODS.has(strategyId)) return 0;
  return Math.min(
    MAX_LEVY_INPUT_PENALTY,
    LEVY_INPUT_PENALTY.automationTax[level(policy.automationTax)] +
      LEVY_INPUT_PENALTY.pensionLevy[level(policy.pensionLevy)]
  );
}

/** Multiplier on a firm's wage bill under the hiring subsidy (1 to 0.95). */
const WAGE_COST_MULT = [1, 0.995, 0.985, 0.97, 0.95] as const;

export function subsidisedWageMultiplier(hiringSubsidy: number): number {
  return WAGE_COST_MULT[level(hiringSubsidy)];
}

// ─── Unions ─────────────────────────────────────────────────────────────────

/** Union law bias (the bias axis runs -50 to 50) added by transition compacts. */
const COMPACT_UNION_BIAS = [0, 2, 5, 9, 14] as const;

export function automationUnionBias(policy: AutomationPolicy): number {
  return COMPACT_UNION_BIAS[level(policy.transitionCompacts)];
}

// ─── Voters ─────────────────────────────────────────────────────────────────

/**
 * Approval points per level of change, by census bucket, for each law: who
 * gains from the law (positive) and who pays for it (negative). Raising a law
 * by two rungs doubles the swing; repealing it reverses the sign.
 */
const BUCKET_WEIGHTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  automationTax: {
    "wealth:low": 2,
    "education:no_college": 2,
    "wealth:high": -3,
    "education:graduate": -1,
  },
  wageInsurance: { "wealth:low": 2, "education:no_college": 2, "wealth:middle": 1 },
  retrainingGuarantee: {
    "education:no_college": 2,
    "wealth:low": 1,
    "age:young": 1,
    "wealth:high": -1,
  },
  hiringSubsidy: {
    "wealth:low": 2,
    "education:no_college": 2,
    "wealth:middle": 1,
    "wealth:high": -1,
  },
  automationPensionLevy: { "age:senior": 3, "wealth:high": -2, "education:graduate": -1 },
  transitionCompacts: {
    "education:no_college": 2,
    "wealth:low": 2,
    "wealth:high": -2,
    "education:graduate": -1,
  },
};

/** A single law never swings a bucket by more than this in one enactment. */
export const MAX_BUCKET_IMPACT = 6;

/**
 * Law slug from a new-generation law type id (`us.sec.<slug>`), or null when
 * the id is not one of the automation laws.
 */
export function automationLawSlug(legislationTypeId: string): string | null {
  const [, kind, slug] = legislationTypeId.split(".");
  return kind === "sec" && slug !== undefined && slug in BUCKET_WEIGHTS ? slug : null;
}

/**
 * Per-bucket approval impact of moving an automation law from one level to
 * another. Empty for any other law, or when the level does not change.
 */
export function automationBucketImpacts(
  legislationTypeId: string,
  oldLevel: number,
  newLevel: number
): Record<string, number> {
  const slug = automationLawSlug(legislationTypeId);
  const delta = level(newLevel) - level(oldLevel);
  if (!slug || delta === 0) return {};
  const impacts: Record<string, number> = {};
  for (const [bucket, weight] of Object.entries(BUCKET_WEIGHTS[slug])) {
    const impact = clamp(weight * delta, -MAX_BUCKET_IMPACT, MAX_BUCKET_IMPACT);
    if (impact !== 0) impacts[bucket] = impact;
  }
  return impacts;
}

/** Add one set of bucket impacts onto another, clamping each bucket to the generic +-10. */
export function mergeBucketImpacts(
  base: Readonly<Record<string, number>>,
  extra: Readonly<Record<string, number>>
): Record<string, number> {
  const out: Record<string, number> = { ...base };
  for (const [bucket, value] of Object.entries(extra)) {
    const merged = clamp((out[bucket] ?? 0) + value, -10, 10);
    if (merged === 0) delete out[bucket];
    else out[bucket] = merged;
  }
  return out;
}
