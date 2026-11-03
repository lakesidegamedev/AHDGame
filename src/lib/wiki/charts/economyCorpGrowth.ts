import {
  calcMarketingGrowth,
  calcRdScoreAfterTurn,
  getSprawlModifier,
  LOGISTICS_MAX_SPRAWL_EFFECT,
  MARKETING_DIMINISHING_THRESHOLD,
  SPRAWL_SECTOR_THRESHOLD,
} from "@/lib/constants/corporations";
import {
  MARKETING_DECAY_RATE,
  STRENGTH_UPKEEP_STAGE,
  marketingStrengthAfterTurn,
} from "@/lib/corporations/strengthUpkeep";
import type { WikiChartBuilder, WikiChartSpec } from "./types";

const round = (n: number, dp = 4) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const range = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  const n = Math.round((to - from) / step);
  for (let i = 0; i <= n; i++) out.push(round(from + i * step, 6));
  return out;
};

// ── Corporations: marketing strength over time ──────────────────────────────

export function buildMarketingStrengthOverTime(): WikiChartSpec {
  const TURNS = 100;
  const START = 50;
  const simulate = (dailyBudget: number): [number, number][] => {
    let ms = START;
    const points: [number, number][] = [[0, ms]];
    for (let t = 1; t <= TURNS; t++) {
      ms = marketingStrengthAfterTurn(
        ms,
        calcMarketingGrowth(dailyBudget, ms),
        STRENGTH_UPKEEP_STAGE.MARKETING_DECAY
      );
      points.push([t, round(ms, 2)]);
    }
    return points;
  };
  return {
    title: "Marketing Strength over 100 turns",
    kind: "line",
    xLabel: "Turns",
    yLabel: "Marketing Strength",
    series: [
      { name: "No marketing spend", points: simulate(0) },
      { name: "Steady delivered spend of 100,000 per day", points: simulate(100_000) },
      { name: "Steady delivered spend of 10,000,000 per day", points: simulate(10_000_000) },
    ],
    markers: [
      {
        y: MARKETING_DIMINISHING_THRESHOLD,
        label: "Diminishing returns double above this level",
      },
    ],
    caption: `Strength decays ${round(MARKETING_DECAY_RATE * 100, 1)}% per turn without spending. Each spend level settles at a level where growth only just covers the decay.`,
  };
}

// ── Corporations: logistical sprawl ─────────────────────────────────────────

export function buildLogisticalSprawl(): WikiChartSpec {
  const counts = range(0, 40, 1);
  const line = (logistics: number, secondary: boolean): [number, number][] =>
    counts.map((n): [number, number] => [n, round(getSprawlModifier(n, logistics, secondary), 2)]);
  return {
    title: "Logistical sprawl: margin penalty by number of sectors",
    kind: "step",
    xLabel: "Sectors operated",
    yLabel: "Margin change (percentage points)",
    unit: "points",
    series: [
      { name: "One sector type, no Logistics", points: line(0, false) },
      { name: "With a secondary type, no Logistics", points: line(0, true) },
      {
        name: `With a secondary type, Logistics strength ${LOGISTICS_MAX_SPRAWL_EFFECT}`,
        points: line(LOGISTICS_MAX_SPRAWL_EFFECT, true),
      },
    ],
    markers: [{ x: SPRAWL_SECTOR_THRESHOLD, label: "Penalty starts without Logistics" }],
    caption:
      "A secondary type doubles the penalty. Strong Logistics pushes the start of the penalty out and softens it.",
  };
}

// ── Corporate R&D: score against budget ─────────────────────────────────────

export function buildRdScoreByBudget(): WikiChartSpec {
  const TURNS = 100;
  const START = 20;
  const simulate = (dailyBudget: number): [number, number][] => {
    let score = START;
    const points: [number, number][] = [[0, score]];
    for (let t = 1; t <= TURNS; t++) {
      score = calcRdScoreAfterTurn(score, dailyBudget);
      points.push([t, round(score, 2)]);
    }
    return points;
  };
  const budgets: [number, string][] = [
    [0, "No R&D budget"],
    [50_000, "50,000 per day"],
    [100_000, "100,000 per day"],
    [1_000_000, "1,000,000 per day"],
  ];
  return {
    title: "R&D Score over 100 turns by daily budget",
    kind: "line",
    xLabel: "Turns",
    yLabel: "R&D Score",
    series: budgets.map(([b, name]) => ({ name, points: simulate(b) })),
    caption:
      "Score decays every turn, and growth slows as the score rises, so a bigger budget buys much less than a proportionally bigger score.",
  };
}

export const ECONOMY_CORP_GROWTH_CHARTS: Record<string, WikiChartBuilder> = {
  "marketing-strength-over-time": buildMarketingStrengthOverTime,
  "logistical-sprawl-penalty": buildLogisticalSprawl,
  "rd-score-by-budget": buildRdScoreByBudget,
};
