import { ORG_DECAY_GRACE_TURNS, ORG_UNIT_DECAY_RATE } from "@/lib/constants/partyOrg";
import {
  BUILD_ORG_BASE_PS_COST,
  PRESSURE_DECAY_PER_TURN,
  PRESSURE_LADDER_INCREMENT,
  PRESSURE_LADDER_MAX_VALUE,
  STATE_PASSIVE_PS_PER_TURN,
  STATE_PS_CAP_DEFAULT,
  effectivePsCost,
} from "@/lib/politicalStrength/strengthConstants";
import { orgBuildCashPrice } from "@/lib/politicalStrength/buildOrgFunding";
import { calcPrimaryScore } from "@/lib/primaryScore";
import { calculateNppCeiling, calculatePartyNppCapacity } from "@/lib/npp/partyCapacity";
import { complianceFromPersonality } from "@/lib/turn/npp/complianceRules";
import type { WikiChartBuilder, WikiChartSpec } from "./types";

const range = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
};
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

function buildOrgClickCost(): WikiChartSpec {
  const clicks = range(1, 10, 1);
  let pressure = 0;
  const ps: [number, number][] = [];
  const cash: [number, number][] = [];
  for (const click of clicks) {
    const cost = effectivePsCost(BUILD_ORG_BASE_PS_COST, pressure);
    ps.push([click, cost]);
    // Sample country and a state-scope click: the price scales with the cost and the country rate.
    cash.push([click, orgBuildCashPrice("US", "state", cost)]);
    pressure = Math.min(PRESSURE_LADDER_MAX_VALUE, pressure + PRESSURE_LADDER_INCREMENT);
  }
  return {
    title: "Cost of consecutive Build Org clicks in one state",
    kind: "line",
    xLabel: "Click number in a row",
    yLabel: "Political Strength per click",
    unit: "PS",
    y2Label: "Money per click (US state party)",
    y2Unit: "$",
    series: [
      { name: "Political Strength", points: ps },
      { name: "Money (US state)", points: cash, axis: "right" },
    ],
    caption: `Each click raises the next one, up to a cap. Pressure fades by ${PRESSURE_DECAY_PER_TURN} per turn between clicks.`,
  };
}

function orgIdleDecay(): WikiChartSpec {
  const horizon = 240;
  let units = 1;
  const points: [number, number][] = [[0, 1]];
  for (let t = 1; t <= horizon; t++) {
    if (t >= ORG_DECAY_GRACE_TURNS) units *= 1 - ORG_UNIT_DECAY_RATE;
    if (t % 4 === 0) points.push([t, r4(units)]);
  }
  return {
    title: "Party organization of an idle party",
    kind: "line",
    xLabel: "Turns since the last Build Org click",
    yLabel: "Organization units (share of the starting amount)",
    series: [{ name: "Organization units", points }],
    markers: [{ x: ORG_DECAY_GRACE_TURNS, label: "Decay begins" }],
    caption:
      "Organization holds steady through the grace period, then loses a share every turn until you build again.",
  };
}

function primaryAlignment(): WikiChartSpec {
  const gaps = range(0, 20, 1);
  // Isolate each component: favorability and influence are zero, and a huge gap
  // on the other side zeroes that side's part of the alignment score.
  const far = 1000;
  const score = (candidateEcon: number, partyEcon: number, stateEcon: number | null) =>
    calcPrimaryScore(
      candidateEcon,
      0,
      partyEcon,
      0,
      0,
      0,
      null,
      stateEcon,
      stateEcon === null ? null : 0
    );
  return {
    title: "Primary alignment points by ideological gap",
    kind: "line",
    xLabel: "Combined economic plus social gap",
    yLabel: "Alignment points",
    unit: "points",
    series: [
      {
        name: "State part",
        points: gaps.map((g) => [g, score(g, g + far, 0)] as [number, number]),
      },
      { name: "Party part", points: gaps.map((g) => [g, score(0, g, far)] as [number, number]) },
      {
        name: "Party only (no state lean)",
        points: gaps.map((g) => [g, score(g, 0, null)] as [number, number]),
      },
    ],
    caption:
      "Alignment is worth more in a state with a known lean. Without one, the party gap carries all of it.",
  };
}

function statePsReserve(): WikiChartSpec {
  const turns = range(0, 48, 1);
  const burstEvery = 12;
  const burstClicks = 6;
  const idle: [number, number][] = [];
  const spending: [number, number][] = [];
  let ps = 0;
  let spendPs = 0;
  let pressure = 0;
  for (const t of turns) {
    if (t > 0) {
      ps = Math.min(STATE_PS_CAP_DEFAULT, ps + STATE_PASSIVE_PS_PER_TURN);
      spendPs = Math.min(STATE_PS_CAP_DEFAULT, spendPs + STATE_PASSIVE_PS_PER_TURN);
      pressure = Math.max(0, pressure - PRESSURE_DECAY_PER_TURN);
      if (t % burstEvery === 0) {
        for (let i = 0; i < burstClicks; i++) {
          const cost = effectivePsCost(BUILD_ORG_BASE_PS_COST, pressure);
          if (spendPs < cost) break;
          spendPs -= cost;
          pressure = Math.min(PRESSURE_LADDER_MAX_VALUE, pressure + PRESSURE_LADDER_INCREMENT);
        }
      }
    }
    idle.push([t, ps]);
    spending.push([t, spendPs]);
  }
  return {
    title: "State party Political Strength reserve",
    kind: "line",
    xLabel: "Turns",
    yLabel: "Political Strength in reserve",
    unit: "PS",
    series: [
      { name: "Never spending", points: idle },
      {
        name: `Spending a burst of ${burstClicks} Build Org clicks every ${burstEvery} turns`,
        points: spending,
      },
    ],
    markers: [{ y: STATE_PS_CAP_DEFAULT, label: "Reserve cap" }],
    caption:
      "An idle reserve fills and then stops growing, so unspent Political Strength is wasted at the cap.",
  };
}

function nppCapacity(): WikiChartSpec {
  const members = range(0, 40, 1);
  const smallCeiling = calculateNppCeiling(0);
  const midCeiling = calculateNppCeiling(12);
  return {
    title: "NPP slots by active party members",
    kind: "line",
    xLabel: "Active members",
    yLabel: "NPP slots",
    unit: "slots",
    series: [
      {
        name: "Before any country ceiling",
        points: members.map((m) => [m, calculatePartyNppCapacity(m)]),
      },
      {
        name: "Small country ceiling",
        points: members.map((m) => [m, calculatePartyNppCapacity(m, smallCeiling)]),
      },
    ],
    markers: [
      { y: smallCeiling, label: "Smallest possible country ceiling" },
      { y: midCeiling, label: "Ceiling for a 12 region country" },
    ],
    caption:
      "Each member adds fewer slots as the party grows, and the country ceiling caps the total.",
  };
}

function nppCompliance(): WikiChartSpec {
  const loyalties = range(0, 100, 5);
  return {
    title: "NPP compliance by loyalty and stubbornness",
    kind: "line",
    xLabel: "NPP loyalty",
    yLabel: "Compliance (0 to 1)",
    series: [0, 50, 100].map((stubbornness) => ({
      name: `Stubbornness ${stubbornness}`,
      points: loyalties.map(
        (l) => [l, r4(complianceFromPersonality(l, stubbornness))] as [number, number]
      ),
    })),
    caption:
      "Loyalty raises compliance and stubbornness lowers it. Whips and the party line are scaled by this number.",
  };
}

export const PARTIES_CHARTS: Record<string, WikiChartBuilder> = {
  "build-org-click-cost": buildOrgClickCost,
  "party-org-idle-decay": orgIdleDecay,
  "primary-alignment-points": primaryAlignment,
  "state-ps-reserve": statePsReserve,
  "npp-capacity-by-members": nppCapacity,
  "npp-compliance-by-loyalty": nppCompliance,
};
