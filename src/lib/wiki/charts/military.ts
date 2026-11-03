import type { MilitaryUnit } from "@/lib/db/types/militaryUnit";
import {
  MILITARY_COUNTRY_SCALE,
  TECH_TIERS,
  TECH_UPKEEP_MULT,
  getUnitArchetype,
  techPowerMult,
} from "@/lib/constants/militaryCore";
import { ARCHETYPE_COST_GDP_DIVISOR } from "@/lib/military/procurement";
import { effectiveness } from "@/lib/military/calc";
import { ATTRITION, CAPACITY } from "@/lib/military/config";
import {
  CONSCRIPTION_STANCES,
  MANPOWER_START_FRACTION,
  initialManpowerPool,
  manpowerCeiling,
  reinforceUnit,
} from "@/lib/military/manpower";
import {
  GENLVLXP,
  GENRANK,
  POINTS_PER_PROMOTION,
  POST_FM_POINT_CAP,
  TENURE_POINT_CAP,
  TENURE_POINT_TURNS,
  levelGeneral,
  type General,
} from "@/lib/military/generals";
import { STARTING_POINTS } from "@/lib/military/generalsTree";
import { DOCTRINE_CATS, DEFAULT_POINTS } from "@/lib/military/doctrineTree";
import { DOCTRINE_POINTS_PER_YEAR } from "@/lib/military/doctrineIncome";
import { TURNS_PER_YEAR } from "@/lib/constants/calendar";
import {
  WAR_DECLARATION_COOLDOWN_TURNS,
  WAR_DECLARATION_VOTE_WINDOW_TURNS,
} from "@/lib/military/warGoals";
import { TRUCE_TURNS } from "@/lib/db/types/peaceOffer";
import { MILITARY_WORLD_CHARTS } from "./militaryWorld";
import type { WikiChartBuilder } from "./types";

const round = (n: number, dp = 4) => Number(n.toFixed(dp));
const range = (from: number, to: number, step = 1): number[] => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(round(v, 6));
  return out;
};

/** Countdown from the moment a war declaration is filed. */
const warTimers: WikiChartBuilder = () => {
  const end = 480;
  const countdown = (turns: number): [number, number][] => [
    [0, turns],
    [turns, 0],
    [end, 0],
  ];
  return {
    title: "Timers after you file a war declaration",
    kind: "line",
    xLabel: "Turns since filing",
    yLabel: "Turns left on the timer",
    unit: "turns",
    series: [
      {
        name: "Vote on the declaration bill",
        points: countdown(WAR_DECLARATION_VOTE_WINDOW_TURNS),
      },
      { name: "Wait before filing another", points: countdown(WAR_DECLARATION_COOLDOWN_TURNS) },
      { name: "Truce if a war ended now", points: countdown(TRUCE_TURNS) },
    ],
    markers: [
      { x: WAR_DECLARATION_COOLDOWN_TURNS, label: "Filing cooldown ends" },
      { x: TRUCE_TURNS, label: "Truce ends" },
    ],
    caption:
      "A truce outlasts the filing cooldown, so a country can be free to file again while still barred from fighting that enemy. The truce line assumes a war ended at the moment of filing, for comparison only.",
  };
};

/** Upkeep climbs faster than power with each tech tier. */
const techTiers: WikiChartBuilder = () => {
  const tiers = TECH_TIERS.map((_, i) => i);
  const basePower = techPowerMult(0);
  const baseUpkeep = TECH_UPKEEP_MULT[0];
  return {
    title: "Technology tiers: power versus running cost",
    kind: "bar",
    xLabel: "Technology tier",
    yLabel: "Relative to a Legacy unit",
    unit: "x",
    categories: [...TECH_TIERS],
    series: [
      { name: "Combat power", points: tiers.map((i) => [i, round(techPowerMult(i) / basePower)]) },
      {
        name: "Upkeep",
        points: tiers.map((i) => [i, round(TECH_UPKEEP_MULT[i] / baseUpkeep)]),
      },
    ],
    caption:
      "Each step up buys less extra power than it adds in upkeep. A modern division is better than an old one and worse value than two of them.",
  };
};

/** Infantry Division price as a share of the price-anchor GDP, by country. */
const unitPriceByCountry: WikiChartBuilder = () => {
  const infantry = getUnitArchetype("ground", "Infantry Division");
  const baseShare = infantry ? (infantry.cost / ARCHETYPE_COST_GDP_DIVISOR) * 100 : 0;
  const rows = Object.entries(MILITARY_COUNTRY_SCALE)
    .map(([id, scale]) => ({ id, pct: round(baseShare * scale) }))
    .sort((a, b) => b.pct - a.pct);
  return {
    title: "What an Infantry Division costs, by country",
    kind: "bar",
    xLabel: "Country",
    yLabel: "Price as a share of the price-anchor GDP",
    unit: "%",
    categories: rows.map((r) => r.id),
    series: [{ name: "Infantry Division price", points: rows.map((r, i) => [i, r.pct]) }],
    caption:
      "Every country pays the same base share of its own economy, scaled by a country cost multiplier. The big powers pay the most.",
  };
};

/** Manpower pool refill, by conscription stance, as a share of population. */
const manpowerPool: WikiChartBuilder = () => {
  const pop = 1_000_000;
  const turns = range(0, 120, 2);
  const stances = Object.values(CONSCRIPTION_STANCES);
  return {
    title: "How fast the manpower pool refills",
    kind: "line",
    xLabel: "Turns",
    yLabel: "Manpower pool as a share of population",
    unit: "%",
    series: stances.map((s) => {
      const cap = manpowerCeiling(pop, s.poolMult);
      const regen = Math.floor(pop * ATTRITION.manpowerRegenFraction * s.poolMult);
      const start = initialManpowerPool(pop, s.poolMult);
      return {
        name: `${s.label} (x${s.poolMult})`,
        points: turns.map((t): [number, number] => [
          t,
          round((Math.min(cap, start + regen * t) / pop) * 100),
        ]),
      };
    }),
    caption: `A new world starts every pool at ${MANPOWER_START_FRACTION * 100}% of its ceiling. Heavier conscription stances refill faster and hold a higher ceiling.`,
  };
};

/** Veterancy while rebuilding a battered elite division. */
const xpDilution: WikiChartBuilder = () => {
  const archetype = getUnitArchetype("ground", "Infantry Division");
  const establishment = archetype?.personnel ?? 0;
  const run = (mode: "trained" | "conscript"): [number, number][] => {
    let unit: Pick<MilitaryUnit, "domain" | "type" | "personnel" | "vet" | "xp"> = {
      domain: "ground",
      type: "Infantry Division",
      personnel: Math.round(establishment * 0.4),
      vet: 4,
      xp: 0,
    };
    const pts: [number, number][] = [[0, unit.vet * 100 + unit.xp]];
    for (let t = 1; t <= 8; t++) {
      const r = reinforceUnit(unit, mode, Number.MAX_SAFE_INTEGER);
      unit = { ...unit, personnel: r.personnel, vet: r.vet, xp: r.xp };
      pts.push([t, unit.vet * 100 + unit.xp]);
    }
    return pts;
  };
  return {
    title: "Rebuilding an Elite division: trained versus conscript replacements",
    kind: "line",
    xLabel: "Turns of rebuilding (division starts at 40% strength)",
    yLabel: "Veterancy score (level x 100 + experience)",
    unit: "points",
    series: [
      {
        name: `Trained replacements (${ATTRITION.trainedFillRatio * 100}% refill a turn)`,
        points: run("trained"),
      },
      {
        name: `Conscripts (${ATTRITION.conscriptFillRatio * 100}% refill a turn)`,
        points: run("conscript"),
      },
    ],
    caption:
      "Conscripts refill the ranks faster but arrive with no experience, so an elite division rebuilt with them loses veterancy levels.",
  };
};

/** Where a general's skill points come from over a long career. */
const generalSkillPoints: WikiChartBuilder = () => {
  // Illustrative steady campaigning income; the rules themselves are in XP, not turns.
  const xpPerTurn = 4;
  const turns = range(0, 1000, 10);
  const rows = turns.map((t) => {
    const start: General = { level: 1, xp: 0, pts: 0 };
    const g = levelGeneral(start, t * xpPerTurn);
    const promotions = (g.level - 1) * POINTS_PER_PROMOTION;
    const postFm = g.postFieldMarshalPoints ?? 0;
    const tenure = Math.min(TENURE_POINT_CAP, Math.floor(t / TENURE_POINT_TURNS));
    return { t, promotions, postFm, tenure, total: STARTING_POINTS + promotions + postFm + tenure };
  });
  const pts = (pick: (r: (typeof rows)[number]) => number): [number, number][] =>
    rows.map((r) => [r.t, pick(r)]);
  const cap =
    STARTING_POINTS +
    (GENLVLXP.length - 1) * POINTS_PER_PROMOTION +
    TENURE_POINT_CAP +
    POST_FM_POINT_CAP;
  return {
    title: "A general's skill points over a career",
    kind: "step",
    xLabel: "Turns since commission",
    yLabel: "Skill points earned",
    unit: "points",
    series: [
      { name: "Total", points: pts((r) => r.total) },
      { name: "Commission", points: pts(() => STARTING_POINTS) },
      { name: "Promotions", points: pts((r) => r.promotions) },
      { name: "Tenure", points: pts((r) => r.tenure) },
      { name: "After Field Marshal", points: pts((r) => r.postFm) },
    ],
    markers: [
      { y: cap, label: "Career maximum" },
      ...GENLVLXP.slice(1).map((xp, i) => ({
        x: xp / xpPerTurn,
        label: `Promoted to ${GENRANK[i + 1]}`,
      })),
    ],
    caption: `Promotion timing assumes ${xpPerTurn} experience a turn of steady campaigning. Tenure alone stops paying after ${TENURE_POINT_CAP} points.`,
  };
};

/** Doctrine tree node counts by cost. */
const doctrineCosts: WikiChartBuilder = () => {
  const counts = new Map<number, number>();
  for (const cat of DOCTRINE_CATS)
    for (const path of cat.paths)
      for (const node of path.nodes) counts.set(node.cost, (counts.get(node.cost) ?? 0) + 1);
  const costs = [...counts.keys()].sort((a, b) => a - b);
  return {
    title: "Doctrine tree: how many nodes cost what",
    kind: "bar",
    xLabel: "Node cost",
    yLabel: "Number of nodes",
    unit: "nodes",
    categories: costs.map((c) => `${c} point${c === 1 ? "" : "s"}`),
    series: [{ name: "Nodes", points: costs.map((c, i) => [i, counts.get(c) ?? 0]) }],
    caption: "Most of the tree costs two to four points, so a nation has to specialise.",
  };
};

/** Doctrine point budget over the years. */
const doctrineBudget: WikiChartBuilder = () => {
  const years = range(0, 30);
  return {
    title: "Doctrine points a nation has earned",
    kind: "step",
    xLabel: "Game years since the world started",
    yLabel: "Cumulative doctrine points",
    unit: "points",
    series: [
      {
        name: "Budget",
        points: years.map((y): [number, number] => [
          y,
          DEFAULT_POINTS + y * DOCTRINE_POINTS_PER_YEAR,
        ]),
      },
    ],
    caption: `A nation starts with ${DEFAULT_POINTS} points and earns ${DOCTRINE_POINTS_PER_YEAR} more each game year (${TURNS_PER_YEAR} turns), far short of the whole tree.`,
  };
};

/** Command effectiveness against overload. */
const commandEffectiveness: WikiChartBuilder = () => {
  const baseRating = 70;
  const overloads = range(0, 20);
  const eff = (over: number, hasCommander: boolean) => {
    const units: Record<string, MilitaryUnit> = {};
    const unitIds: string[] = [];
    if (over > 0) {
      // A unit's load is basePower / 12, so this unit loads the command by exactly `over`.
      units.u = { basePower: over * 12 } as MilitaryUnit;
      unitIds.push("u");
    }
    return effectiveness(
      {
        base: baseRating,
        cap: 0,
        unitIds,
        commanderIds: hasCommander ? ["c"] : [],
      } as never,
      units
    );
  };
  return {
    title: "Command effectiveness when overloaded",
    kind: "line",
    xLabel: "Force load above capacity (points)",
    yLabel: "Effectiveness",
    series: [
      {
        name: "With a commander",
        points: overloads.map((o): [number, number] => [o, eff(o, true)]),
      },
      { name: "No commander", points: overloads.map((o): [number, number] => [o, eff(o, false)]) },
    ],
    markers: [{ y: CAPACITY.effFloor, label: "Effectiveness floor" }],
    caption: `Every point over capacity costs ${CAPACITY.overCapacityFactor} effectiveness, and a command with no commander starts ${CAPACITY.noCommanderPenalty} lower. Example uses a command rated ${baseRating}.`,
  };
};

export const MILITARY_CHARTS: Record<string, WikiChartBuilder> = {
  "war-declaration-timers": warTimers,
  "military-tech-tier-power-vs-upkeep": techTiers,
  "infantry-division-price-by-country": unitPriceByCountry,
  "manpower-pool-refill-by-stance": manpowerPool,
  "conscript-xp-dilution": xpDilution,
  "general-skill-point-sources": generalSkillPoints,
  "doctrine-node-cost-counts": doctrineCosts,
  "doctrine-point-budget": doctrineBudget,
  "command-effectiveness-overload": commandEffectiveness,
  ...MILITARY_WORLD_CHARTS,
};
