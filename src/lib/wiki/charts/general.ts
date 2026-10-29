import type { WikiChartBuilder, WikiChartSpec } from "./types";
import { GENERAL_COUNTRY_CHARTS } from "./generalCountries";
import { DECAY_RATE } from "@/lib/turn/metricDecay";
import { OUTPUT_GAP_UNEMPLOYMENT_COEFFICIENT } from "@/lib/labour/rules/employment";
import {
  getCampaignActionCost,
  getAdvertiseActionCost,
  campaignInfluenceGain,
  getBuildDonorBaseActionCost,
  getBuildDonorBaseFundCost,
} from "@/lib/actions/rules";
import { getGdpBaseline } from "@/lib/utils/fundGeneration";
import {
  ACTION_HOARD_PENALTY,
  MIN_BASE_ACTIONS_PER_TURN,
  STAT_MIN,
} from "@/lib/stats/statsConstants";
import { energyActionLimits } from "@/lib/stats/statDrift";
import {
  applyNationalInfluenceTurn,
  applyPoliticalInfluenceDecay,
  calculateNationalInfluenceGain,
  executivePartyInfluenceDecayMultiplier,
  NATIONAL_INFLUENCE_DECAY_RATE,
} from "@shared/constants/formulas";
import { resolveOfficeNiBonus } from "@/lib/actions/officeBonusRegistry";
import {
  RELOCATION_COOLDOWN_TURNS,
  getRelocationCooldownStatus,
} from "@/lib/character/relocationCooldown";
import { statRollAdjustment } from "@/lib/events/substrate/rollAdjustment";

const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const range = (from: number, to: number, step = 1): number[] => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(round4(v));
  return out;
};

/** Sample parameters that are presentation choices, not game rules. */
const SAMPLE_STRUCTURAL_UNEMPLOYMENT = 4.5;
const SAMPLE_START_ACTIONS = 25;
const SAMPLE_PI_START = 50;
const SAMPLE_CAMPAIGNS_PER_DAY = 6;
const SAMPLE_TURNS_PER_DAY = 24;
const SAMPLE_NPI_STATE_PI = 30;

const metricDecayChart: WikiChartBuilder = (): WikiChartSpec => {
  const turns = range(0, 960, 10);
  const remaining = (t: number) => round4(100 * Math.pow(1 - DECAY_RATE, t));
  const halfLife = Math.round(Math.log(0.5) / Math.log(1 - DECAY_RATE));
  const tenth = Math.round(Math.log(0.1) / Math.log(1 - DECAY_RATE));
  return {
    title: "How fast a displaced national number drifts back to normal",
    kind: "line",
    xLabel: "Turns since the shift",
    yLabel: "Deviation left",
    unit: "%",
    series: [{ name: "Deviation from baseline", points: turns.map((t) => [t, remaining(t)]) }],
    markers: [
      { x: halfLife, label: `Half gone (turn ${halfLife})` },
      { x: tenth, label: `90% gone (turn ${tenth})` },
    ],
    caption:
      "Natural decay removes a fixed share of what is left each turn, so recovery is fast at first and very slow at the end.",
  };
};

const unemploymentChart: WikiChartBuilder = (): WikiChartSpec => ({
  title: "Target unemployment against the output gap",
  kind: "line",
  xLabel: "Output gap (points above or below trend)",
  yLabel: "Target unemployment",
  unit: "%",
  series: [
    {
      name: `${SAMPLE_STRUCTURAL_UNEMPLOYMENT}% structural rate`,
      points: range(-5, 5).map((gap) => [
        gap,
        round4(SAMPLE_STRUCTURAL_UNEMPLOYMENT - OUTPUT_GAP_UNEMPLOYMENT_COEFFICIENT * gap),
      ]),
    },
  ],
  markers: [{ x: 0, label: "Economy on trend" }],
  caption:
    "A hot economy pulls the unemployment target below the structural rate and a slump pushes it above.",
});

const actionCostByLevelChart: WikiChartBuilder = (): WikiChartSpec => {
  const xs = range(0, 100);
  return {
    title: "Action cost of Campaign and Run Advertisements",
    kind: "step",
    xLabel: "Political Influence (Campaign) or Favorability (Advertisements)",
    yLabel: "Actions per use",
    unit: "actions",
    series: [
      { name: "Campaign (by PI)", points: xs.map((x) => [x, getCampaignActionCost(x)]) },
      {
        name: "Run Advertisements (by Favorability)",
        points: xs.map((x) => [x, getAdvertiseActionCost(x)]),
      },
    ],
    caption: "Both actions get more expensive in steps as the stat they raise climbs.",
  };
};

const actionStockChart: WikiChartBuilder = (): WikiChartSpec => {
  const { cap, threshold } = energyActionLimits(STAT_MIN);
  const simulate = (refresh: number): [number, number][] => {
    const points: [number, number][] = [];
    let stock = SAMPLE_START_ACTIONS;
    for (let t = 0; t <= 120; t++) {
      points.push([t, stock]);
      const penalty = stock > threshold ? ACTION_HOARD_PENALTY : 0;
      stock = Math.min(cap, Math.max(0, stock - penalty + refresh));
    }
    return points;
  };
  return {
    title: "Actions stockpile if you never spend",
    kind: "line",
    xLabel: "Turns",
    yLabel: "Actions held",
    unit: "actions",
    series: [
      { name: "Base actions only", points: simulate(MIN_BASE_ACTIONS_PER_TURN) },
      { name: "Office holder with +1", points: simulate(MIN_BASE_ACTIONS_PER_TURN + 1) },
    ],
    markers: [
      { y: threshold, label: "Hoarding penalty starts (Energy 1)" },
      { y: cap, label: "Action cap (Energy 1)" },
    ],
    caption:
      "Above the hoarding line you lose actions every turn, so a base character stalls just over it while an office holder keeps climbing.",
  };
};

const politicalInfluenceChart: WikiChartBuilder = (): WikiChartSpec => {
  const campaignEvery = Math.round(SAMPLE_TURNS_PER_DAY / SAMPLE_CAMPAIGNS_PER_DAY);
  const simulate = (campaign: boolean, multiplier: number): [number, number][] => {
    const points: [number, number][] = [];
    let pi = SAMPLE_PI_START;
    for (let t = 0; t <= 100; t++) {
      points.push([t, round4(pi)]);
      pi = applyPoliticalInfluenceDecay(pi, 0, multiplier);
      if (campaign && (t + 1) % campaignEvery === 0)
        pi = Math.min(100, pi + campaignInfluenceGain(pi));
    }
    return points;
  };
  return {
    title: "Political Influence over 100 turns",
    kind: "line",
    xLabel: "Turns",
    yLabel: "Political Influence",
    unit: "PI",
    series: [
      { name: "No Campaign", points: simulate(false, 1) },
      { name: `${SAMPLE_CAMPAIGNS_PER_DAY} Campaigns a day`, points: simulate(true, 1) },
      {
        name: "Governing party at 0% approval, same Campaigns",
        points: simulate(true, executivePartyInfluenceDecayMultiplier(0)),
      },
    ],
    caption:
      "Campaigning holds your PI against decay, and members of the governing party must campaign harder to stand still.",
  };
};

const nationalInfluenceGainChart: WikiChartBuilder = (): WikiChartSpec => ({
  title: "National Influence gained per turn from home state PI",
  kind: "line",
  xLabel: "Home state Political Influence",
  yLabel: "NPI gained per turn",
  unit: "NPI",
  series: [
    {
      name: "NPI gain",
      points: range(0, 100).map((pi) => [pi, round4(calculateNationalInfluenceGain(pi))]),
    },
  ],
  markers: [{ y: 0, label: "Break-even" }],
  caption: "A strong home base builds a national name; a neglected one costs it.",
});

const donorBaseChart: WikiChartBuilder = (): WikiChartSpec => {
  const levels = range(0, 75);
  const baseline = getGdpBaseline("US");
  const population = 1_000_000;
  const averageGdpMillions = baseline; // GDP per person equals the country baseline
  return {
    title: "Cost of the next Donor Base level",
    kind: "line",
    xLabel: "Current Donor Base level",
    yLabel: "Actions per use",
    unit: "actions",
    series: [
      { name: "Action cost", points: levels.map((l) => [l, getBuildDonorBaseActionCost(l)]) },
      {
        name: "Fund cost at average GDP per person",
        axis: "right",
        points: levels.map((l) => [
          l,
          getBuildDonorBaseFundCost(l, averageGdpMillions, population, "US"),
        ]),
      },
    ],
    y2Label: "Funds per use",
    y2Unit: "funds",
    caption: "Both costs climb with every level, with actions rising fastest at the top end.",
  };
};

const npiClimbChart: WikiChartBuilder = (): WikiChartSpec => {
  const gain = calculateNationalInfluenceGain(SAMPLE_NPI_STATE_PI);
  const roles: { name: string; office: string }[] = [
    { name: "State legislator", office: "stateSenate" },
    { name: "National legislator", office: "house" },
    { name: "Head of government", office: "president" },
  ];
  const turns = range(0, 200, 5);
  const series = roles.map((r) => {
    const turnGain = gain + resolveOfficeNiBonus(r.office, "US");
    const byTurn: number[] = [0];
    for (let t = 1; t <= 200; t++) byTurn.push(applyNationalInfluenceTurn(byTurn[t - 1], turnGain));
    return {
      name: r.name,
      points: turns.map((t) => [t, round4(byTurn[t])] as [number, number]),
      equilibrium: turnGain / NATIONAL_INFLUENCE_DECAY_RATE,
    };
  });
  return {
    title: `National Influence climb at ${SAMPLE_NPI_STATE_PI} home state PI`,
    kind: "line",
    xLabel: "Turns in office",
    yLabel: "National Influence",
    unit: "NPI",
    series: series.map(({ name, points }) => ({ name, points })),
    markers: series.map((s) => ({
      y: round4(s.equilibrium),
      label: `${s.name} settles near ${Math.round(s.equilibrium)}`,
    })),
    caption:
      "Every role settles where each turn's gain equals the 1% decay, so higher offices climb to a higher plateau.",
  };
};

const relocationCooldownChart: WikiChartBuilder = (): WikiChartSpec => {
  const turns = range(0, RELOCATION_COOLDOWN_TURNS + 24, 2);
  return {
    title: "Relocation cooldown after a move",
    kind: "line",
    xLabel: "Turns since you moved",
    yLabel: "Turns left on cooldown",
    unit: "turns",
    series: [
      {
        name: "Cooldown remaining",
        points: turns.map((t) => [
          t,
          getRelocationCooldownStatus({ lastRelocatedTurn: 0 }, t, 0, 0).remainingTurns,
        ]),
      },
    ],
    markers: [{ x: RELOCATION_COOLDOWN_TURNS, label: "You can move again" }],
    caption: "The timer starts when you move and counts down one per turn.",
  };
};

const eventRollChart: WikiChartBuilder = (): WikiChartSpec => ({
  title: "How your stat shifts an event roll",
  kind: "line",
  xLabel: "Primary stat",
  yLabel: "Roll adjustment",
  unit: "points",
  series: [
    {
      name: "Adjustment to the 1 to 100 roll",
      points: range(1, 10).map((s) => [s, statRollAdjustment(s)]),
    },
  ],
  markers: [{ y: 0, label: "No change" }],
  caption:
    "A high stat adds to the roll and a low one subtracts, pushing outcomes toward better or worse tiers.",
});

export const GENERAL_CHARTS: Record<string, WikiChartBuilder> = {
  "metric-decay-recovery": metricDecayChart,
  "unemployment-output-gap": unemploymentChart,
  "campaign-advertise-action-cost": actionCostByLevelChart,
  "action-stockpile-hoarding": actionStockChart,
  "political-influence-over-time": politicalInfluenceChart,
  "national-influence-gain-from-pi": nationalInfluenceGainChart,
  "donor-base-costs": donorBaseChart,
  "national-influence-climb": npiClimbChart,
  "relocation-cooldown": relocationCooldownChart,
  "event-roll-stat-adjustment": eventRollChart,
  ...GENERAL_COUNTRY_CHARTS,
};
