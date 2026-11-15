import { fundingResponse } from "../spendingChannel";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { EngineNodeContext, RegistryNode } from "../types";
import type { SectorRevenueTaxPayload } from "./economic";

/**
 * Environment tier (P3c) — carbonEmissions is driven by the REAL sector mix
 * (the sectorRevenueTax provider, extended with sectorType) plus the
 * renewable-energy root and the environment spending channel; airQuality
 * follows carbon/urbanization/renewables and feeds lifeExpectancy through the
 * P2b lagged edge (sign fixed in P3c Task 1 — AQI is LOWER-is-better).
 * Roots (renewableEnergy, recyclingRate, climateResilience, protectedLand,
 * naturalDisasterPreparedness, nuclearSafety) stay policy-driven.
 *
 * Reference anchors: carbon 12 t/cap (THRESHOLDS [3,25]), AQI 44 ([8,80]),
 * renewables 25, resilience 60. Constants are first-pass directional — the
 * standing balance pass owns magnitudes.
 */

/** Relative CO2 intensity per unit revenue, by sector class. */
export const CARBON_INTENSITY: Record<OperatingSectorType, number> = {
  energy: 3,
  extraction: 3,
  chemical_industries: 2.5,
  manufacturing: 2,
  manufacturing_vehicles: 2,
  logistics: 2,
  construction: 1.5,
  agriculture: 1.5,
  defense: 1.5,
  retail: 0.7,
  healthcare: 0.7,
  telecommunications: 0.5,
  real_estate: 0.5,
  media_entertainment: 0.5,
  technology: 0.4,
  financial: 0.3,
  media: 0.3,
};

/** A mixed reference economy's revenue-weighted intensity. */
export const REFERENCE_MIX_INTENSITY = 1.4;

/**
 * Per-capita environment spend at which the channel reaches half its max response.
 *
 * US environment spend is 100% bill-driven (no `budget.byCategory.environment`
 * baseline line exists), so the realistic per-capita range comes from the
 * environment bills in legislationTypes.ts. Default 2019 enacted positions give a
 * BASELINE of ~$108/capita; MAX achievable is ~$743/capita.
 *
 * half-sat=200 gives ~35% response at the $108 baseline and ~79% at the $743
 * ceiling. A lower value saturated the response at baseline, so a policy bill
 * moving spend within its real range barely moved the metric. DE's structural
 * baseline (~$474/capita) sits at ~70% response, still short of full saturation.
 */
export const ENV_SPEND_HALF_SAT = 200;

type SectorRow = { revenue: number; sectorType?: OperatingSectorType };

/**
 * Revenue-weighted mean carbon intensity of a state's sector mix. Untyped rows
 * (legacy docs predating the sectorType projection) count at the reference
 * intensity; no rows at all → reference (the node anchors).
 */
export function mixIntensity(rows: SectorRow[]): number {
  let revenue = 0;
  let weighted = 0;
  for (const row of rows) {
    const rev = Number.isFinite(row.revenue) ? Math.max(0, row.revenue) : 0;
    if (rev <= 0) continue;
    const intensity = row.sectorType ? CARBON_INTENSITY[row.sectorType] : REFERENCE_MIX_INTENSITY;
    revenue += rev;
    weighted += rev * (intensity ?? REFERENCE_MIX_INTENSITY);
  }
  return revenue > 0 ? weighted / revenue : REFERENCE_MIX_INTENSITY;
}

function sectorRows(ctx: EngineNodeContext): SectorRow[] {
  const p = ctx.providers["sectorRevenueTax"] as SectorRevenueTaxPayload | undefined;
  return p ? [...p.owned, ...p.unowned] : [];
}

const envResp = (ctx: EngineNodeContext): number =>
  fundingResponse(ctx.spending["environment"] ?? 0, ENV_SPEND_HALF_SAT, 100); // 0..100

export const carbonEmissionsNode: RegistryNode = {
  id: "environment.carbonEmissions",
  categoryId: "environment",
  metricId: "carbonEmissions",
  kind: "derived",
  // Tons CO2 per capita, LOWER is better. The sector mix sets the structural
  // level; renewables decarbonize the grid; environment spend (efficiency,
  // abatement programs) trims the rest.
  inputs: [
    { provider: "sectorRevenueTax" },
    "environment.renewableEnergy",
    { spending: "environment" },
  ],
  bounds: [0, 60],
  inertia: 0.93,
  decimals: 2, // 2dp: cabinet effects (≤0.05/turn) are reabsorbed at a coarser grain — bug #0800
  compute: (ctx) => {
    const mix = mixIntensity(sectorRows(ctx));
    const renewables = ctx.current["environment.renewableEnergy"] ?? 25; // %, root
    return 12 * (mix / REFERENCE_MIX_INTENSITY) - (renewables - 25) * 0.1 - envResp(ctx) * 0.02;
  },
};

export const airQualityNode: RegistryNode = {
  id: "environment.airQuality",
  categoryId: "environment",
  metricId: "airQuality",
  kind: "derived",
  // AQI, LOWER is better (THRESHOLDS best 8 / worst 80). carbon is a same-turn
  // topo edge; urbanization and renewables are seedCurrent roots.
  inputs: [
    "environment.carbonEmissions",
    "population.urbanizationRate",
    "environment.renewableEnergy",
  ],
  bounds: [0, 100],
  inertia: 0.85,
  // 2dp storage — slow carbon drift AND cabinet effects (≤0.05/turn) step below a
  // 1dp half-grain, where policy-delta preservation reabsorbs them every turn
  // (the P2c rounding-plateau class).
  decimals: 2,
  compute: (ctx) => {
    const carbon = ctx.current["environment.carbonEmissions"] ?? 12;
    const urban = ctx.current["population.urbanizationRate"] ?? 55;
    const renewables = ctx.current["environment.renewableEnergy"] ?? 25;
    return 44 + (carbon - 12) * 1.6 + (urban - 55) * 0.25 - (renewables - 25) * 0.15;
  },
};

export const energyTransitionProgressNode: RegistryNode = {
  id: "environment.energyTransitionProgress",
  categoryId: "environment",
  metricId: "energyTransitionProgress",
  kind: "derived",
  // Index aligned with the uniform-seed derivation (renewables + 10); env
  // spending (grid programs, subsidies) pushes the transition ahead of the
  // raw renewable share. NOT a path-dependent trajectory — named for balance.
  inputs: ["environment.renewableEnergy", { spending: "environment" }],
  bounds: [0, 100],
  inertia: 0.9,
  decimals: 1,
  compute: (ctx) => (ctx.current["environment.renewableEnergy"] ?? 25) + 10 + envResp(ctx) * 0.08,
};

// UK-origin metric, uniform-seeded across countries (the persist gate scopes
// it to docs that store it).
export const floodRiskNode: RegistryNode = {
  id: "environment.floodRisk",
  categoryId: "environment",
  metricId: "floodRisk",
  kind: "derived",
  // % of properties at significant flood risk, LOWER is better — aligned with
  // the uniform-seed derivation (18 − resilience·0.12): resilience investment
  // (defenses, planning) is the lever; the 18 is the exogenous climate floor.
  inputs: ["environment.climateResilience"],
  bounds: [1, 30],
  inertia: 0.9,
  decimals: 1,
  compute: (ctx) => 18 - (ctx.current["environment.climateResilience"] ?? 60) * 0.12,
};

// IE-only seed (not uniform-seeded) — the persist gate scopes it.
export const agriEmissionsShareNode: RegistryNode = {
  id: "environment.agriEmissionsShare",
  categoryId: "environment",
  metricId: "agriEmissionsShare",
  kind: "derived",
  // Agriculture's share of modeled (intensity-weighted) sector emissions.
  // No sector data → the IE seed anchor (38%, EPA-2023-flavored).
  inputs: [{ provider: "sectorRevenueTax" }],
  bounds: [0, 100],
  inertia: 0.9,
  decimals: 1,
  compute: (ctx) => {
    const rows = sectorRows(ctx);
    let total = 0;
    let agri = 0;
    for (const row of rows) {
      const rev = Number.isFinite(row.revenue) ? Math.max(0, row.revenue) : 0;
      if (rev <= 0) continue;
      const intensity = row.sectorType
        ? (CARBON_INTENSITY[row.sectorType] ?? REFERENCE_MIX_INTENSITY)
        : REFERENCE_MIX_INTENSITY;
      const emissions = rev * intensity;
      total += emissions;
      if (row.sectorType === "agriculture") agri += emissions;
    }
    return total > 0 ? (agri / total) * 100 : 38;
  },
};

/** Environment tier nodes (P3c). */
export const ENVIRONMENT_NODES: RegistryNode[] = [
  carbonEmissionsNode,
  airQualityNode,
  energyTransitionProgressNode,
  floodRiskNode,
  agriEmissionsShareNode,
];
