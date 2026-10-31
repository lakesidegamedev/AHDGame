import { unionPremium, UNION_PREMIUM_MAX_PCT } from "@/lib/labour/unionization";
import { STRIKE_UNIONIZATION_THRESHOLD } from "@/lib/labour/strikes";
import {
  WAGE_LEVEL_MAX,
  WAGE_LEVEL_MIN,
  computeSectorLaborCost,
  getSectorLaborShare,
} from "@/lib/labour/laborCost";
import { range, round } from "./economyHelpers";
import type { WikiChartBuilder, WikiChartSpec } from "./types";

// ── Unions: standing labour premium ─────────────────────────────────────────

export function buildUnionPremium(): WikiChartSpec {
  return {
    title: "Labour premium from unionization",
    kind: "line",
    xLabel: "Unionization (0 to 100)",
    yLabel: "Added labour cost (percentage points)",
    unit: "points",
    series: [
      {
        name: "Standing labour premium",
        points: range(0, 100, 5).map((u): [number, number] => [u, round(unionPremium(u), 2)]),
      },
    ],
    markers: [{ x: STRIKE_UNIONIZATION_THRESHOLD, label: "Strikes become possible" }],
    caption: `The premium grows in a straight line up to ${UNION_PREMIUM_MAX_PCT} points at full unionization, every turn, whether or not a strike happens.`,
  };
}

// ── Labour and wages: margin change against wage level ──────────────────────

export function buildWageLevelMargin(): WikiChartSpec {
  const sectors = [
    ["technology", "Technology"],
    ["manufacturing", "Manufacturing"],
    ["energy", "Energy"],
  ] as const;
  const levels = range(WAGE_LEVEL_MIN, WAGE_LEVEL_MAX, 0.05);
  return {
    title: "Sector margin against the wage level you pay",
    kind: "line",
    xLabel: "Wage level (1.0 is the baseline)",
    yLabel: "Margin change (percentage points)",
    unit: "points",
    series: sectors.map(([sector, name]) => ({
      name,
      points: levels.map((level): [number, number] => {
        const cost = computeSectorLaborCost({
          hourlyRevenue: 100,
          grossMaintenance: 100,
          laborShare0: getSectorLaborShare(sector),
          wageMultiplier: level,
        });
        return [level, round(-(cost.maintenance - 100), 2)];
      }),
    })),
    markers: [{ x: 1, label: "Baseline wages" }],
    caption:
      "Paying below baseline lifts margin now, paying above lowers it. The more labour-intensive the sector, the harder the swing.",
  };
}

export const ECONOMY_LABOUR_CHARTS: Record<string, WikiChartBuilder> = {
  "union-labour-premium": buildUnionPremium,
  "wage-level-margin-change": buildWageLevelMargin,
};
