import { fundingResponse } from "../spendingChannel";
import type { EngineNodeContext, RegistryNode } from "../types";

/**
 * Education outcome nodes, LIVE in `METRIC_REGISTRY` via generic phase wiring.
 * Cold-start is parity-preserving: with no stored simBaseline, evalNode's
 * fallbacks yield `value = storedValue` exactly, so going live does not move
 * any metric at t0. The seed governs the LEVEL; these compute() formulas
 * govern the DYNAMICS. Constants are first-pass directional.
 *
 * Drivers: `{spending:education}` via diminishing returns; childPoverty as a
 * LAGGED edge; socialCohesion and medianIncome resolve into topo edges on
 * registration; academicPressure / apprenticeshipRate remain seedCurrent roots.
 */

// Calibration anchors. `*_HALF_SAT` is the per-capita education spend at which
// the channel reaches half its max response.
//
// The half-sat must sit inside the realistic spend range or the response
// saturates at any plausible spend and funding changes barely move outcomes.
// The spending channel sums federal-plus-state per-capita and all five
// education budgetCategory levers stack additively: baseline ~$806/capita,
// single flagship lever max ~$1303, five-lever theoretical max ~$6515
// (~$8274 after the US era ramp).
//
// 1300 is anchored to the flagship lever's max, so fully funding just that one
// bill reaches ~50% of max response. Response runs ~38% at today's baseline up
// to ~83% at the stacked max: real slope across the whole range.
export const EDU_SPEND_HALF_SAT = 1300;

const spendResp = (ctx: EngineNodeContext): number =>
  fundingResponse(ctx.spending["education"] ?? 0, EDU_SPEND_HALF_SAT, 100); // 0..100

export const highSchoolGradRateNode: RegistryNode = {
  id: "education.highSchoolGradRate",
  categoryId: "education",
  metricId: "highSchoolGradRate",
  kind: "derived",
  // socialCohesion went LIVE in P3d — the bare-string read is now a same-turn
  // topo edge (cohesion evaluates before the education tier).
  // Bounds must span every ERA. [55,98] was a Western secondary-school
  // assumption — evalNode snapped NG NORTH_EAST's authored 1 (and GR rural 6,
  // IE west 20, JP 45) up to 55 on turn 1 in ahd_sim_preflightfx while DE 60
  // survived. Match metricDefinitions [0,98].
  inputs: [{ spending: "education" }, { lagged: "social.childPoverty" }, "social.socialCohesion"],
  bounds: [0, 98],
  inertia: 0.8,
  decimals: 2, // 2dp: cabinet effects (≤0.05/turn) are reabsorbed at a coarser grain — bug #0800
  compute: (ctx) => {
    const childPoverty = ctx.prev["social.childPoverty"] ?? 18; // lagged, 0..100
    const cohesion = ctx.current["social.socialCohesion"] ?? 50; // seedCurrent
    return 70 + spendResp(ctx) * 0.4 - childPoverty * 0.5 + (cohesion - 50) * 0.1;
  },
};

export const literacyRateNode: RegistryNode = {
  id: "education.literacyRate",
  categoryId: "education",
  metricId: "literacyRate",
  kind: "derived",
  // High inertia: literacy is slow-moving (stock-like).
  // Bounds must span every ERA. [80,99] was a US-modern assumption — evalNode
  // snapped TR_IST's authored 55 (and CN down to ~22) up to 80 on turn 1 in
  // ahd_sim_preflightfx while SE 99 survived. Floor at 10 admits the 1953
  // band (TR east 15, CN ~22–38, TR_IST 55, SE/FI/AT ~99).
  inputs: ["education.highSchoolGradRate", { spending: "education" }],
  bounds: [10, 99],
  inertia: 0.92,
  decimals: 1,
  compute: (ctx) => {
    const gradRate = ctx.current["education.highSchoolGradRate"] ?? 88;
    return 82 + (gradRate - 88) * 0.25 + spendResp(ctx) * 0.08;
  },
};

export const testPerformanceNode: RegistryNode = {
  id: "education.testPerformance",
  categoryId: "education",
  metricId: "testPerformance",
  kind: "derived",
  // Index centered at 100 (national avg). academicPressure lifts scores (at a
  // mentalHealth cost modeled elsewhere); child poverty drags them.
  inputs: [
    { spending: "education" },
    { lagged: "social.childPoverty" },
    "education.academicPressure", // policy root → seedCurrent read
  ],
  bounds: [50, 150],
  inertia: 0.8,
  decimals: 2, // 2dp: cabinet effects (≤0.05/turn) are reabsorbed at a coarser grain — bug #0800
  compute: (ctx) => {
    const childPoverty = ctx.prev["social.childPoverty"] ?? 18;
    const academicPressure = ctx.current["education.academicPressure"] ?? 50; // seedCurrent
    return 90 + spendResp(ctx) * 0.25 - childPoverty * 0.6 + (academicPressure - 50) * 0.2;
  },
};

export const workforceSkillNode: RegistryNode = {
  id: "education.workforceSkill",
  categoryId: "education",
  metricId: "workforceSkill",
  kind: "derived",
  // The TFP hand-off (P2d consumes this). Skill = schooling outcomes + vocational
  // training (apprenticeshipRate, policy root via seedCurrent).
  inputs: [
    "education.highSchoolGradRate",
    "education.testPerformance",
    "education.apprenticeshipRate", // policy root → seedCurrent read
  ],
  bounds: [0, 100],
  inertia: 0.85,
  decimals: 2, // 2dp: cabinet effects (≤0.05/turn) are reabsorbed at a coarser grain — bug #0800
  compute: (ctx) => {
    const gradRate = ctx.current["education.highSchoolGradRate"] ?? 88;
    const testPerf = ctx.current["education.testPerformance"] ?? 100;
    const apprenticeship = ctx.current["education.apprenticeshipRate"] ?? 3; // seedCurrent, 0..8
    return (gradRate - 88) * 0.5 + (testPerf - 100) * 0.4 + apprenticeship * 3 + 50;
  },
};

const gcseAttainmentNode: RegistryNode = {
  id: "education.gcseAttainment",
  categoryId: "education",
  metricId: "gcseAttainment",
  kind: "derived",
  inputs: [{ spending: "education" }, { lagged: "social.childPoverty" }],
  bounds: [20, 95],
  inertia: 0.8,
  decimals: 1,
  compute: (ctx) => {
    const childPoverty = ctx.prev["social.childPoverty"] ?? 18;
    return 60 + spendResp(ctx) * 0.3 - childPoverty * 0.6;
  },
};

export const universityEnrollmentNode: RegistryNode = {
  id: "education.universityEnrollment",
  categoryId: "education",
  metricId: "universityEnrollment",
  kind: "derived",
  // The single higher-education enrolment metric (collegeEnrollment was
  // merged in). GCSE-driven where a country models GCSE attainment (UK/IE/JP/…);
  // HS-grad-driven in the US — the former collegeEnrollment model — so US states
  // keep their meaningful ~78 series instead of collapsing to the GCSE fallback.
  inputs: ["education.gcseAttainment", "education.highSchoolGradRate"],
  bounds: [0, 100],
  inertia: 0.8,
  // 2dp: inherited from the merged-in collegeEnrollment node — the US education
  // secretary's tier effects (±0.01–0.02/turn) are reabsorbed at a coarser
  // grain (; regressed by the merge which dropped the 2dp).
  decimals: 2,
  compute: (ctx) => {
    if (ctx.countryId === "US") {
      const gradRate = ctx.current["education.highSchoolGradRate"] ?? 88;
      // Anchor 55 (the former collegeEnrollment equilibrium) keeps the
      // downstream socialMobility center (55) at zero deviation.
      return (gradRate - 88) * 0.8 + 55;
    }
    const attainment = ctx.current["education.gcseAttainment"] ?? 60;
    return (attainment - 60) * 0.7 + 40;
  },
};

/**
 * Education derived nodes, registered in `METRIC_REGISTRY` (registry/index.ts).
 * Topo order within the tier: gradRate → literacy; testPerf + gradRate →
 * workforceSkill; {gcseAttainment, gradRate} → universityEnrollment.
 */
export const EDUCATION_NODES: RegistryNode[] = [
  highSchoolGradRateNode,
  literacyRateNode,
  testPerformanceNode,
  workforceSkillNode,
  gcseAttainmentNode,
  universityEnrollmentNode,
];
