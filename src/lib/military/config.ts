/**
 * Army logistics and battle tuning. FRONT_SUPPLY sets what formations draw from a
 * front's supply pool (air, naval and rocket units draw 25%, units held in depth
 * 60%, a Logistics command covers 25% of demand, fighting on home soil gives 1.25x
 * throughput). FRONT_CAPACITY_BASE caps how much force fits in a line, ATTRITION
 * governs when a side breaks, and OCCUPATION turns battle wins into territory.
 */
// Tuning + presentation config for the Military Commands suite. All balance
// values live here — calc.ts must contain no magic numbers. Values are ported
// verbatim from the design mockup's DCLogic.
import type { CommandType, CommandPosture } from "./types";

export const COMMAND_TYPES: Record<
  CommandType,
  {
    label: string;
    short: string;
    bonuses: string[];
    mockupKey: "homeland" | "regional" | "logistics";
  }
> = {
  HOMELAND_DEFENSE: {
    label: "Homeland Defense",
    short: "HOMELAND",
    mockupKey: "homeland",
    bonuses: ["+ homeland defense", "+ air-defense integration", "+ faster reserve mobilization"],
  },
  REGIONAL: {
    label: "Regional Command",
    short: "REGIONAL",
    mockupKey: "regional",
    bonuses: ["+ balanced command", "+ regional readiness", "+ multi-region responsibility"],
  },
  LOGISTICS: {
    label: "Logistics",
    short: "LOGISTICS",
    mockupKey: "logistics",
    bonuses: ["+ supply throughput", "+ deployment speed", "+ overseas sustainment"],
  },
};

export const POSTURES: CommandPosture[] = [
  "Defensive",
  "Deterrence",
  "Expeditionary",
  "Counterinsurgency",
  "Invasion Prep",
  "Occupation",
  "Sea Control",
  "Sea Denial",
  "Air Defense",
  "Strategic Strike",
  "Rapid Response",
  "Training / Reserve",
];

export const POSTURE_FX: Record<CommandPosture, string[]> = {
  Defensive: ["+ defense readiness", "− offensive planning speed"],
  Deterrence: ["+ crisis response", "+ forward presence"],
  Expeditionary: ["+ deployment speed", "+ overseas sustainment", "− higher supply cost"],
  Counterinsurgency: [
    "+ stability operations",
    "+ intelligence-led security",
    "− conventional offense",
  ],
  "Invasion Prep": ["+ planning bonus", "+ amphibious/airborne readiness", "− high political risk"],
  Occupation: ["+ garrison control", "− tied-down forces"],
  "Sea Control": ["+ sea-lane security", "+ carrier operations"],
  "Sea Denial": ["+ area denial", "+ submarine ops"],
  "Air Defense": ["+ interception", "+ airspace integrity"],
  "Strategic Strike": ["+ deep strike", "+ deterrence"],
  "Rapid Response": ["+ reaction speed", "− sustainment depth"],
  "Training / Reserve": ["+ readiness recovery", "− not deployable"],
};

/** Effectiveness color thresholds -> AHD status intent ("success" | "warn" | "error"). */
export const EFF_THRESHOLDS = { good: 82, ok: 70 } as const;

/** Effectiveness penalty tuning (from mockup effOf). */
export const CAPACITY = {
  /** −10 effectiveness when a command has no commander. */
  noCommanderPenalty: 10,
  /** −1.6 effectiveness per point of force-load over capacity. */
  overCapacityFactor: 1.6,
  effFloor: 20,
} as const;

/**
 * Theater Commander — the one general `inCharge` of a Conflict.
 *
 * Their command bonus applies once, front-wide, to every own unit there: this
 * share of the combat-value edge their own trained traits would give the units
 * they personally lead. Deliberately a fraction, so a single strong TC can never
 * replace putting good generals on the units themselves — being in charge is
 * worth less than being present.
 *
 * Tune here. 0 disables the bonus without touching battle math.
 */
export const THEATER_COMMAND = {
  /** Fraction of the TC's own cv edge that carries to the whole front. */
  bonusShare: 0.25,
  /**
   * Share of a fighting general's award that the TC earns for a battle in their
   * theater, whether or not they led any unit in it.
   *
   * The measure is what a general leading ONE AVERAGE FORMATION at that front
   * would have earned. Not the front's total, which would let a superpower's TC
   * outlevel a small nation's. Not the mean over generals present, which shifts
   * with command structure and could be gamed for XP.
   *
   * Half, because commanding is worth less than commanding AND fighting.
   */
  xpShare: 0.5,
} as const;

/** Max regions per command. */
export const REGION_CAP = 3;

export const MAP_FILTERS = [
  { id: "coverage", label: "COVERAGE" },
  { id: "threat", label: "THREAT" },
  { id: "logi", label: "LOGISTICS" },
  { id: "naval", label: "NAVAL" },
  { id: "air", label: "AIRBASE" },
  { id: "ops", label: "OPERATIONS" },
  { id: "unassigned", label: "UNASSIGNED" },
];

/** Attrition, manpower and retreat tuning (first-pass — expected to move in playtest). */
export const ATTRITION = {
  /**
   * A side breaks when its round track falls below this (of 100).
   *
   * Was 25, which fired in 88-92% of battles -- so `retreatYield` and
   * `retreatCasualtyMult` were flat taxes the code described as conditional. At 9 a
   * break is roughly one battle in three: uncommon without being rare, which is what
   * makes both modifiers mean something again.
   */
  retreatTrack: 9,
  /**
   * How far a single battle's luck can move the odds it is actually fought at.
   *
   * `battleForecast` clamps `ratio` to 0.02..0.98 and every player-facing
   * surface calls it a chance. The attrition loop's damage multipliers
   * (`0.5 + ratio`, `1.5 - ratio`) made outcomes near-deterministic in the
   * force balance, so a displayed probability was not a probability. To fix
   * that, one roll per battle offsets the ratio the loop fights at:
   *
   *   effective = ratio + uniform(-fortuneSpread, +fortuneSpread)
   *
   * At 0.5 this is self-calibrating: P(effective > 0.5) equals `ratio`, so
   * realised win rates track the projection. Drawn ONCE per engagement, not
   * per round: the round notes, casualty split and margin all assume a single
   * day's luck for the whole battle.
   */
  fortuneSpread: 0.5,
  /** Maximum distance from parity used by the casualty/readiness exchange. */
  battleSeveritySpread: 0.18,
  /** Casualty multiplier for the side that broke off. */
  retreatCasualtyMult: 0.6,
  /** Max fraction of establishment refilled per turn, by mode. */
  trainedFillRatio: 0.1,
  conscriptFillRatio: 0.25,
  /** Experience score (vet×100 + xp) replacements arrive with. */
  trainedExpScore: 100,
  conscriptExpScore: 0,
  /** Pool regen per turn = population × this × stance multiplier. */
  manpowerRegenFraction: 0.0005,
  /** Pool ceiling = population × this × stance multiplier. */
  manpowerPoolCapFraction: 0.02,
} as const;

/**
 * How much of a naval formation's combat value reaches a LAND battle.
 *
 * A carrier air wing genuinely strikes inland; escorts exist to screen the carrier and
 * hold sea lanes, and contribute almost nothing to a division fighting inland of them.
 * Before this, `temperate` and `arid` -- the two families covering every inland front in
 * the game -- carried no naval multiplier at all, so a carrier strike group defended a
 * German forest at full strength and an attack submarine did it at 1.05.
 */
/**
 * What one engagement takes out of a formation's readiness, before modifiers.
 *
 * Readiness used to be ASSIGNED a level rather than subtracted, which inverted two of
 * its own terms: `armorMit` and the role's casualty weight both correctly reduce
 * CASUALTIES, and applied to a level they left armour and safe roles MORE exhausted. A
 * carrier that lost three men ended a battle at 8 readiness while an infantry division
 * that lost thousands ended at 25.
 */
/**
 * Combat value a front can hold in contact at once on open ground. Value beyond
 * this is in depth: it neither fights nor bleeds. Denominated in `frontageCost`
 * (combat value without the readiness curve). Smallest frontage at which army
 * size orders the result as expected; much higher and the war collapses.
 */
export const FRONT_CAPACITY_BASE = 4000;

/**
 * Share of a formation's strength that the worst possible engagement takes.
 *
 * All balance values live in this file, so this is named for tuning against a
 * simulation rather than by reading the calc layer. Currently 0.5: measured
 * casualties fell after front capacity and the readiness ledger landed, so the
 * expected compensation was not needed. Revisit only against a fresh simulation.
 */
export const CASUALTY_RATE_SCALE = 0.5;

/** How much of that width each terrain family actually offers. */
export const TERRAIN_CAPACITY = {
  /** The armoured corridor. The calibration case. */
  temperate: 1.0,
  /** Open desert, the widest frontage there is. */
  arid: 1.1,
  /** No land frontage to constrict. */
  maritime: 1.0,
  /** Canopy, swamp and delta break up a line. */
  littoral: 0.8,
  /** Passes constrict everything. */
  highland: 0.65,
} as const;

export const READINESS_DROP_BASE = 12;

/**
 * How much harder a worn formation is worked than a rested one, at full depletion.
 *
 * The operational-tempo escalator. A rested formation pays the base cost; one that has
 * been fighting without rest pays up to `1 + K` times as much for the same battle, so a
 * continuous pace genuinely leaves little room for rest.
 *
 * This term, not a smaller base, is what creates a cadence tradeoff. Measured: cutting
 * the cost from 77 to 8 with no escalator still made attacking every single turn the
 * best play by a wide margin. At K = 3 the optimum is every third turn and attacking
 * every turn goes NEGATIVE on ground taken.
 */
export const READINESS_TEMPO_K = 3;

export const NAVAL_REACH = {
  coastal: { carrier: 1.0, escort: 0.4 },
  inland: { carrier: 0.5, escort: 0.1 },
} as const;

/**
 * Territorial control. `ConflictDoc.control` is the share of the HOST country's
 * territory held by side B (0 = side A holds all of it, 100 = side B holds all).
 * Battles move it; reaching and holding a pole until the applicable duration
 * elapses ends the war.
 */
export const OCCUPATION = {
  /** Battle `margin` at which a win counts as decisive (mirrors the verdict ladder). */
  decisiveMargin: 45,
  /** Points of the 0–100 track a decisive win takes. */
  maxShift: 5,
  /** Ground multiplier when the loser broke off instead of being broken in place. */
  retreatYield: 0.7,
  /**
   * Progress from the front's STARTING line at which a war reads as winding down
   * (`battleResolution.ts`). `peaceOffer.ts` keeps its own copy of the same value
   * as the ground a settlement may demand. Measured from the start, since an
   * interstate war opens with the defender already holding all of its own soil.
   *
   * This used to also gate a `deepPushMult` that halved every advance once the
   * winner's ABSOLUTE share crossed it. Because it keyed on the winner, past that
   * mark the attacker's wins were halved and the defender's were not, which on a
   * near-even front is a wall rather than a slowdown (see
   * `scripts/sim/reports/control-drift-deep-push.md`). The supply penalties in
   * `derivedSupply` already slow a deep push, so the drag was removed from
   * `occupationShift`.
   */
  deepPushDepth: 0.75,
  /**
   * Turns a war takes to reach full pace, and the fraction of a normal advance the
   * front moves on turn one.
   *
   * `classifyWarEntry` gives the HOST side collective defence, which is immediate, and
   * the attacking side an offensive coalition, which needs a vote, ratification and
   * mobilisation. That asymmetry is deliberate. Without a ramp, the defender's bloc
   * advances and can decide the war before the attacker's bloc is allowed to field an
   * army.
   *
   * The advance is worth `mobilizationFloor` on the opening turn and reaches full
   * value at `mobilizationTurns`. A war can still be lost in the window, just not run
   * to the pole before the other side arrives.
   */
  mobilizationTurns: 50,
  mobilizationFloor: 0.4,
  /** Supply lost at full compression / full overextension, off the side's baseline. */
  compressionPenalty: 40,
  overextensionPenalty: 15,
  /** Supply never falls below this. */
  minSupply: 10,
  /** Conflict supply at which a side's theatre logistics are neutral (×1.0). */
  supplyNeutral: 60,
} as const;

/**
 * Front supply: what a formation draws from the pool and what feeds it.
 *
 * `supplyState` is throughput / demand at a front. Demand was every formation's
 * treasury upkeep / 12 regardless of what it was or where it stood, and throughput was
 * a set of flat constants sized for an eleven-formation front (the calibration anchor
 * for FRONT_CAPACITY_BASE). Measured on the live German front at turn 503, 59 Warsaw
 * Pact formations read CUT OFF at level 22 with 84% air superiority, and the largest
 * single term was the air arm: 905 of 1,871 demand was fighter, bomber, air-defence and
 * rocket formations parked at a LAND front, billed like divisions in the mud because a
 * jet is expensive. A Logistics command was worth a flat +20 against a deficit of
 * ~1,160. Full workings in scripts/sim/reports/front-supply-2026-08-30.md.
 */
export const FRONT_SUPPLY = {
  /**
   * Share of upkeep an air, naval, rocket or space formation draws from the land-front
   * pool. Its cost is in airframes and hulls, not trucked tonnage, and since the naval
   * and air layer it fights from a station rather than the line. Ground and marine pay
   * in full: marines are amphibious ground troops and fight ashore.
   */
  offFrontDemand: 0.25,
  /**
   * Share of upkeep a formation the ENGAGEMENT PLAN leaves in depth draws. Depth
   * engages at 0.10 and bleeds at 0.15; billing it full ammunition and fuel was the
   * one place the model charged it as if it were in the line. Keyed on the plan, never
   * the player's label, for the same reason the tail bonus is.
   */
  depthDemand: 0.6,
  /**
   * Share of a contingent's front demand a perfectly effective Logistics command
   * covering the region delivers, in place of the old flat 20. Scales with the army it
   * feeds, so the command is worth standing up for a coalition front and not only for
   * the eleven-formation one it was sized against. Effectiveness (commanders,
   * capacity) multiplies it, and overlapping commands take the strongest, not the sum.
   */
  logisticsCommandShare: 0.25,
  /**
   * Throughput multiplier for the side fighting on its own soil (the side holding the
   * conflict's host country, which in an interstate war is the nation declared on).
   * Interior lines, home depots and rail. In a civil or independence war that is the
   * government's side, which owns the depots; a proxy war's host is a world entity on
   * neither roster, so neither faction gets it. Measured at x1.10 (indistinguishable from
   * none), x1.25 and x1.50 (lets a defender stack a front without limit and hands +50%
   * to a side already holding 85% of the map); x1.25 keeps the stacking cost real.
   */
  hostSideThroughput: 1.25,
} as const;
