import type { WikiChartBuilder } from "./types";
import { range, round } from "./economyHelpers";
import {
  getDebtToGdpMarginModifier,
  getDeficitToGdpMarginModifier,
  DEFICIT_MARGIN_MAX_BONUS,
} from "@/lib/constants/corporations";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { advanceHouseholdPriceIndex } from "@/lib/economy/rules/householdPriceIndex";
import {
  DEFAULT_GUARD_DROP_PCT,
  DEFAULT_GUARD_GRACE_TURNS,
} from "@/lib/market/launchGuardConstants";

const debtMarginModifier: WikiChartBuilder = () => ({
  title: "National debt and corporate margins",
  kind: "line",
  xLabel: "Debt as a share of GDP",
  yLabel: "Margin effect on every firm",
  unit: "points",
  series: [
    {
      name: "Debt drag",
      points: range(0, 200, 5).map((d): [number, number] => [
        d,
        round(getDebtToGdpMarginModifier(d / 100)),
      ]),
    },
  ],
  caption:
    "No effect up to half of GDP, then a steepening drag that is floored once debt gets very large.",
});

const deficitMarginModifier: WikiChartBuilder = () => ({
  title: "Deficit spending and corporate margins",
  kind: "line",
  xLabel: "Deficit as a share of GDP",
  yLabel: "Margin effect on every firm",
  unit: "points",
  series: [
    {
      name: "Deficit stimulus",
      points: range(0, 12, 0.5).map((d): [number, number] => [
        d,
        round(getDeficitToGdpMarginModifier(-d / 100)),
      ]),
    },
  ],
  markers: [{ y: DEFICIT_MARGIN_MAX_BONUS, label: "Maximum stimulus" }],
  caption: "Running a deficit lifts margins, up to a cap.",
});

const householdPriceIndexChart: WikiChartBuilder = () => {
  const years = 10;
  const line = (inflation: number): [number, number][] => {
    let index = 1;
    const pts: [number, number][] = [[0, 100]];
    for (let t = 1; t <= years * TURNS_PER_YEAR; t++) {
      index = advanceHouseholdPriceIndex(index, inflation);
      if (t % (TURNS_PER_YEAR / 4) === 0) pts.push([t / TURNS_PER_YEAR, round(index * 100, 2)]);
    }
    return pts;
  };
  return {
    title: "Household price index over ten years",
    kind: "line",
    xLabel: "Game years",
    yLabel: "Household price index (start = 100)",
    unit: "index",
    series: [
      { name: "Inflation 2%", points: line(2) },
      { name: "Inflation 5%", points: line(5) },
      { name: "Inflation 8%", points: line(8) },
    ],
    caption: "Household prices follow only part of headline inflation, so they lag it.",
  };
};

const marketGuardTrip: WikiChartBuilder = () => {
  const pts = range(0, 40, 1).map((t): [number, number] => [t, round(100 - 1.25 * t, 2)]);
  const fundamentals = range(0, 40, 1).map((t): [number, number] => [t, 100]);
  return {
    title: "When the market safeguard trips",
    kind: "line",
    xLabel: "Turns since the guard was armed",
    yLabel: "Share of reference value",
    unit: "%",
    series: [
      { name: "Market value (example of a break)", points: pts },
      { name: "Value implied by fundamentals", points: fundamentals },
    ],
    markers: [
      { y: 100 * (1 - DEFAULT_GUARD_DROP_PCT), label: "Trip line" },
      { x: DEFAULT_GUARD_GRACE_TURNS, label: "Grace window ends (no trips before this)" },
    ],
    caption:
      "The guard steps the market down a tier when prices fall past the trip line relative to fundamentals, after the grace window.",
  };
};

export const ECONOMY_MARGIN_CHARTS: Record<string, WikiChartBuilder> = {
  "debt-to-gdp-corporate-margin-effect": debtMarginModifier,
  "deficit-corporate-margin-effect": deficitMarginModifier,
  "household-price-index-by-inflation": householdPriceIndexChart,
  "market-guard-trip-line": marketGuardTrip,
};
