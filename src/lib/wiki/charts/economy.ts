import type { WikiChartBuilder } from "./types";
import { range, round } from "./economyHelpers";
import { ECONOMY_BANKING_CHARTS } from "./economyBanking";
import { ECONOMY_MARGIN_CHARTS } from "./economyMargins";
import { ECONOMY_DEBT_CHARTS } from "./economyBankingDebt";
import { computeMarketDemand } from "@/lib/sovereignDefault/marketDemand";
import {
  DEFAULT_SCAR_DURATION,
  DEMAND_FULL_THRESHOLD,
  DEMAND_UNDERSUBSCRIBED_THRESHOLD,
  GLOBAL_BENCHMARK_RATE,
  IMF_BOARD_CAPTURE_DELTA_BOUND,
  IMF_SOVEREIGN_AMORTIZATION_TURNS,
  IMF_SOVEREIGN_DEFAULT_RATE,
  IMF_SOVEREIGN_INCOME_CAPTURE_DEFAULT,
} from "@/lib/sovereignDefault/constants";
import type { SovereignDemandSnapshot } from "@/lib/sovereignDefault/types";
import { computeImfFacilityPaymentTurn } from "@/lib/imf/imfFacilityMath";
import { sociMultiplier } from "@/lib/nationalization/concentrationClamp";
import { SOCI_DANGER_ZONE, INVESTOR_CONFIDENCE_BASELINE } from "@/lib/nationalization/constants";
import { computeConfidenceRecovery } from "@/lib/nationalization/consequences/compute";
import { computeSoeEfficiencyPenalty } from "@/lib/nationalization/soeEfficiency";
import { INFAMY_PENALTY_THRESHOLD, scrutinyReliefDampener } from "@/lib/centralBank/scrutinyRules";
import { transmissionMultiplier } from "@/lib/centralBank/credibility";
import { INFLATION_TARGET, getInflationMarginModifier } from "@/lib/constants/corporations";
import { DRIFT_SPEED, PRIME_RATE_SENSITIVITY } from "@/lib/constants/currencies";
import { applyDrift } from "@/lib/currency/rateCalculation";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";

/** Demand snapshot for a country with neutral trust, benchmark coupon and no FX stress. */
function demandSnapshot(overrides: Partial<SovereignDemandSnapshot>): SovereignDemandSnapshot {
  return {
    countryCode: "XX",
    currentTurn: 0,
    debtToGdp: 0,
    inflationRate: 0.02,
    trust: 0.5,
    sovereignCouponRate: GLOBAL_BENCHMARK_RATE * 100,
    fxDepreciationRate10t: 0,
    turnsSinceLastDefault: null,
    entityHoldings: 0,
    requiredIssuance: 0,
    ...overrides,
  };
}

const sovereignDefaultDemandCurve: WikiChartBuilder = () => {
  const ratios = range(0, 3, 0.05);
  const line = (inflation: number) =>
    ratios.map((d): [number, number] => [
      round(d * 100, 2),
      round(
        computeMarketDemand(demandSnapshot({ debtToGdp: d, inflationRate: inflation })).demandRatio
      ),
    ]);
  return {
    title: "Bond demand as debt grows",
    kind: "line",
    xLabel: "Debt as a share of GDP",
    yLabel: "Demand for new bonds",
    unit: "x of issue",
    series: [
      { name: "Inflation 2%", points: line(0.02) },
      { name: "Inflation 8%", points: line(0.08) },
    ],
    markers: [
      { y: DEMAND_FULL_THRESHOLD, label: "Fully subscribed" },
      { y: DEMAND_UNDERSUBSCRIBED_THRESHOLD, label: "Undersubscribed below this" },
    ],
    caption:
      "Demand slides as debt climbs, and higher inflation pushes the whole curve down. Neutral trust, no currency stress, no prior default.",
  };
};

const sovereignDefaultScar: WikiChartBuilder = () => {
  const turns = range(0, DEFAULT_SCAR_DURATION, 2);
  return {
    title: "How a default scar fades",
    kind: "line",
    xLabel: "Turns since the default",
    yLabel: "Penalty to bond demand",
    unit: "points",
    series: [
      {
        name: "Default scar",
        points: turns.map((t): [number, number] => {
          const scar = computeMarketDemand(
            demandSnapshot({ turnsSinceLastDefault: t })
          ).components.find((c) => c.id === "defaultScar");
          return [t, round(scar?.contribution ?? 0)];
        }),
      },
    ],
    caption:
      "The penalty starts at its worst on the default turn and fades in a straight line to zero.",
  };
};

const imfFacilityCapitalization: WikiChartBuilder = () => {
  const principal = 100;
  const ratePercent = IMF_SOVEREIGN_DEFAULT_RATE * 100;
  const run = (turnIncome: number, capture: number): [number, number][] => {
    let p = principal;
    let n = IMF_SOVEREIGN_AMORTIZATION_TURNS;
    const pts: [number, number][] = [[0, p]];
    for (let t = 1; t <= IMF_SOVEREIGN_AMORTIZATION_TURNS; t++) {
      const split = computeImfFacilityPaymentTurn({
        principalOutstanding: p,
        annualRatePercent: ratePercent,
        remainingTurns: n,
        turnIncome,
        incomeCapFraction: capture,
      });
      p = split.newPrincipal;
      n = Math.max(1, split.newRemainingTurns);
      if (t % 4 === 0) pts.push([t, round(p, 3)]);
    }
    return pts;
  };
  const bigIncome = 400 / TURNS_PER_YEAR;
  const smallIncome = 20 / TURNS_PER_YEAR;
  const boosted = IMF_SOVEREIGN_INCOME_CAPTURE_DEFAULT + IMF_BOARD_CAPTURE_DELTA_BOUND;
  return {
    title: "An IMF loan that cannot be serviced grows",
    kind: "line",
    xLabel: "Turns since the bailout",
    yLabel: "Outstanding loan (start = 100)",
    unit: "billion",
    series: [
      {
        name: "Large economy (400 a year)",
        points: run(bigIncome, IMF_SOVEREIGN_INCOME_CAPTURE_DEFAULT),
      },
      {
        name: "Small economy (20 a year)",
        points: run(smallIncome, IMF_SOVEREIGN_INCOME_CAPTURE_DEFAULT),
      },
      {
        name: "Small economy, capture raised by the board",
        points: run(smallIncome, boosted),
      },
    ],
    caption:
      "When the income share the IMF may take cannot cover the interest, the unpaid interest is added to the loan.",
  };
};

const nationalizationCostMultiplier: WikiChartBuilder = () => ({
  title: "Cost of nationalizing as the state grows",
  kind: "line",
  xLabel: "State ownership concentration",
  yLabel: "Cost multiplier",
  unit: "x",
  series: [
    {
      name: "Taking cost multiplier",
      points: range(0, 100, 2.5).map((s): [number, number] => [s, round(sociMultiplier(s))]),
    },
  ],
  markers: [{ x: SOCI_DANGER_ZONE, label: "Costs start rising here" }],
  caption:
    "Early takings cost the base price. Past the knee, each extra takeover costs steeply more.",
});

const nationalizationConfidenceRecovery: WikiChartBuilder = () => {
  const start = 40;
  const pts: [number, number][] = [[0, start]];
  let c = start;
  for (let t = 1; t <= 120; t++) {
    c = computeConfidenceRecovery(c);
    pts.push([t, round(c, 3)]);
  }
  return {
    title: "Investor confidence after a taking",
    kind: "line",
    xLabel: "Turns after the hit",
    yLabel: "Investor confidence",
    unit: "points",
    series: [{ name: "Confidence (example: hit down to 40)", points: pts }],
    markers: [{ y: INVESTOR_CONFIDENCE_BASELINE, label: "Normal level" }],
    caption:
      "Each turn confidence closes a fixed share of the gap to normal, so recovery is fast at first and then slow.",
  };
};

const soeCorruptionDrag: WikiChartBuilder = () => {
  const transparency = 50;
  const line = (priceControlled: boolean) =>
    range(0, 100, 5).map((corruption): [number, number] => [
      corruption,
      round(
        computeSoeEfficiencyPenalty({
          corruptionIndex: corruption,
          governmentTransparency: transparency,
          priceControlled,
          employmentGuaranteed: false,
        })
      ),
    ]);
  return {
    title: "State company margin drag from corruption",
    kind: "line",
    xLabel: "Corruption index",
    yLabel: "Margin drag",
    unit: "points",
    series: [
      { name: "No mandate", points: line(false) },
      { name: "Price controlled", points: line(true) },
    ],
    caption:
      "Shown at middling government transparency (50). Cleaner government cancels some drag; price controls add a fixed cost.",
  };
};

const centralBankScrutiny: WikiChartBuilder = () => {
  const xs = range(0, 150, 5);
  return {
    title: "What scrutiny does to a central bank chair",
    kind: "line",
    xLabel: "Scrutiny",
    yLabel: "Multiplier",
    unit: "x",
    series: [
      {
        name: "Scrutiny relief dampener",
        points: xs.map((s): [number, number] => [s, round(scrutinyReliefDampener(s))]),
      },
      {
        name: "Rate move credibility",
        points: xs.map((s): [number, number] => [s, round(transmissionMultiplier(s))]),
      },
    ],
    markers: [
      { x: INFAMY_PENALTY_THRESHOLD, label: "Above this the chair loses bonuses and actions" },
    ],
    caption:
      "High scrutiny blunts both the relief a good turn earns and how far a rate move is believed.",
  };
};

const inflationCorporateMargin: WikiChartBuilder = () => ({
  title: "Inflation and corporate margins",
  kind: "line",
  xLabel: "Inflation rate",
  yLabel: "Margin effect on every firm",
  unit: "points",
  series: [
    {
      name: "Margin effect",
      points: range(-3, 12, 0.25).map((i): [number, number] => [
        i,
        round(getInflationMarginModifier(i)),
      ]),
    },
  ],
  markers: [{ x: INFLATION_TARGET, label: "Neutral point" }],
  caption:
    "Margins are best just under target inflation, and fall steadily as prices rise or deflation sets in.",
});

const rateShockPassThrough: WikiChartBuilder = () => {
  const pts: [number, number][] = [];
  let share = 0;
  for (let t = 0; t <= 96; t++) {
    pts.push([t, round(share * 100, 3)]);
    share = applyDrift(share, 1);
  }
  return {
    title: "How fast a rate shock works through",
    kind: "line",
    xLabel: "Turns since the shock",
    yLabel: "Share of the gap closed",
    unit: "%",
    series: [{ name: "Gap closed", points: pts }],
    markers: [{ x: TURNS_PER_YEAR, label: "One game year" }],
    caption:
      "The exchange rate closes a fixed share of the remaining gap each turn: most of the move lands within a year.",
  };
};

const currencyRatePathAfterPrimeRise: WikiChartBuilder = () => {
  const primeRise = 2;
  const target = 1 - primeRise * PRIME_RATE_SENSITIVITY;
  const pts: [number, number][] = [];
  let rate = 1;
  for (let t = 0; t <= 100; t++) {
    pts.push([t, round(rate * 100, 3)]);
    rate = applyDrift(rate, target);
  }
  return {
    title: "Exchange rate path after a 2 point prime rate rise",
    kind: "line",
    xLabel: "Turns since the rise",
    yLabel: "Local currency per unit (start = 100)",
    unit: "index",
    series: [
      { name: "Rate path", points: pts },
      {
        name: "New target",
        points: [
          [0, round(target * 100, 3)],
          [100, round(target * 100, 3)],
        ],
      },
    ],
    markers: [
      { x: Math.round(Math.log(0.1) / Math.log(1 - DRIFT_SPEED)), label: "90% of the move done" },
    ],
    caption:
      "A lower number means a stronger currency. A higher prime rate pulls the rate down toward its new target.",
  };
};

export const ECONOMY_CHARTS: Record<string, WikiChartBuilder> = {
  "sovereign-default-demand-curve": sovereignDefaultDemandCurve,
  "sovereign-default-scar-decay": sovereignDefaultScar,
  "imf-facility-capitalization": imfFacilityCapitalization,
  "nationalization-cost-multiplier": nationalizationCostMultiplier,
  "nationalization-confidence-recovery": nationalizationConfidenceRecovery,
  "soe-corruption-margin-drag": soeCorruptionDrag,
  "central-bank-scrutiny-multipliers": centralBankScrutiny,
  "inflation-corporate-margin-effect": inflationCorporateMargin,
  "rate-shock-pass-through": rateShockPassThrough,
  "currency-rate-path-after-prime-rise": currencyRatePathAfterPrimeRise,
  ...ECONOMY_BANKING_CHARTS,
  ...ECONOMY_DEBT_CHARTS,
  ...ECONOMY_MARGIN_CHARTS,
};
