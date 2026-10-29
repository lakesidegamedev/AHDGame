import type { WikiChartBuilder, WikiChartMarker, WikiChartSpec } from "./types";
import { range, round } from "./economyHelpers";
import { DEBT_THRESHOLDS, getDebtThreshold } from "@/lib/budget/debt";
import { calculateBondMarketPrice } from "@/lib/constants/bonds";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";

/** Debt-to-GDP samples (as ratios) used by the rating ladder charts. */
const LADDER_RATIOS = range(0, 3, 0.02);

function ladderPoints(
  pick: (t: ReturnType<typeof getDebtThreshold>) => number
): [number, number][] {
  return LADDER_RATIOS.map((r): [number, number] => [round(r * 100, 2), pick(getDebtThreshold(r))]);
}

function negate(v: number): number {
  return v === 0 ? 0 : -v;
}

function ladderMarkers(): WikiChartMarker[] {
  const out: WikiChartMarker[] = [];
  for (const t of DEBT_THRESHOLDS) {
    if (Number.isFinite(t.maxRatio))
      out.push({ x: round(t.maxRatio * 100, 2), label: `${t.rating} ends` });
  }
  return out;
}

const creditRatingLadder: WikiChartBuilder = (): WikiChartSpec => ({
  title: "Credit rating, borrowing rate and public trust",
  kind: "step",
  xLabel: "Debt as a share of GDP",
  yLabel: "Borrowing rate",
  unit: "%",
  y2Label: "Public trust hit",
  y2Unit: "points",
  series: [
    { name: "Borrowing rate", points: ladderPoints((t) => round(t.interestRate * 100, 2)) },
    {
      name: "Public trust hit",
      axis: "right",
      points: ladderPoints((t) => negate(t.trustPenalty)),
    },
  ],
  markers: ladderMarkers(),
  caption:
    "Each rating band has its own borrowing rate. Lines mark where each rating ends (AAA at the left, CCC beyond the last line).",
});

const sovereignBondRatingTiers: WikiChartBuilder = (): WikiChartSpec => ({
  title: "Rating tiers: interest rate and growth penalty",
  kind: "step",
  xLabel: "Debt as a share of GDP",
  yLabel: "Interest rate",
  unit: "%",
  y2Label: "GDP growth penalty",
  y2Unit: "points",
  series: [
    { name: "Interest rate", points: ladderPoints((t) => round(t.interestRate * 100, 2)) },
    {
      name: "GDP growth penalty",
      axis: "right",
      points: ladderPoints((t) => negate(t.gdpPenalty)),
    },
  ],
  markers: ladderMarkers(),
  caption:
    "Heavier debt moves a country into worse tiers, with higher rates and a drag on growth. Lines mark where each rating ends.",
});

const corporateBondPriceByRate: WikiChartBuilder = () => {
  const coupon = 8.75;
  const rates = range(1, 15, 0.5);
  const years = [7, 3, 1];
  return {
    title: "Corporate bond price against market rate",
    kind: "line",
    xLabel: "Current market rate",
    yLabel: "Price (1.0 = face value)",
    unit: "x face",
    series: years.map((y) => ({
      name: `${y} ${y === 1 ? "year" : "years"} left`,
      points: rates.map((r): [number, number] => [
        r,
        calculateBondMarketPrice(coupon, r, y * TURNS_PER_YEAR, false),
      ]),
    })),
    markers: [{ x: coupon, label: "Rate equals coupon: price at face value" }],
    caption:
      "An 8.75% coupon bond. Price falls as rates rise, and the closer to maturity, the less it moves.",
  };
};

const sovereignBondPriceByPrime: WikiChartBuilder = () => {
  const coupon = 3;
  const primes = range(0, 12, 0.5);
  const turnsLeft = [48, 24, 6];
  return {
    title: "Sovereign bond price against prime rate",
    kind: "line",
    xLabel: "Prime rate",
    yLabel: "Price (1.0 = face value)",
    unit: "x face",
    series: turnsLeft.map((n) => ({
      name: `${n} turns left`,
      points: primes.map((p): [number, number] => [
        p,
        calculateBondMarketPrice(coupon, p, n, false),
      ]),
    })),
    markers: [{ x: coupon, label: "Prime equals coupon: price at face value" }],
    caption:
      "A 3% coupon bond. Rising prime rates cut the price, and bonds near maturity barely move.",
  };
};

export const ECONOMY_DEBT_CHARTS: Record<string, WikiChartBuilder> = {
  "credit-rating-borrowing-ladder": creditRatingLadder,
  "sovereign-bond-rating-tiers": sovereignBondRatingTiers,
  "corporate-bond-price-by-market-rate": corporateBondPriceByRate,
  "sovereign-bond-price-by-prime-rate": sovereignBondPriceByPrime,
};
