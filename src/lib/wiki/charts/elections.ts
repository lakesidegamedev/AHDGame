import {
  ELECTION_DAY_TURNS,
  RAMP_TURNS,
  turnVoteWeight,
} from "@/lib/electionEngine/voteCalculations";
import {
  MAX_STATE_ORG_BONUS_GENERAL,
  MAX_STATE_ORG_BONUS_PRIMARY,
  STATE_ORG_MAX_LEVEL,
  STATE_ORG_REFERENCE_FRACTION,
  stateOrgBonusFraction,
  stateOrgLevelCost,
} from "@/lib/electionEngine/constants";
import { APPROVAL_SCALAR_EXPONENT, approvalScalar } from "@/lib/utils/demographicAppeal";
import { calcPrimaryScore } from "@/lib/primaryScore";
import { resolveRedistrictCaps } from "@/lib/redistricting/caps";
import {
  CALL_MARGIN_PCT,
  PRE_FINAL_REPORTING_CAP,
  computeBaselineReportingPct,
  computeUnitResult,
  unitRevealOffset,
} from "@/lib/elections/liveResults/computeResults";
import {
  DEVOLUTION_POLICY_DRIFT,
  MEAN_REVERSION_TARGET,
  computeIndependenceDesireDriftSnapshot,
} from "@/lib/governorOffice/devolution/rules";
import { REQUEST_THRESHOLD } from "@/lib/constants/referendum";
import { ELECTIONS_CAMPAIGN_CHARTS } from "./electionsCampaign";
import type { WikiChartBuilder, WikiChartSpec } from "./types";

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const range = (from: number, to: number, step = 1): number[] => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(r4(v));
  return out;
};

/** One 48-turn general election window: share of the vote pool released each turn. */
const GENERAL_WINDOW_TURNS = 48;

function generalVotePool(): WikiChartSpec {
  const pool = 100;
  const points: [number, number][] = range(1, GENERAL_WINDOW_TURNS).map((turn) => [
    turn,
    r4(turnVoteWeight(GENERAL_WINDOW_TURNS, turn - 1, pool)),
  ]);
  const rampStart = GENERAL_WINDOW_TURNS - ELECTION_DAY_TURNS - RAMP_TURNS;
  return {
    title: "How much of the vote is released each turn",
    kind: "bar",
    xLabel: "Turn of the general election",
    yLabel: "Share of the vote pool released",
    unit: "%",
    series: [{ name: "Share of pool", points }],
    markers: [
      { x: rampStart + 0.5, label: "Ramp begins" },
      { x: GENERAL_WINDOW_TURNS - ELECTION_DAY_TURNS + 0.5, label: "Final turns begin" },
    ],
    caption:
      "Most turns release a small slice, the ramp releases more, and the last few turns release the most each.",
  };
}

function finalHourReporting(): WikiChartSpec {
  const span = GENERAL_WINDOW_TURNS;
  const base = (turn: number) =>
    computeBaselineReportingPct({
      currentTurn: turn,
      startTurn: 0,
      endTurn: span,
      primaryEndTurn: 0,
    });
  const finalStart = span - 1;
  // Pick the earliest and latest revealing units among a sample so the chart spans the spread.
  const ids = Array.from({ length: 60 }, (_, i) => `unit-${i}`);
  const offsets = ids.map((id) => ({ id, o: unitRevealOffset("sample", id) }));
  const early = offsets.reduce((a, b) => (b.o < a.o ? b : a));
  const late = offsets.reduce((a, b) => (b.o > a.o ? b : a));
  const campaign: [number, number][] = range(0, finalStart).map((t) => [t, base(t)]);
  const hour = (unitId: string): [number, number][] =>
    range(0, 1, 0.02).map((p) => {
      const unit = computeUnitResult({
        electionId: "sample",
        unitId,
        name: unitId,
        weight: 1,
        votes: { a: 55, b: 45 },
        isEnded: false,
        baselineReportingPct: base(finalStart),
        finalHourProgress: p,
      });
      return [r4(finalStart + p), unit.reportingPct];
    });
  return {
    title: "Reporting percentage on election night",
    kind: "line",
    xLabel: "Turn of the general election (the last turn is the final hour)",
    yLabel: "Share of votes reporting",
    unit: "%",
    series: [
      { name: "Early-calling state", points: [...campaign, ...hour(early.id)] },
      { name: "Late-calling state", points: [...campaign, ...hour(late.id)] },
    ],
    markers: [
      { x: finalStart, label: "Final hour begins" },
      { y: PRE_FINAL_REPORTING_CAP, label: "Reporting is held below this until the final hour" },
      {
        y: 100,
        label: `Called once reporting is complete and the lead is ${CALL_MARGIN_PCT} points or more`,
      },
    ],
    caption:
      "Counting creeps up during the campaign, then each state jumps to 100% at its own moment in the final hour.",
  };
}

function campaignPresenceCurve(): WikiChartSpec {
  const levels = range(0, 20);
  let running = 0;
  const cost: [number, number][] = levels.map((level) => {
    if (level > 0) running += stateOrgLevelCost(level - 1);
    return [level, running];
  });
  const bonus = (max: number): [number, number][] =>
    levels.map((level) => [level, r4(stateOrgBonusFraction(level) * max * 100)]);
  return {
    title: "Building a state: cost against vote-weight bonus",
    kind: "line",
    xLabel: "Presence level in the state",
    yLabel: "Cumulative campaign treasury cost",
    unit: " funds",
    y2Label: "Vote-weight bonus in that state",
    y2Unit: "%",
    series: [
      { name: "Cumulative cost", points: cost },
      { name: "Primary bonus", points: bonus(MAX_STATE_ORG_BONUS_PRIMARY), axis: "right" },
      { name: "General election bonus", points: bonus(MAX_STATE_ORG_BONUS_GENERAL), axis: "right" },
    ],
    markers: [
      {
        x: STATE_ORG_MAX_LEVEL,
        label: `Level ${STATE_ORG_MAX_LEVEL} delivers ${Math.round(STATE_ORG_REFERENCE_FRACTION * 100)}% of the maximum bonus`,
      },
    ],
    caption:
      "Each level costs more than the last while the bonus flattens, so later levels are poor value.",
  };
}

function redistrictingTiers(): WikiChartSpec {
  const seats = 3;
  const tiers = [0, 1, 2].map((i) => resolveRedistrictCaps(2, i, i, seats));
  const pick = (f: (c: (typeof tiers)[number]) => number): [number, number][] =>
    tiers.map((c, i) => [i, r4(f(c))]);
  return {
    title: "Redistricting limits by tier",
    kind: "bar",
    xLabel: "Compactness and fairness tier",
    yLabel: "Limit",
    categories: ["Strict", "Moderate", "Loose"],
    series: [
      { name: "Max lean deviation (points)", points: pick((c) => c.maxDistrictDeviation) },
      { name: `Packed districts (of ${seats})`, points: pick((c) => c.maxPackedDistricts) },
      { name: "Efficiency gap ceiling (%)", points: pick((c) => c.efficiencyGapCeiling * 100) },
    ],
    caption: "Looser tiers let a map stray further from the state average and tilt more seats.",
  };
}

function desireDrift(): WikiChartSpec {
  const turns = 96;
  const run = (args: {
    policy: keyof typeof DEVOLUTION_POLICY_DRIFT;
    westminsterPolicy: keyof typeof DEVOLUTION_POLICY_DRIFT;
    regionalApproval: number;
  }): [number, number][] => {
    let value = MEAN_REVERSION_TARGET;
    const pts: [number, number][] = [[0, value]];
    for (let t = 1; t <= turns; t++) {
      value = computeIndependenceDesireDriftSnapshot({
        previous: value,
        policy: args.policy,
        westminsterPolicy: args.westminsterPolicy,
        regionalApproval: args.regionalApproval,
        nationalApproval: 50,
        inflationPercent: 3,
      }).next;
      pts.push([t, r4(value)]);
    }
    return pts;
  };
  return {
    title: "How independence desire drifts",
    kind: "line",
    xLabel: "Turns from a starting desire at the resting level",
    yLabel: "Independence desire",
    series: [
      {
        name: "Popular separatist government",
        points: run({ policy: "independence", westminsterPolicy: "pro", regionalApproval: 70 }),
      },
      {
        name: "Neutral",
        points: run({ policy: "pro", westminsterPolicy: "pro", regionalApproval: 50 }),
      },
      {
        name: "Anti-devolution government",
        points: run({ policy: "anti", westminsterPolicy: "anti", regionalApproval: 50 }),
      },
    ],
    markers: [{ y: REQUEST_THRESHOLD, label: "Desire needed to request a referendum" }],
    caption:
      "A popular separatist government pulls desire upward and a unionist one pulls it down, but even the fastest climb takes years to reach the referendum line.",
  };
}

function primaryScoreCurves(): WikiChartSpec {
  // Hold alignment fixed by matching positions exactly; isolate each term by differencing.
  const score = (fav: number, influence: number) =>
    calcPrimaryScore(0, 0, 0, 0, fav, influence, 0, 0, 0);
  const zero = score(0, 0);
  const xs = range(0, 100, 2);
  return {
    title: "State primary score: influence and favorability",
    kind: "line",
    xLabel: "Political Influence or Favorability",
    yLabel: "Primary score points earned",
    unit: " pts",
    series: [
      { name: "Political Influence", points: xs.map((x) => [x, r4(score(0, x) - zero)]) },
      { name: "Favorability", points: xs.map((x) => [x, r4(score(x, 0) - zero)]) },
    ],
    caption:
      "Influence rises fast then flattens, while favorability pays out in a straight line and is worth more at the top.",
  };
}

function approvalCurve(): WikiChartSpec {
  const xs = range(0, 100, 2);
  return {
    title: "How favorability scales votes",
    kind: "line",
    xLabel: "Favorability",
    yLabel: "Share of full votes kept",
    series: [
      { name: "Actual scaling", points: xs.map((x) => [x, r4(approvalScalar(x))]) },
      { name: "Straight line for comparison", points: xs.map((x) => [x, r4(x / 100)]) },
    ],
    caption: `Scaling follows favorability to the power ${APPROVAL_SCALAR_EXPONENT}, so mid-range favorability keeps more votes than a straight line would.`,
  };
}

export const ELECTIONS_CHARTS: Record<string, WikiChartBuilder> = {
  "general-election-vote-pool": generalVotePool,
  "live-results-reporting-curve": finalHourReporting,
  "campaign-presence-cost-and-bonus": campaignPresenceCurve,
  "redistricting-tier-limits": redistrictingTiers,
  "independence-desire-drift": desireDrift,
  "state-primary-score-curves": primaryScoreCurves,
  "favorability-vote-scalar": approvalCurve,
  ...ELECTIONS_CAMPAIGN_CHARTS,
};
