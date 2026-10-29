import {
  AD_BONUS_CAP,
  TURNOUT_CAP,
  addTurnoutBoost,
  adExposure,
  canvassingBoost,
  decayTurnout,
} from "@/lib/campaignTargeting/rules";
import { advertiseFavorabilityGain } from "@/lib/actions/advertiseGain";
import { APPEAL_POSITION_EXPONENT, calcAppeal } from "@/lib/utils/demographicAppeal";
import {
  BASE_UNCERTAINTY_BAND,
  segmentUncertaintyBand,
} from "@/lib/demographics/granularPollUncertainty";
import type { WikiChartBuilder, WikiChartSpec } from "./types";

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const range = (from: number, to: number, step = 1): number[] => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(r4(v));
  return out;
};

function canvassHeadroom(): WikiChartSpec {
  const here = { economicLean: 0, socialLean: 0 };
  const apart = (gap: number) => ({ economicLean: gap, socialLean: gap });
  const counts = range(0, TURNOUT_CAP);
  const series = (boost: number): [number, number][] =>
    counts.map((n) => [n, r4(addTurnoutBoost(0, boost, n))]);
  return {
    title: "Turnout gained by repeated canvassing",
    kind: "line",
    xLabel: "Canvass actions on the same group",
    yLabel: "Turnout modifier",
    unit: " pts",
    series: [
      { name: "Aligned group, normal season", points: series(canvassingBoost(here, here, false)) },
      {
        name: "Aligned group, closing turns (doubled)",
        points: series(canvassingBoost(here, here, true)),
      },
      {
        name: "Group 3 points away on each axis",
        points: series(canvassingBoost(here, apart(3), false)),
      },
    ],
    markers: [{ y: TURNOUT_CAP, label: "Modifier cap" }],
    caption:
      "Each canvass adds less as the modifier nears the cap, and a poor fit wastes most of the effort.",
  };
}

function canvassDecay(): WikiChartSpec {
  const turns = range(0, 24);
  let state = { g: { b: TURNOUT_CAP } };
  const points: [number, number][] = [[0, TURNOUT_CAP]];
  for (const t of turns.slice(1)) {
    state = decayTurnout(state) as typeof state;
    points.push([t, r4(state.g.b)]);
  }
  return {
    title: "Canvassing fades if you stop",
    kind: "line",
    xLabel: "Turns since the last canvass",
    yLabel: "Remaining turnout modifier",
    unit: " pts",
    series: [{ name: "Modifier starting at the cap", points }],
    caption:
      "Turnout gains fade steadily every turn, so late canvassing is worth far more than early canvassing.",
  };
}

function adDecay(): WikiChartSpec {
  const turns = range(0, 96);
  return {
    title: "A targeted ad wears off",
    kind: "line",
    xLabel: "Turns since purchase",
    yLabel: "Remaining ad bonus",
    unit: "%",
    series: [
      {
        name: "Fully loaded targeted ad",
        points: turns.map((t) => [
          t,
          r4(
            adExposure(
              {
                stateId: "s",
                dimension: "d",
                bucket: "b",
                bonus: AD_BONUS_CAP,
                lastPurchaseTurn: 0,
              },
              t
            ) * 100
          ),
        ]),
      },
    ],
    caption: "The bonus halves on a fixed schedule, so ads are best timed close to election day.",
  };
}

function adFavorability(): WikiChartSpec {
  const xs = range(0, 100);
  return {
    title: "Favorability gained per ad",
    kind: "step",
    xLabel: "Current favorability",
    yLabel: "Favorability gained per ad",
    unit: " pts",
    series: [
      { name: "Neutral Charisma", points: xs.map((x) => [x, advertiseFavorabilityGain(x)]) },
    ],
    caption:
      "Ads pay full value at low favorability and taper off for candidates who are already well liked.",
  };
}

function appealFalloff(): WikiChartSpec {
  const ds = range(0, 10, 0.25);
  return {
    title: "Appeal falls off with policy distance",
    kind: "line",
    xLabel: "Total policy distance from the group",
    yLabel: "Appeal from policy position",
    unit: " pts",
    series: [
      {
        name: "Position appeal",
        points: ds.map((d) => [d, r4(calcAppeal(0, 0, d / 2, d / 2, 0, false))]),
      },
    ],
    markers: [{ y: r4(calcAppeal(0, 0, 0, 0, 0, false)), label: "Best possible position appeal" }],
    caption: `Appeal drops along a curve of power ${APPEAL_POSITION_EXPONENT}, with a small floor so no group is ever fully lost.`,
  };
}

function pollUncertainty(): WikiChartSpec {
  const shares = range(1, 100);
  return {
    title: "Uncertainty band by segment size",
    kind: "line",
    xLabel: "Segment share of the electorate",
    yLabel: "Uncertainty band",
    unit: " pts",
    series: [
      { name: "Band width", points: shares.map((s) => [s, r4(segmentUncertaintyBand(s / 100))]) },
    ],
    markers: [
      { y: BASE_UNCERTAINTY_BAND, label: "Band for a segment holding the whole electorate" },
    ],
    caption:
      "Smaller segments carry a wider band, so read thin slices of the electorate with care.",
  };
}

export const ELECTIONS_CAMPAIGN_CHARTS: Record<string, WikiChartBuilder> = {
  "canvassing-headroom": canvassHeadroom,
  "canvassing-decay": canvassDecay,
  "targeted-ad-decay": adDecay,
  "ad-favorability-gain": adFavorability,
  "appeal-policy-distance": appealFalloff,
  "granular-poll-uncertainty": pollUncertainty,
};
