import { TURNS_PER_YEAR } from "@/lib/constants/calendar";
import { SEED_UPKEEP_TARGET_SHARE } from "@/lib/military/appropriation";
import { DEFENCE_CONTRACT_WINDOW_TURNS } from "@/lib/military/defenceContractLimits";
import {
  DEFENCE_TURN_SPEND_BURST,
  defenceCountryTurnSpendCap,
  defenceSupplierTurnSpendCap,
  defenceProcurementAccrualPerTurn,
} from "@/lib/military/defenceTurnSpendCap";
import { NUCLEAR_NODES, productionCapFor, warheadUnitCost } from "@/lib/military/nuclearProgram";
import {
  COVERT_STAGES,
  FUNDING_COST,
  FUNDING_PROGRESS,
  STAGE_PROGRESS,
  type CovertFunding,
} from "@/lib/military/covertNuclear";
import {
  tensionBand,
  tensionPressureBreakdown,
  stepTension,
  type TensionPressures,
} from "@/lib/coldwar/tension";
import { advanceChannel, contestTarget } from "@/lib/navair/channels";
import { MARINE_LANDING_THRESHOLD } from "@/lib/navair/frontSupport";
import { BLOCKADE, blockadeAffinityMultiplier } from "@/lib/navair/blockade";
import { collectiveDurationReduction } from "@/lib/crises/rules/collectiveReduction";
import { ALIGNMENT_GATES, joinGateForPoleCount } from "@/lib/constants/alignmentEras";
import { JOIN_SHARE, LEAVE_SHARE } from "@/lib/alignment/membershipEligibility";
import { WORLD_EVENT_SEED_DEFINITIONS } from "@/lib/events/worldEvents/definitions";
import type { WikiChartBuilder, WikiChartMarker } from "./types";

const round = (n: number, dp = 4) => Number(n.toFixed(dp));
const range = (from: number, to: number, step = 1): number[] => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(round(v, 6));
  return out;
};

const QUIET: TensionPressures = {
  escalationLevel: 0,
  activeCrises: 0,
  totalWarheads: 0,
  nuclearWarIntensity: 0,
  nuclearWarCount: 0,
  otherWarIntensity: 0,
};

/** Tension band edges, found by scanning the band function itself. */
function bandEdges(): { value: number; band: string }[] {
  const edges: { value: number; band: string }[] = [];
  let prev = tensionBand(0);
  for (let v = 1; v <= 100; v++) {
    const b = tensionBand(v);
    if (b !== prev) edges.push({ value: v, band: b });
    prev = b;
  }
  return edges;
}
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const bandMarkers = (axis: "x" | "y"): WikiChartMarker[] =>
  bandEdges().map((e) => ({ [axis]: e.value, label: `${titleCase(e.band)} begins` }));

/** One 12-turn contracting window of the payout cap, in units of one steady turn of income. */
const defenceSpendCap: WikiChartBuilder = () => {
  // A defence line sized so one steady turn of procurement income is exactly 1.
  const line = TURNS_PER_YEAR / (1 - SEED_UPKEEP_TARGET_SHARE);
  const turns = range(1, DEFENCE_CONTRACT_WINDOW_TURNS);
  const steady = defenceProcurementAccrualPerTurn(line);
  return {
    title: "Most a country can pay suppliers in a single turn",
    kind: "bar",
    xLabel: "Turn of the contracting window",
    yLabel: "Payout in units of one steady turn of income",
    unit: "x",
    categories: turns.map((t) => `T${t}`),
    series: [
      { name: "Steady income", points: turns.map((_, i) => [i, round(steady)]) },
      {
        name: "Country cap",
        points: turns.map((_, i) => [i, round(defenceCountryTurnSpendCap(line))]),
      },
      {
        name: "One private supplier cap",
        points: turns.map((_, i) => [i, round(defenceSupplierTurnSpendCap(line, false))]),
      },
    ],
    caption: `Savings can be spent up to ${DEFENCE_TURN_SPEND_BURST} times faster than they are earned, but one private supplier is held to its share of that, so the whole window cannot be paid out in a turn or two.`,
  };
};

const nuclearDevices = NUCLEAR_NODES.filter((n) => n.kind === "device");

/** Warhead production cap and cost per device tier. */
const warheadBuilding: WikiChartBuilder = () => ({
  title: "Warhead production by device tier",
  kind: "bar",
  xLabel: "Device tier",
  yLabel: "Warheads per turn (production cap)",
  unit: "warheads",
  y2Label: "Cost per warhead",
  y2Unit: "",
  categories: nuclearDevices.map((n) => n.name),
  series: [
    {
      name: "Production cap",
      points: nuclearDevices.map((n, i): [number, number] => [i, productionCapFor({ [n.key]: 1 })]),
    },
    {
      name: "Cost per warhead",
      axis: "right",
      points: nuclearDevices.map((n, i): [number, number] => [i, warheadUnitCost({ [n.key]: 1 })]),
    },
  ],
  caption: "Better devices let you build more warheads a turn, and each one gets cheaper.",
});

/** Turns for a covert programme to finish every stage, by funding level. */
const covertPrograms: WikiChartBuilder = () => {
  const levels = (Object.keys(FUNDING_PROGRESS) as CovertFunding[]).filter(
    (f) => FUNDING_PROGRESS[f] > 0
  );
  const label = (f: CovertFunding) => f.charAt(0).toUpperCase() + f.slice(1);
  return {
    title: "Covert nuclear programme: speed versus cost",
    kind: "bar",
    xLabel: "Funding level",
    yLabel: "Turns to finish every stage",
    unit: "turns",
    y2Label: "Cost per turn",
    y2Unit: "",
    categories: levels.map(label),
    series: [
      {
        name: "Turns to finish",
        points: levels.map((f, i): [number, number] => [
          i,
          COVERT_STAGES.length * Math.ceil(STAGE_PROGRESS / FUNDING_PROGRESS[f]),
        ]),
      },
      {
        name: "Cost per turn",
        axis: "right",
        points: levels.map((f, i): [number, number] => [i, FUNDING_COST[f]]),
      },
    ],
    caption: "Faster funding finishes sooner, but it costs far more each turn.",
  };
};

/** Tension relaxing after a thermonuclear test. */
const tensionExample: WikiChartBuilder = () => {
  const thermo = NUCLEAR_NODES.find((n) => n.key === "device-thermo");
  const spike = thermo?.tensionSpike ?? 0;
  const base: TensionPressures = {
    ...QUIET,
    escalationLevel: 2,
    activeCrises: 2,
    totalWarheads: 100,
  };
  const withWar: TensionPressures = { ...base, otherWarIntensity: 50 };
  const run = (p: TensionPressures): [number, number][] => {
    let v = tensionPressureBreakdown(base).floor + spike;
    const pts: [number, number][] = [[0, v]];
    for (let t = 1; t <= 120; t++) {
      v = stepTension(v, p);
      pts.push([t, v]);
    }
    return pts;
  };
  return {
    title: "Tension after a thermonuclear test",
    kind: "line",
    xLabel: "Turns after the test",
    yLabel: "Global tension",
    series: [
      { name: "Standing pressure only", points: run(base) },
      { name: "With an extra active war", points: run(withWar) },
    ],
    markers: bandMarkers("y"),
    caption:
      "A test spikes tension, then it eases back toward the floor set by arsenals, crises and wars. It never drops below that floor.",
  };
};

/** Sea control building and decaying. */
const seaControl: WikiChartBuilder = () => {
  const target = contestTarget({ own: 4, hostile: 1 });
  const leaveTurn = 10;
  let v = 0;
  const pts: [number, number][] = [[0, 0]];
  for (let t = 1; t <= 20; t++) {
    v = advanceChannel(v, t <= leaveTurn ? target : 0, "seaControl");
    pts.push([t, v]);
  }
  return {
    title: "Sea control builds slowly and drains quickly",
    kind: "line",
    xLabel: "Turns",
    yLabel: "Sea control",
    series: [{ name: "Your sea control", points: pts }],
    markers: [
      { y: MARINE_LANDING_THRESHOLD, label: "Marines can land" },
      { x: leaveTurn, label: "Fleet leaves station" },
    ],
    caption:
      "Example: a fleet holding four fifths of the contest in a lane. Leaving costs control faster than staying built it.",
  };
};

/** Blockade closure and trade multiplier against pressure. */
const blockadeCurve: WikiChartBuilder = () => {
  const ratios = range(0, 10, 0.25);
  const closure = (r: number) => (r >= BLOCKADE.totalClosurePressureRatio ? 1 : r / (r + 1));
  return {
    title: "How a blockade closes a trade approach",
    kind: "line",
    xLabel: "Blockading pressure as a multiple of port defence",
    yLabel: "Approach closure (0 open, 1 shut)",
    y2Label: "Trade multiplier",
    series: [
      { name: "Closure", points: ratios.map((r): [number, number] => [r, round(closure(r))]) },
      {
        name: "Trade multiplier",
        axis: "right",
        points: ratios.map((r): [number, number] => [
          r,
          round(blockadeAffinityMultiplier(closure(r))),
        ]),
      },
    ],
    markers: [{ x: BLOCKADE.totalClosurePressureRatio, label: "Total closure" }],
    caption: `Trade is squeezed but never cut off until pressure reaches ${BLOCKADE.totalClosurePressureRatio} times the port's defence, when the approach shuts completely.`,
  };
};

/** Tension floor by warhead count, at several Vietnam rungs. */
const tensionFloorByArsenal: WikiChartBuilder = () => {
  const warheads = range(0, 1000, 20);
  const rungs = [0, 3, 6];
  return {
    title: "Standing tension floor by arsenal size",
    kind: "line",
    xLabel: "Total warheads in the world",
    yLabel: "Tension floor",
    series: rungs.map((rung) => ({
      name: rung === 0 ? "No Vietnam escalation" : `Vietnam rung ${rung}`,
      points: warheads.map((w): [number, number] => [
        w,
        tensionPressureBreakdown({ ...QUIET, escalationLevel: rung, totalWarheads: w }).floor,
      ]),
    })),
    markers: bandMarkers("y"),
    caption:
      "The floor starts at a baseline and rises with the arsenal, then flattens once the arsenal's own contribution hits its cap. Escalation rungs lift the whole curve.",
  };
};

/** Collective aid funding against duration cut. */
const collectiveFund: WikiChartBuilder = () => {
  const base = 1000;
  const shares = range(0, 100, 5);
  return {
    title: "Collective fund: how funding shortens a crisis",
    kind: "line",
    xLabel: "Share of the funding target reached",
    yLabel: "Share of the crisis duration cut",
    unit: "%",
    series: [
      {
        name: "Duration cut",
        points: shares.map((s): [number, number] => [
          s,
          round((collectiveDurationReduction(s, 100, base) / base) * 100, 2),
        ]),
      },
    ],
    caption: "Full funding takes half the duration off. Partial funding earns a proportional cut.",
  };
};

/** Alignment share and the membership thresholds. */
const alignmentThresholds: WikiChartBuilder = () => {
  const shares = range(0, 100);
  return {
    title: "Alignment share and bloc membership",
    kind: "step",
    xLabel: "Nation's alignment share in the bloc",
    yLabel: "Membership standing (-1 leaving, 0 neither, 1 may join)",
    series: [
      {
        name: "Standing",
        points: shares.map((s): [number, number] => [
          s,
          s >= JOIN_SHARE ? 1 : s <= LEAVE_SHARE ? -1 : 0,
        ]),
      },
    ],
    markers: [
      { x: ALIGNMENT_GATES.nonAligned, label: "Non-aligned below this lead" },
      { x: LEAVE_SHARE, label: "Leaves at or below" },
      { x: joinGateForPoleCount(4), label: "Sphere gate, four blocs" },
      { x: joinGateForPoleCount(3), label: "Sphere gate, three blocs" },
      { x: joinGateForPoleCount(2), label: "Sphere gate, two blocs" },
      { x: JOIN_SHARE, label: "May join at or above" },
      { x: ALIGNMENT_GATES.locked, label: "Locked in" },
    ],
    caption:
      "Between the leave and join lines a member is neither joining nor leaving, which stops flapping on small drifts.",
  };
};

/** World events unlocked as tension rises. */
const highTensionEvents: WikiChartBuilder = () => {
  const gated = WORLD_EVENT_SEED_DEFINITIONS.filter(
    (e): e is typeof e & { minTension: number } => typeof e.minTension === "number"
  );
  const byTension = new Map<number, string[]>();
  for (const e of gated)
    byTension.set(e.minTension, [...(byTension.get(e.minTension) ?? []), e.title]);
  const levels = range(0, 100);
  return {
    title: "World events that need high tension",
    kind: "step",
    xLabel: "Global tension",
    yLabel: "High-tension events that can fire",
    unit: "events",
    series: [
      {
        name: "Events available",
        points: levels.map((v): [number, number] => [
          v,
          gated.filter((e) => e.minTension <= v).length,
        ]),
      },
    ],
    markers: [...byTension.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([x, titles]) => ({ x, label: titles.join(" and ") })),
    caption: "Each of these events stays locked until tension reaches its line.",
  };
};

export const MILITARY_WORLD_CHARTS: Record<string, WikiChartBuilder> = {
  "defence-turn-spend-cap": defenceSpendCap,
  "nuclear-warhead-production-by-tier": warheadBuilding,
  "covert-nuclear-funding-levels": covertPrograms,
  "tension-after-thermonuclear-test": tensionExample,
  "sea-control-build-and-decay": seaControl,
  "blockade-closure-curve": blockadeCurve,
  "tension-floor-by-arsenal": tensionFloorByArsenal,
  "collective-fund-duration-cut": collectiveFund,
  "alignment-membership-thresholds": alignmentThresholds,
  "high-tension-world-events": highTensionEvents,
};
