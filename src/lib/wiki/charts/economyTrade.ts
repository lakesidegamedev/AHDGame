import { COMMAND_CEILING, DUAL_TRACK_CEILING, MARKET_LEVEL } from "@/lib/constants/commandEconomy";
import { MARKETIZATION_SCHEDULE } from "@/lib/constants/marketizationSchedule";
import { TRADE_EMBARGO_EXPORT_LOSS_SHARE } from "@/lib/trade/constants";
import { range, round } from "./economyHelpers";
import type { WikiChartBuilder, WikiChartSpec } from "./types";

// ── Embargoes ───────────────────────────────────────────────────────────────

export function buildEmbargoRevenueKept(): WikiChartSpec {
  const exposure = range(0, 100, 10);
  return {
    title: "Revenue kept under a full embargo",
    kind: "line",
    xLabel: "Share of the sector's revenue that comes from exports (%)",
    yLabel: "Revenue kept (%)",
    unit: "%",
    series: [
      {
        name: "Remaining sector revenue",
        points: exposure.map((x): [number, number] => [
          x,
          round(100 * (1 - (x / 100) * TRADE_EMBARGO_EXPORT_LOSS_SHARE), 2),
        ]),
      },
    ],
    caption:
      "Only the export part of a sector's revenue is lost. Domestic sales carry on, so exporters are hurt most.",
  };
}

// ── Command economies: the marketization dial ───────────────────────────────

const CHART_FIRST_YEAR = 1950;
const CHART_LAST_YEAR = 2030;

function marketizationSteps(country: keyof typeof MARKETIZATION_SCHEDULE): [number, number][] {
  const steps = MARKETIZATION_SCHEDULE[country] ?? [];
  const points: [number, number][] = [];
  let start = CHART_FIRST_YEAR;
  for (const step of steps) {
    points.push([start, step.level]);
    start = step.throughYear + 1;
  }
  points.push([start, MARKET_LEVEL]);
  points.push([CHART_LAST_YEAR, MARKET_LEVEL]);
  return points;
}

export function buildMarketizationSchedule(): WikiChartSpec {
  return {
    title: "Marketization by era: how planned economies open up",
    kind: "step",
    xLabel: "Year",
    yLabel: "Marketization level (0 fully planned, 100 fully market)",
    series: [
      { name: "Russia (Soviet Union)", points: marketizationSteps("RU") },
      { name: "China", points: marketizationSteps("CN") },
      { name: "Yugoslavia", points: marketizationSteps("YU") },
      { name: "Poland", points: marketizationSteps("PL") },
    ],
    markers: [
      { y: COMMAND_CEILING, label: "Below this: fully command economy" },
      { y: DUAL_TRACK_CEILING, label: "From here up: market economy (dual-track in between)" },
    ],
    caption:
      "A country's starting level follows its era. Below the lower line everything is planned, between the lines plan and market run side by side, and above the upper line the normal market engine applies.",
  };
}

export const ECONOMY_TRADE_CHARTS: Record<string, WikiChartBuilder> = {
  "embargo-revenue-kept": buildEmbargoRevenueKept,
  "marketization-schedule-by-country": buildMarketizationSchedule,
};
