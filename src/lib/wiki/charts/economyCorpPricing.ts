import {
  COMMODITY_LOG_K,
  COMMODITY_PER_ITEM_CAP,
  COMMODITY_PRICE_DRIFT_RATE,
  COMMODITY_PRESSURE_SOFT_KNEE,
  EXTRACTABLE_PRESSURE_SOFT_KNEE,
  computeEffectiveCommodityPressureRatio,
  computeMarketPrice,
} from "@/lib/constants/commodities";
import {
  FUNDAMENTAL_EARNINGS_POWER_WEIGHT,
  FUNDAMENTAL_GROWTH_PREMIUM_WEIGHT,
  FUNDAMENTAL_TANGIBLE_BOOK_WEIGHT,
  GROWTH_PREMIUM_CAP_BUFFER,
  RD_INNOVATION_SCORE_THRESHOLD,
} from "@/lib/constants/corporations";
import {
  PROSPECT_GOVT_SUCCESS_CHANCE,
  PROSPECT_YIELD_MAX,
  PROSPECT_YIELD_MIN,
  prospectCorpRdMult,
  prospectCorpSuccessChance,
} from "@/lib/constants/prospecting";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { computeSharePrices } from "@/lib/corporations/sharePriceFormula";
import { DEPOSIT_RESERVE_TURNS, depletedCapacityPerTurn } from "@/lib/extraction/depletion";
import {
  blendWeightsForRate,
  domesticMalusForRate,
  foreignMarginModifierForRate,
  splitCaptureMultiplierForRate,
} from "@/lib/tariffs/rules/tariffCurves";
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

// ── Stock market: worked example share price by cost of capital ─────────────

/** The worked example company on the stock market page. Presentation inputs. */
export const SHARE_PRICE_EXAMPLE = {
  totalShares: 10_000_000,
  cash: 2_000_000,
  sectorValue: 6_000_000,
  bondDebt: 1_000_000,
  yearlyEarnings: 1_200_000,
  sectorGrowth: 0.04,
} as const;

/** Per-share components of the worked example at a cost of capital. */
export function sharePriceComponents(costOfCapital: number): {
  book: number;
  earningsPower: number;
  growthPremium: number;
} {
  const e = SHARE_PRICE_EXAMPLE;
  const bookPerShare = (e.cash + e.sectorValue - e.bondDebt) / e.totalShares;
  const earningsPerShare = e.yearlyEarnings / costOfCapital / e.totalShares;
  const g = Math.min(e.sectorGrowth, costOfCapital - GROWTH_PREMIUM_CAP_BUFFER);
  const growthPerShare =
    g > 0 && costOfCapital > g ? (e.yearlyEarnings * g) / (costOfCapital - g) / e.totalShares : 0;
  return {
    book: FUNDAMENTAL_TANGIBLE_BOOK_WEIGHT * bookPerShare,
    earningsPower: FUNDAMENTAL_EARNINGS_POWER_WEIGHT * earningsPerShare,
    growthPremium: FUNDAMENTAL_GROWTH_PREMIUM_WEIGHT * growthPerShare,
  };
}

/** The same company priced by the real share price formula. */
export function sharePriceFromFormula(costOfCapital: number): number {
  const e = SHARE_PRICE_EXAMPLE;
  const prices = computeSharePrices(
    [
      {
        corpId: "example",
        liquidCapitalAnchor: e.cash,
        sectorNPVAnchor: e.sectorValue,
        issuedBondDebt: e.bondDebt,
        bondHoldingsAnchor: 0,
        normalizedEarningsAnchor: e.yearlyEarnings,
        bondCouponEarningsAnchor: 0,
        sectorGrowthRate: e.sectorGrowth,
        costOfCapital,
        totalShares: e.totalShares,
        previousSharePrice: 0,
        imfBailoutActive: false,
      },
    ],
    0
  );
  return prices.get("example") ?? 0;
}

export function buildSharePriceByCostOfCapital(): WikiChartSpec {
  const rates = range(6, 16, 1);
  const parts = rates.map((r) => sharePriceComponents(r / 100));
  const series = (name: string, pick: (p: (typeof parts)[number]) => number) => ({
    name,
    points: parts.map((p, i): [number, number] => [i, round(pick(p), 3)]),
  });
  return {
    title: "Share price of the worked example company by cost of capital",
    kind: "bar",
    stacked: true,
    xLabel: "Cost of capital",
    yLabel: "Share price (anchor currency per share)",
    categories: rates.map((r) => `${r}%`),
    series: [
      series("Tangible book", (p) => p.book),
      series("Earnings power", (p) => p.earningsPower),
      series("Growth premium", (p) => p.growthPremium),
    ],
    caption:
      "Book value does not move with interest rates. Earnings power and the growth premium shrink as the cost of capital rises, so the price falls.",
  };
}

// ── Commodities ─────────────────────────────────────────────────────────────

export function buildCommodityPriceDrift(): WikiChartSpec {
  const turns = range(0, 2 * TURNS_PER_YEAR, 2);
  return {
    title: "How fast a price gap closes after a shock",
    kind: "line",
    xLabel: "Turns after the supply shock",
    yLabel: "Price gap to equilibrium still remaining (%)",
    unit: "%",
    series: [
      {
        name: "Gap remaining",
        points: turns.map((t): [number, number] => [
          t,
          round(100 * Math.pow(1 - COMMODITY_PRICE_DRIFT_RATE, t), 2),
        ]),
      },
    ],
    markers: [{ x: TURNS_PER_YEAR, label: "One game year" }],
    caption: `Prices close ${round(COMMODITY_PRICE_DRIFT_RATE * 100, 1)}% of the remaining gap each turn. After a game year only about 5% of the gap is left.`,
  };
}

export function buildCommodityPriceByPressure(): WikiChartSpec {
  const BASE = 1000;
  const ratios = range(0.1, 10, 0.1);
  const line = (knee: number): [number, number][] =>
    ratios.map((ratio): [number, number] => [
      ratio,
      round(computeMarketPrice(BASE, BASE, BASE * ratio, knee) / BASE, 3),
    ]);
  return {
    title: "Commodity price against demand and supply",
    kind: "line",
    xLabel: "Demand divided by supply (raw)",
    yLabel: "Price as a multiple of the base price",
    unit: "x",
    series: [
      {
        name: `Standard commodities (pressure softens past ${COMMODITY_PRESSURE_SOFT_KNEE}x)`,
        points: line(COMMODITY_PRESSURE_SOFT_KNEE),
      },
      {
        name: `Extractable resources (pressure softens past ${EXTRACTABLE_PRESSURE_SOFT_KNEE}x)`,
        points: line(EXTRACTABLE_PRESSURE_SOFT_KNEE),
      },
    ],
    markers: [
      { x: 1, label: "Balanced market" },
      { x: COMMODITY_PRESSURE_SOFT_KNEE, label: "Standard knee" },
      { x: EXTRACTABLE_PRESSURE_SOFT_KNEE, label: "Extractable knee" },
    ],
    caption:
      "Prices keep rising in a shortage with no hard cap, but slow down past the knee. Extractable resources respond at full strength for longer.",
  };
}

export function buildCommodityMarginPoints(): WikiChartSpec {
  const ratios = range(0.1, 10, 0.1);
  const margin = (sign: 1 | -1, ratio: number): number => {
    const effective = computeEffectiveCommodityPressureRatio(1, ratio);
    const raw = sign * COMMODITY_LOG_K * Math.log(effective);
    return round(Math.max(-COMMODITY_PER_ITEM_CAP, Math.min(COMMODITY_PER_ITEM_CAP, raw)), 2);
  };
  return {
    title: "Margin effect of a commodity shortage or glut",
    kind: "line",
    xLabel: "Demand divided by supply (raw)",
    yLabel: "Margin change (percentage points)",
    unit: "points",
    series: [
      {
        name: "Seller of the commodity",
        points: ratios.map((r): [number, number] => [r, margin(1, r)]),
      },
      {
        name: "Buyer of the commodity",
        points: ratios.map((r): [number, number] => [r, margin(-1, r)]),
      },
    ],
    markers: [
      { y: COMMODITY_PER_ITEM_CAP, label: "Cap per commodity" },
      { y: -COMMODITY_PER_ITEM_CAP, label: "Cap per commodity" },
    ],
    caption:
      "Shown for a commodity that makes up all of a sector's trade. A shortage helps sellers and hurts buyers, a glut does the reverse.",
  };
}

// ── Resources: prospecting and depletion ────────────────────────────────────

export function buildProspectingByResearch(): WikiChartSpec {
  const scores = range(0, RD_INNOVATION_SCORE_THRESHOLD, RD_INNOVATION_SCORE_THRESHOLD / 20);
  return {
    title: "Funding a geological survey: success and size by R&D score",
    kind: "line",
    xLabel: "Corporation R&D score",
    yLabel: "Chance the survey succeeds (%)",
    unit: "%",
    y2Label: "Capacity gained on success (%)",
    y2Unit: "%",
    series: [
      {
        name: "Corporation survey success chance",
        points: scores.map((s): [number, number] => [
          s,
          round(prospectCorpSuccessChance(s) * 100, 2),
        ]),
      },
      {
        name: "Government survey success chance",
        points: scores.map((s): [number, number] => [s, PROSPECT_GOVT_SUCCESS_CHANCE * 100]),
      },
      {
        name: "Capacity gain, smallest roll",
        axis: "right",
        points: scores.map((s): [number, number] => [
          s,
          round(PROSPECT_YIELD_MIN * prospectCorpRdMult(s) * 100, 2),
        ]),
      },
      {
        name: "Capacity gain, largest roll",
        axis: "right",
        points: scores.map((s): [number, number] => [
          s,
          round(PROSPECT_YIELD_MAX * prospectCorpRdMult(s) * 100, 2),
        ]),
      },
    ],
    caption:
      "Better research makes a corporation's survey both more likely to succeed and bigger when it does. Governments get a flat chance.",
  };
}

export function buildDepositDepletion(): WikiChartSpec {
  const remaining = range(0, 3, 0.05);
  const RESOURCE = "oil" as const;
  return {
    title: "Deposit depletion: extraction ceiling as the reserve runs out",
    kind: "line",
    xLabel: "Reserve left, in turns of full-rate extraction",
    yLabel: "Extraction ceiling (share of full per-turn capacity)",
    series: [
      {
        name: "Ceiling per turn",
        points: remaining.map((left): [number, number] => [
          left,
          round(
            depletedCapacityPerTurn(
              {
                resources: { [RESOURCE]: 1 },
                extractedUnits: { [RESOURCE]: DEPOSIT_RESERVE_TURNS - left },
              },
              RESOURCE
            ),
            4
          ),
        ]),
      },
    ],
    markers: [{ x: 1, label: "One turn of full-rate extraction left" }],
    caption: `A fresh deposit holds ${DEPOSIT_RESERVE_TURNS / TURNS_PER_YEAR} game years of output at full rate. The ceiling only bites in the last turn's worth of reserve, then the field tapers off.`,
  };
}

// ── Tariffs ─────────────────────────────────────────────────────────────────

export function buildTariffMarginEffects(): WikiChartSpec {
  const rates = range(0, 100, 5);
  return {
    title: "Tariff effect on corporate margins",
    kind: "line",
    xLabel: "Effective tariff rate (%)",
    yLabel: "Margin change (percentage points)",
    unit: "points",
    series: [
      {
        name: "Foreign corporation selling into the tariff country",
        points: rates.map((r): [number, number] => [r, foreignMarginModifierForRate(r)]),
      },
      {
        name: "Domestic corporation (broad tariffs only)",
        points: rates.map((r): [number, number] => [r, domesticMalusForRate(r)]),
      },
    ],
    caption:
      "Foreign corporations pay half the tariff rate as lost margin. Domestic corporations pay a small supply-chain cost that tops out at the 100% rate.",
  };
}

export function buildTariffBlendAndCapture(): WikiChartSpec {
  const rates = range(0, 100, 5);
  const weight = (pick: "globalWeight" | "nationalWeight" | "localWeight") => (r: number) =>
    [r, round(blendWeightsForRate(r)[pick] * 100, 2)] as [number, number];
  return {
    title: "Tariffs shift price weight and market share toward home",
    kind: "line",
    xLabel: "Effective tariff rate (%)",
    yLabel: "Weight in the price blend (%)",
    unit: "%",
    y2Label: "Share-capture multiplier",
    y2Unit: "x",
    series: [
      { name: "Global price weight", points: rates.map(weight("globalWeight")) },
      { name: "National price weight", points: rates.map(weight("nationalWeight")) },
      { name: "Local price weight", points: rates.map(weight("localWeight")) },
      {
        name: "Domestic corporation capture multiplier",
        axis: "right",
        points: rates.map((r): [number, number] => [r, splitCaptureMultiplierForRate(r, true)]),
      },
      {
        name: "Foreign corporation capture multiplier",
        axis: "right",
        points: rates.map((r): [number, number] => [r, splitCaptureMultiplierForRate(r, false)]),
      },
    ],
    caption:
      "Higher tariffs move weight from world prices to national prices and tilt contested market share toward domestic corporations.",
  };
}

export const ECONOMY_CORP_PRICING_CHARTS: Record<string, WikiChartBuilder> = {
  "share-price-by-cost-of-capital": buildSharePriceByCostOfCapital,
  "commodity-price-gap-closure": buildCommodityPriceDrift,
  "commodity-price-by-pressure": buildCommodityPriceByPressure,
  "commodity-margin-points": buildCommodityMarginPoints,
  "prospecting-success-and-gain": buildProspectingByResearch,
  "deposit-depletion-ceiling": buildDepositDepletion,
  "tariff-margin-effects": buildTariffMarginEffects,
  "tariff-blend-and-capture": buildTariffBlendAndCapture,
};
