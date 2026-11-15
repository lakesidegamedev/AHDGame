import { fundingResponse } from "../spendingChannel";
import type { EngineNodeContext, RegistryNode } from "../types";
import { LIFE_EXPECTANCY_MID, PREVENTABLE_MORTALITY_MID } from "@/lib/demographics/flows/mortality";

/**
 * Healthcare outcome nodes (spec P2b 4.2), live via generic phase wiring.
 * Cold-start is parity-preserving: the seed governs LEVEL, these formulas
 * govern RESPONSE to spending/access/demand. Constants are first-pass
 * directional; per-phase balance tunes magnitudes.
 *
 * Roots NOT animated (seedCurrent reads): uninsuredRate, publicHealthPreparedness,
 * slaintecareProgress.
 *
 * Elder demand uses population.dependencyRatio, a real demographic output.
 *
 * Mortality loop: lifeExpectancy + preventableMortality feed the demographic
 * phase's healthcareMortalityModifier. Both are inertia-smoothed and the
 * modifier is clamped [0.7,1.4]; the sim test asserts convergence.
 */

// Per-capita healthcare spend at which the channel reaches half its max response.
//
// spendingProvider sums federal + state per-capita spend in real dollars, which
// reaches $0 (fully defunded) to ~$9.5k/capita (fully maximized) across
// healthcare legislation. A small half-saturation point pins every region near
// max response regardless of budget posture, so healthcare bills never move
// outcomes. 4000 sits near the middle of the achievable range (below the ~$5.8k
// policy-default baseline, leaving room to climb), giving a meaningful slope
// across the range a player can actually reach.
//
// KNOWN LIMITATION: single GLOBAL constant, but per-capita costs in non-US
// per-country legislation seed files are in LOCAL CURRENCY UNITS with no USD
// normalization, so a USD-scale half-sat may under/over-saturate other
// countries. Flag for a per-country/currency-normalized constant.
const HEALTH_SPEND_HALF_SAT = 4000;

const spendResp = (ctx: EngineNodeContext): number =>
  fundingResponse(ctx.spending["healthcare"] ?? 0, HEALTH_SPEND_HALF_SAT, 100); // 0..100

export const physicianRateNode: RegistryNode = {
  id: "healthcare.physicianRate",
  categoryId: "healthcare",
  metricId: "physicianRate",
  kind: "derived",
  // Capacity stock — builds/erodes slowly with sustained funding (per 1k scale).
  inputs: [{ spending: "healthcare" }],
  bounds: [0, 20],
  inertia: 0.95,
  decimals: 2,
  compute: (ctx) => 1 + (spendResp(ctx) / 100) * 4.5, // 0 spend → 1/1k … saturating → ~5.5/1k
};

export const affordabilityIndexNode: RegistryNode = {
  id: "healthcare.affordabilityIndex",
  categoryId: "healthcare",
  metricId: "affordabilityIndex",
  kind: "derived",
  inputs: [{ spending: "healthcare" }, "healthcare.uninsuredRate", "economic.costOfLiving"],
  bounds: [0, 100],
  inertia: 0.8,
  decimals: 2, // 2dp: cabinet effects (≤0.05/turn) are reabsorbed at a coarser grain — bug #0800
  compute: (ctx) => {
    const uninsured = ctx.current["healthcare.uninsuredRate"] ?? 10; // seedCurrent, 0-25%
    const costOfLiving = ctx.current["economic.costOfLiving"] ?? 100; // index, 100 = avg
    return 60 + spendResp(ctx) * 0.3 - uninsured * 1.2 - (costOfLiving - 100) * 0.15;
  },
};

export const preventableMortalityNode: RegistryNode = {
  id: "healthcare.preventableMortality",
  categoryId: "healthcare",
  metricId: "preventableMortality",
  kind: "derived",
  // Per 100k; LOWER is better. Access (physicians, coverage) and preparedness
  // push it down; poverty (lagged — Social/economic tier not yet animated) up.
  inputs: [
    "healthcare.physicianRate",
    "healthcare.uninsuredRate",
    "healthcare.publicHealthPreparedness",
    { lagged: "economic.povertyRate" },
  ],
  bounds: [0, 1000],
  inertia: 0.85,
  decimals: 2, // 2dp: cabinet effects (≤0.05/turn) are reabsorbed at a coarser grain — bug #0800
  compute: (ctx) => {
    const physicians = ctx.current["healthcare.physicianRate"] ?? 2.5; // per 1k
    const uninsured = ctx.current["healthcare.uninsuredRate"] ?? 10; // %
    const preparedness = ctx.current["healthcare.publicHealthPreparedness"] ?? 50; // 0-100
    const poverty = ctx.prev["economic.povertyRate"] ?? 13; // lagged, %
    return (
      300 - (physicians - 2.5) * 40 + uninsured * 6 - (preparedness - 50) * 1.2 + (poverty - 13) * 8
    );
  },
};

export const lifeExpectancyNode: RegistryNode = {
  id: "healthcare.lifeExpectancy",
  categoryId: "healthcare",
  metricId: "lifeExpectancy",
  kind: "derived",
  // YEARS — slow-moving stock; the demographic mortality input.
  // Bounds must span every ERA, not just the modern Western slice. [70,85]
  // was a US-2019 assumption that evalNode applied every turn: after
  // metricDefinitions.minValue was widened 70→35, ahd_sim_preflightfx still
  // showed world-wide min LE exactly 70.0 (China 43, Nigeria ~50, Turkey 44–48
  // all snapped to 70; Sweden 72 survived). Match metricDefinitions [35,90].
  inputs: [
    "healthcare.physicianRate",
    "healthcare.preventableMortality",
    "healthcare.affordabilityIndex",
    { lagged: "environment.airQuality" },
    { lagged: "economic.povertyRate" },
  ],
  bounds: [35, 90],
  inertia: 0.92,
  // 2dp storage (P3c): the lagged airQuality term steps ~0.02 yr/turn — below
  // 1dp's half-grain, where policy-delta preservation reabsorbs every step
  // (the P2c rounding-plateau class) and the air→life edge dies.
  decimals: 2,
  compute: (ctx) => {
    const physicians = ctx.current["healthcare.physicianRate"] ?? 2.5;
    const preventable = ctx.current["healthcare.preventableMortality"] ?? PREVENTABLE_MORTALITY_MID; // per 100k
    const affordability = ctx.current["healthcare.affordabilityIndex"] ?? 50; // 0-100
    // AQI semantics: LOWER airQuality is better (THRESHOLDS best 8 / worst 80,
    // mid 44). The P2b first pass had the sign inverted (treated it as a
    // higher-is-better quality index) — harmless while the input was a static
    // seed read, fixed before P3c animates it.
    const airQuality = ctx.prev["environment.airQuality"] ?? 44; // lagged AQI
    const poverty = ctx.prev["economic.povertyRate"] ?? 13; // lagged, %
    return (
      LIFE_EXPECTANCY_MID +
      (physicians - 2.5) * 0.6 -
      (preventable - PREVENTABLE_MORTALITY_MID) * 0.012 +
      (affordability - 50) * 0.03 -
      // ~2.5 years across the full clean↔smog AQI span (≈50 points) — the
      // epidemiological ballpark; 0.02 was sub-grain (plateau) even at 2dp.
      (airQuality - 44) * 0.05 -
      (poverty - 13) * 0.08
    );
  },
};

const mentalHealthAccessNode: RegistryNode = {
  id: "healthcare.mentalHealthAccess",
  categoryId: "healthcare",
  metricId: "mentalHealthAccess",
  kind: "derived",
  // Bounds must span every ERA. [5,95] floor snapped NG NORTH_WEST's authored
  // 3 up to 5 on turn 1. Match metricDefinitions [0,95].
  inputs: [{ spending: "healthcare" }, "healthcare.physicianRate"],
  bounds: [0, 95],
  inertia: 0.8,
  decimals: 2, // 2dp: cabinet effects (≤0.05/turn) are reabsorbed at a coarser grain — bug #0800
  compute: (ctx) => {
    const physicians = ctx.current["healthcare.physicianRate"] ?? 2.5;
    return 25 + spendResp(ctx) * 0.25 + (physicians - 2.5) * 4;
  },
};

export const elderCareQualityNode: RegistryNode = {
  id: "healthcare.elderCareQuality",
  categoryId: "healthcare",
  metricId: "elderCareQuality",
  kind: "derived",
  // Capacity (spend) vs elder DEMAND (dependency ratio, ~0.4-0.9).
  inputs: [{ spending: "healthcare" }, "population.dependencyRatio"],
  bounds: [0, 100],
  inertia: 0.85,
  decimals: 2, // 2dp: cabinet effects (≤0.05/turn) are reabsorbed at a coarser grain — bug #0800
  compute: (ctx) => {
    const dependency = ctx.current["population.dependencyRatio"] ?? 0.6;
    return 55 + spendResp(ctx) * 0.35 - (dependency - 0.6) * 60;
  },
};

export const nhsWaitingTimeNode: RegistryNode = {
  id: "healthcare.nhsWaitingTime",
  categoryId: "healthcare",
  metricId: "nhsWaitingTime",
  kind: "derived",
  // UK: weeks; LOWER is better. Capacity (spend) shortens; aging demand lengthens.
  inputs: [{ spending: "healthcare" }, "population.dependencyRatio"],
  bounds: [1, 52],
  inertia: 0.8,
  decimals: 1,
  compute: (ctx) => {
    const dependency = ctx.current["population.dependencyRatio"] ?? 0.6;
    return 22 - spendResp(ctx) * 0.18 + (dependency - 0.6) * 40;
  },
};

const socialCareQualityNode: RegistryNode = {
  id: "healthcare.socialCareQuality",
  categoryId: "healthcare",
  metricId: "socialCareQuality",
  kind: "derived",
  // Bounds must span every ERA. [10,100] floor snapped NG NORTH_WEST's authored
  // 8 up to 10 on turn 1. Match metricDefinitions [0,100].
  inputs: [{ spending: "healthcare" }, "population.dependencyRatio"],
  bounds: [0, 100],
  inertia: 0.85,
  decimals: 1,
  compute: (ctx) => {
    const dependency = ctx.current["population.dependencyRatio"] ?? 0.6;
    return 50 + spendResp(ctx) * 0.35 - (dependency - 0.6) * 50;
  },
};

export const hseWaitingListMonthsNode: RegistryNode = {
  id: "healthcare.hseWaitingListMonths",
  categoryId: "healthcare",
  metricId: "hseWaitingListMonths",
  kind: "derived",
  // IE: months; LOWER is better. slaintecareProgress (reform root) also relieves.
  inputs: [
    { spending: "healthcare" },
    "population.dependencyRatio",
    "healthcare.slaintecareProgress",
  ],
  bounds: [0, 60],
  inertia: 0.8,
  decimals: 2, // 2dp: cabinet effects (≤0.05/turn) are reabsorbed at a coarser grain — bug #0800
  compute: (ctx) => {
    const dependency = ctx.current["population.dependencyRatio"] ?? 0.6;
    const slaintecare = ctx.current["healthcare.slaintecareProgress"] ?? 30; // reform root, 0-100
    return 16 - spendResp(ctx) * 0.1 + (dependency - 0.6) * 30 - (slaintecare - 30) * 0.08;
  },
};

/**
 * Healthcare derived nodes, registered in `METRIC_REGISTRY`. Topo within tier:
 * physicianRate → {preventableMortality, mentalHealthAccess};
 * {physicianRate, preventableMortality, affordabilityIndex} → lifeExpectancy.
 * Country-specific nodes (nhsWaitingTime UK, hse/slaintecare IE) are safe to
 * register globally — the persist gate only writes metrics a region stores.
 */
export const HEALTHCARE_NODES: RegistryNode[] = [
  physicianRateNode,
  affordabilityIndexNode,
  preventableMortalityNode,
  lifeExpectancyNode,
  mentalHealthAccessNode,
  elderCareQualityNode,
  nhsWaitingTimeNode,
  socialCareQualityNode,
  hseWaitingListMonthsNode,
];
