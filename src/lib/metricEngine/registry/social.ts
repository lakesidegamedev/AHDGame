import { fundingResponse } from "../spendingChannel";
import type { RegistryNode } from "../types";

/**
 * Social-tier nodes — P3a ships the income/poverty cluster's social side
 * (incomeInequality / childPoverty / foodInsecurity); the housing + cohesion
 * outcomes follow in P3d. LIVE via the generic phase wiring; cold-start parity
 * is structural (the P2 contracts). Constants are first-pass directional.
 *
 * incomeInequality is the Gini INDEX (0-100) after the P3a unit unification.
 */

/**
 * Saturation half-point for the `{spending: "social"}` channel, shared by 6
 * call sites across social.ts, publicSafety.ts, governance.ts, and
 * economic.ts (pooled via CHANNEL_SOURCE_KEYS: social/welfare/socialSecurity).
 *
 * The channel sees $0-$5,303/capita (US socialSecurity lever across its 7
 * policyOptions; unlegislated seed default is $2,702.70/capita). 2700 puts the
 * unlegislated default at ~50% response and gives real separation across the
 * range (Abolition ≈ 0%, Universal Expansion ≈ 66%). A smaller halfSat
 * saturated almost the whole range, leaving every consuming node with a
 * near-fixed offset regardless of policy choice.
 */
export const SOCIAL_SPEND_HALF_SAT = 2700;

export const incomeInequalityNode: RegistryNode = {
  id: "social.incomeInequality",
  categoryId: "social",
  metricId: "incomeInequality",
  kind: "derived",
  // Slack labor markets and boom-pattern growth concentrate income; social
  // transfers compress it. gdpGrowth is a same-turn engine node.
  inputs: ["economic.unemploymentRate", "economic.gdpGrowth", { spending: "social" }],
  bounds: [15, 70],
  inertia: 0.92,
  decimals: 2, // 2dp: cabinet effects (≤0.05/turn) are reabsorbed at a coarser grain — bug #0800
  compute: (ctx) => {
    const unemployment = ctx.current["economic.unemploymentRate"] ?? 5;
    const gdpGrowth = ctx.current["economic.gdpGrowth"] ?? 2.5;
    const socialResponse = fundingResponse(ctx.spending["social"] ?? 0, SOCIAL_SPEND_HALF_SAT, 100);
    return 42 + (unemployment - 5) * 0.5 + (gdpGrowth - 2.5) * 0.3 - socialResponse * 0.04;
  },
};

export const childPovertyNode: RegistryNode = {
  id: "social.childPoverty",
  categoryId: "social",
  metricId: "childPoverty",
  kind: "derived",
  // Child poverty tracks overall poverty, amplified (children are
  // over-represented in poor households); family-targeted transfers relieve it.
  // Consumed by the education tier as a LAGGED edge (gradRate/testPerformance).
  // Bounds must span every ERA. [5,50] ceiling snapped NG NORTH_EAST's authored
  // 88 down to 50 on turn 1. Match metricDefinitions [5,95].
  inputs: ["economic.povertyRate", { spending: "social" }],
  bounds: [5, 95],
  inertia: 0.85,
  decimals: 1,
  compute: (ctx) => {
    const poverty = ctx.current["economic.povertyRate"] ?? 13;
    const socialResponse = fundingResponse(ctx.spending["social"] ?? 0, SOCIAL_SPEND_HALF_SAT, 100);
    return 18 + (poverty - 13) * 1.3 - socialResponse * 0.04;
  },
};

export const foodInsecurityNode: RegistryNode = {
  id: "social.foodInsecurity",
  categoryId: "social",
  metricId: "foodInsecurity",
  kind: "derived",
  inputs: ["economic.povertyRate", "economic.foodSecurity"], // foodSecurity = seedCurrent root
  bounds: [0, 100],
  inertia: 0.85,
  decimals: 2, // 2dp: cabinet effects (≤0.05/turn) are reabsorbed at a coarser grain — bug #0800
  compute: (ctx) => {
    const poverty = ctx.current["economic.povertyRate"] ?? 13;
    const foodSecurity = ctx.current["economic.foodSecurity"] ?? 50; // 0-100 index
    return 11 + (poverty - 13) * 0.6 - (foodSecurity - 50) * 0.08;
  },
};

// ── P3d — housing + cohesion outcomes ───────────────────────────────────────
// Reference anchors: pressure 30, homelessness 13/10k, mobility 55, cohesion 52,
// civic 55. The medianIncome affordability term is DROPPED (incomes are
// local-currency and the ctx has no countryId — the established precedent,
// named for the balance pass).

export const housingAffordabilityNode: RegistryNode = {
  id: "social.housingAffordability",
  categoryId: "social",
  metricId: "housingAffordability",
  kind: "derived",
  // Housing cost PRESSURE index (0-100, LOWER is better — the P3d unit repair).
  // Cost of living squeezes; housing supply growth (root) relieves. Matches the
  // uniform-seed derivation's anchor form.
  inputs: ["economic.costOfLiving", "social.housingSupplyGrowth"],
  bounds: [0, 100],
  inertia: 0.9,
  decimals: 1,
  compute: (ctx) => {
    const costOfLiving = ctx.current["economic.costOfLiving"] ?? 100;
    const supply = ctx.current["social.housingSupplyGrowth"] ?? 1; // %, root
    return 30 + (costOfLiving - 100) * 0.9 - (supply - 1) * 3;
  },
};

export const homelessnessRateNode: RegistryNode = {
  id: "social.homelessnessRate",
  categoryId: "social",
  metricId: "homelessnessRate",
  kind: "derived",
  // Per 10k residents. Housing pressure and poverty push people out; mental
  // health access (the P2b node) catches them.
  inputs: ["social.housingAffordability", "economic.povertyRate", "healthcare.mentalHealthAccess"],
  bounds: [0, 200],
  inertia: 0.9,
  decimals: 2, // 2dp: cabinet effects (≤0.05/turn) are reabsorbed at a coarser grain — bug #0800
  compute: (ctx) => {
    const pressure = ctx.current["social.housingAffordability"] ?? 30;
    const poverty = ctx.current["economic.povertyRate"] ?? 13;
    const mentalHealth = ctx.current["healthcare.mentalHealthAccess"] ?? 50;
    return 13 + (pressure - 30) * 0.25 + (poverty - 13) * 0.8 - (mentalHealth - 50) * 0.1;
  },
};

export const socialMobilityNode: RegistryNode = {
  id: "social.socialMobility",
  categoryId: "social",
  metricId: "socialMobility",
  kind: "derived",
  // Generational — schooling opens ladders; inequality and (lagged) poverty
  // pull them up. Slowest inertia in the tier.
  inputs: [
    "education.highSchoolGradRate",
    "education.universityEnrollment",
    "social.incomeInequality",
    { lagged: "economic.povertyRate" },
  ],
  bounds: [0, 100],
  inertia: 0.93,
  decimals: 2, // 2dp: cabinet effects (≤0.05/turn) are reabsorbed at a coarser grain — bug #0800
  compute: (ctx) => {
    const grad = ctx.current["education.highSchoolGradRate"] ?? 88;
    // Reads the merged universityEnrollment. Its equilibrium differs by
    // country (US anchors 55 — the former collegeEnrollment center — GCSE
    // countries anchor 40), so the deviation term is centered per country and
    // stays ~0 at seed (parity with the old collegeEnrollment read).
    const uniCenter = ctx.countryId === "US" ? 55 : 40;
    const uni = ctx.current["education.universityEnrollment"] ?? uniCenter;
    const gini = ctx.current["social.incomeInequality"] ?? 42;
    const povLag = ctx.prev["economic.povertyRate"] ?? 13;
    return (
      55 + (grad - 88) * 0.5 + (uni - uniCenter) * 0.3 - (gini - 42) * 0.5 - (povLag - 13) * 0.5
    );
  },
};

export const socialCohesionNode: RegistryNode = {
  id: "social.socialCohesion",
  categoryId: "social",
  metricId: "socialCohesion",
  kind: "derived",
  // The P3d hand-back: education.highSchoolGradRate already reads this id —
  // registration turns that seed read into a live same-turn topo edge
  // (cohesion orders before the education tier). mediaPolarization is a root.
  inputs: [
    "social.incomeInequality",
    "economic.unemploymentRate",
    "mediaInformation.mediaPolarization",
  ],
  bounds: [0, 100],
  inertia: 0.9,
  // 2dp storage (P3d): the social-channel→gini path steps ~0.05/turn — at
  // 1dp's half-grain, where policy-delta preservation reabsorbs every step
  // (the P2c rounding-plateau class) and the hand-back edge dies.
  decimals: 2,
  compute: (ctx) => {
    const gini = ctx.current["social.incomeInequality"] ?? 42;
    const unemployment = ctx.current["economic.unemploymentRate"] ?? 5;
    const polarization = ctx.current["mediaInformation.mediaPolarization"] ?? 45; // root, lower better
    return 52 - (gini - 42) * 0.4 - (unemployment - 5) * 0.8 - (polarization - 45) * 0.2;
  },
};

export const civicParticipationNode: RegistryNode = {
  id: "social.civicParticipation",
  categoryId: "social",
  metricId: "civicParticipation",
  kind: "derived",
  inputs: ["education.highSchoolGradRate", "social.socialCohesion", "governance.publicTrust"],
  bounds: [0, 100],
  inertia: 0.88,
  decimals: 2, // 2dp: cabinet effects (≤0.05/turn) are reabsorbed at a coarser grain — bug #0800
  compute: (ctx) => {
    const grad = ctx.current["education.highSchoolGradRate"] ?? 88;
    const cohesion = ctx.current["social.socialCohesion"] ?? 52;
    const trust = ctx.current["governance.publicTrust"] ?? 50; // root
    return 55 + (grad - 88) * 0.3 + (cohesion - 52) * 0.4 + (trust - 50) * 0.2;
  },
};

// UK-origin metric, uniform-seeded broadly (persist gate scopes it).
export const roughSleepingNode: RegistryNode = {
  id: "social.roughSleeping",
  categoryId: "social",
  metricId: "roughSleeping",
  kind: "derived",
  // Aligned with the uniform-seed derivation (homelessness / 5).
  inputs: ["social.homelessnessRate"],
  bounds: [0, 10],
  inertia: 0.85,
  decimals: 2,
  compute: (ctx) => (ctx.current["social.homelessnessRate"] ?? 13) / 5,
};

// IE-only seeds (persist gate scopes them).
export const vacantPropertyRateNode: RegistryNode = {
  id: "social.vacantPropertyRate",
  categoryId: "social",
  metricId: "vacantPropertyRate",
  kind: "derived",
  // Vacancy and housing pressure anticorrelate (Dublin: low vacancy, high
  // pressure); new supply adds slack.
  inputs: ["social.housingAffordability", "social.housingSupplyGrowth"],
  bounds: [0, 100],
  inertia: 0.9,
  decimals: 1,
  compute: (ctx) => {
    const pressure = ctx.current["social.housingAffordability"] ?? 30;
    const supply = ctx.current["social.housingSupplyGrowth"] ?? 1;
    return 12 - pressure * 0.1 + (supply - 1) * 0.5;
  },
};

export const rentalPressureIndexNode: RegistryNode = {
  id: "social.rentalPressureIndex",
  categoryId: "social",
  metricId: "rentalPressureIndex",
  kind: "derived",
  // Linear tracker of housing pressure into the rental market (IE seeds 72-85);
  // supply relief acts directly too. Named: first-pass linear form.
  inputs: ["social.housingAffordability", "social.housingSupplyGrowth"],
  bounds: [0, 100],
  inertia: 0.88,
  decimals: 1,
  compute: (ctx) => {
    const pressure = ctx.current["social.housingAffordability"] ?? 30;
    const supply = ctx.current["social.housingSupplyGrowth"] ?? 1;
    return 10 + pressure * 2 - (supply - 1) * 4;
  },
};

/** Social tier nodes — the P3a income/poverty trio + the P3d housing/cohesion outcomes. */
export const SOCIAL_NODES: RegistryNode[] = [
  incomeInequalityNode,
  childPovertyNode,
  foodInsecurityNode,
  housingAffordabilityNode,
  homelessnessRateNode,
  socialMobilityNode,
  socialCohesionNode,
  civicParticipationNode,
  roughSleepingNode,
  vacantPropertyRateNode,
  rentalPressureIndexNode,
];
