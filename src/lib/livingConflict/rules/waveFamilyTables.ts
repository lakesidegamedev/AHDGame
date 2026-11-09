/**
 * Every number behind the table-driven wave families, in one place: when a
 * family can hit a country, how its phases move, and how hard each response
 * outcome lands. Definitions and signal rules read these tables and nothing
 * else, so retuning a family never means hunting through content files.
 *
 * Opening probabilities are annual, per country, before the seeded roll.
 */

/** Readings a family may gate or stress on. All are per country except tension and yearFraction. */
export type WaveSignalName =
  | "healthPrevention"
  | "healthEfficiency"
  | "utilities"
  | "stewardship"
  | "integration"
  | "openness"
  | "integrity"
  | "energySecurity"
  | "rdIntensity"
  | "unemployment"
  | "gdpGrowth"
  | "urbanization"
  | "migrationRate"
  | "debtToGdp"
  | "tension"
  | "yearFraction"
  | "orbitalOperators"
  | "personalisedMediaOperators"
  | "sovereignCrisis";

/** Every named signal holds a reading, or null when the country has none. */
export type WaveSignals = Record<WaveSignalName, number | null>;

/** The family cannot hit unless the signal lies inside the closed range. */
export interface WaveGate {
  signal: WaveSignalName;
  min?: number;
  max?: number;
}

/** Adds `weight` of annual chance as the signal moves from `from` to `to`. */
export interface WaveStressor {
  signal: WaveSignalName;
  from: number;
  to: number;
  weight: number;
}

export interface WaveOpeningRule {
  baseAnnual: number;
  capAnnual: number;
  gates: WaveGate[];
  stressors: WaveStressor[];
  /** Countries that qualify at all; omitted means every country with data. */
  onlyCountries?: string[];
  /** The family stays shut until this many countries pass every gate at once. */
  worldMinQualifying?: number;
}

/** How a wave's tracks move. Phases are onset, peak, recovery and rested. */
export interface WaveDynamics {
  startPressure: number;
  /** Onset pressure grows by `onsetStep` every `onsetEveryTurns` turns. */
  onsetEveryTurns: number;
  onsetStep: number;
  /** Peak escalation and recovery grow every `peakEveryTurns` turns. */
  peakEveryTurns: number;
  peakStep: number;
  repairStep: number;
  /** Pressure at which onset becomes peak. */
  peakAt: number;
  /** Mitigation at which onset is contained straight into recovery. */
  containAt: number;
  /** Recovery at which peak turns into recovery. */
  recoverAt: number;
  /** Pressure at which recovery relapses into peak. */
  relapseAt: number;
  /** Recovery needed, with escalation below `settledEscalationMax`, to settle. */
  settleAt: number;
  settledEscalationMax: number;
  /** Turns leaders have to answer each response window. */
  windowTurns: number;
  /** Track growth when a window closes with no effective response. */
  uncheckedStep: number;
  /** Track growth each response outcome applies. */
  containedStep: number;
  softenedStep: number;
  adaptedStep: number;
  /** Per-turn decay of every track while the wave rests. */
  restDecay: number;
}

/** Multiplier on the family's base effects for each outcome. */
export interface WaveEffectScale {
  contained: number;
  softened: number;
  adapted: number;
  unchecked: number;
}

export interface WaveFamilyTable {
  fromYear: number;
  untilYear?: number;
  opening: WaveOpeningRule;
  dynamics: WaveDynamics;
  scale: WaveEffectScale;
}

/** Slow burn: a pandemic takes months to bite and longer to clear. */
const SLOW: Omit<WaveDynamics, "startPressure" | "peakAt" | "windowTurns"> = {
  onsetEveryTurns: 3,
  onsetStep: 2,
  peakEveryTurns: 2,
  peakStep: 3,
  repairStep: 2,
  containAt: 50,
  recoverAt: 40,
  relapseAt: 75,
  settleAt: 60,
  settledEscalationMax: 10,
  uncheckedStep: 12,
  containedStep: 30,
  softenedStep: 15,
  adaptedStep: 10,
  restDecay: 1,
};

/** Damage scales for a harmful family: a lever cuts it, doing nothing worsens it. */
const HARM_SCALE: WaveEffectScale = {
  contained: 0.25,
  softened: 0.6,
  adapted: 0.9,
  unchecked: 1.5,
};

export const SECOND_PANDEMIC_KEY = "second_pandemic";
export const SOVEREIGN_DEBT_WAVE_KEY = "sovereign_debt_wave";
export const GRID_CASCADE_KEY = "grid_cascade";
export const CRITICAL_MINERALS_KEY = "critical_minerals_squeeze";
export const CLIMATE_MIGRATION_KEY = "climate_migration_surge";
export const ARCTIC_OPENING_KEY = "arctic_opening";
export const ANTIMICROBIAL_RESISTANCE_KEY = "antimicrobial_resistance";
export const ORBITAL_DEBRIS_KEY = "orbital_debris";
export const FUSION_BREAKTHROUGH_KEY = "fusion_breakthrough";
export const ELECTION_INTEGRITY_KEY = "election_integrity_crisis";

export const WAVE_FAMILY_TABLES: Record<string, WaveFamilyTable> = {
  [SECOND_PANDEMIC_KEY]: {
    fromYear: 2031,
    opening: {
      baseAnnual: 0.001,
      capAnnual: 0.02,
      gates: [{ signal: "healthPrevention", max: 70 }],
      stressors: [
        { signal: "healthPrevention", from: 65, to: 25, weight: 0.008 },
        { signal: "urbanization", from: 60, to: 90, weight: 0.003 },
      ],
    },
    dynamics: { ...SLOW, startPressure: 30, peakAt: 60, windowTurns: 24 },
    scale: HARM_SCALE,
  },
  [SOVEREIGN_DEBT_WAVE_KEY]: {
    fromYear: 2028,
    opening: {
      baseAnnual: 0.02,
      capAnnual: 0.25,
      gates: [
        { signal: "debtToGdp", min: 100 },
        { signal: "gdpGrowth", max: 1.5 },
        // 1 while the country is already in its own sovereign default crisis
        { signal: "sovereignCrisis", max: 0 },
      ],
      stressors: [
        { signal: "debtToGdp", from: 100, to: 200, weight: 0.1 },
        { signal: "gdpGrowth", from: 1.5, to: -2, weight: 0.08 },
      ],
      worldMinQualifying: 3,
    },
    dynamics: { ...SLOW, startPressure: 35, peakAt: 60, windowTurns: 24, onsetEveryTurns: 2 },
    scale: HARM_SCALE,
  },
  [GRID_CASCADE_KEY]: {
    fromYear: 2030,
    opening: {
      baseAnnual: 0.04,
      capAnnual: 0.4,
      gates: [
        { signal: "utilities", max: 60 },
        { signal: "yearFraction", min: 0.4, max: 0.7 },
      ],
      stressors: [
        { signal: "utilities", from: 60, to: 20, weight: 0.25 },
        { signal: "stewardship", from: 60, to: 20, weight: 0.1 },
      ],
    },
    dynamics: {
      ...SLOW,
      startPressure: 35,
      peakAt: 55,
      windowTurns: 12,
      onsetEveryTurns: 2,
      repairStep: 3,
    },
    scale: HARM_SCALE,
  },
  [CRITICAL_MINERALS_KEY]: {
    fromYear: 2028,
    opening: {
      baseAnnual: 0.03,
      capAnnual: 0.3,
      gates: [
        { signal: "tension", min: 35 },
        { signal: "rdIntensity", min: 1.5 },
      ],
      stressors: [
        { signal: "tension", from: 35, to: 80, weight: 0.2 },
        { signal: "rdIntensity", from: 1.5, to: 4, weight: 0.08 },
      ],
    },
    dynamics: { ...SLOW, startPressure: 30, peakAt: 60, windowTurns: 24, onsetEveryTurns: 4 },
    scale: HARM_SCALE,
  },
  [CLIMATE_MIGRATION_KEY]: {
    fromYear: 2035,
    opening: {
      baseAnnual: 0.02,
      capAnnual: 0.25,
      gates: [
        { signal: "migrationRate", min: 0.2 },
        { signal: "stewardship", max: 55 },
      ],
      stressors: [
        { signal: "stewardship", from: 55, to: 20, weight: 0.1 },
        { signal: "migrationRate", from: 0.2, to: 1, weight: 0.08 },
        { signal: "integration", from: 60, to: 25, weight: 0.05 },
      ],
    },
    dynamics: { ...SLOW, startPressure: 30, peakAt: 60, windowTurns: 24, onsetEveryTurns: 4 },
    scale: HARM_SCALE,
  },
  [ARCTIC_OPENING_KEY]: {
    fromYear: 2033,
    opening: {
      baseAnnual: 0.03,
      capAnnual: 0.3,
      onlyCountries: ["US", "RU", "SE", "FI"],
      gates: [{ signal: "stewardship", max: 60 }],
      stressors: [
        { signal: "stewardship", from: 60, to: 20, weight: 0.1 },
        { signal: "tension", from: 20, to: 70, weight: 0.1 },
      ],
    },
    dynamics: { ...SLOW, startPressure: 25, peakAt: 60, windowTurns: 24, onsetEveryTurns: 4 },
    scale: HARM_SCALE,
  },
  [ANTIMICROBIAL_RESISTANCE_KEY]: {
    fromYear: 2036,
    opening: {
      baseAnnual: 0.01,
      capAnnual: 0.2,
      gates: [{ signal: "healthPrevention", max: 55 }],
      stressors: [
        { signal: "healthPrevention", from: 55, to: 20, weight: 0.1 },
        { signal: "healthEfficiency", from: 60, to: 25, weight: 0.05 },
      ],
    },
    dynamics: { ...SLOW, startPressure: 25, peakAt: 60, windowTurns: 24, onsetEveryTurns: 4 },
    scale: HARM_SCALE,
  },
  [ORBITAL_DEBRIS_KEY]: {
    fromYear: 2040,
    opening: {
      baseAnnual: 0.01,
      capAnnual: 0.15,
      gates: [{ signal: "orbitalOperators", min: 1 }],
      stressors: [
        { signal: "orbitalOperators", from: 1, to: 8, weight: 0.08 },
        { signal: "tension", from: 30, to: 80, weight: 0.06 },
      ],
    },
    dynamics: { ...SLOW, startPressure: 30, peakAt: 55, windowTurns: 24, onsetEveryTurns: 3 },
    scale: HARM_SCALE,
  },
  [FUSION_BREAKTHROUGH_KEY]: {
    fromYear: 2042,
    opening: {
      baseAnnual: 0.01,
      capAnnual: 0.2,
      gates: [
        { signal: "rdIntensity", min: 2.8 },
        { signal: "energySecurity", min: 35 },
      ],
      stressors: [
        { signal: "rdIntensity", from: 2.8, to: 5, weight: 0.1 },
        { signal: "utilities", from: 40, to: 80, weight: 0.04 },
      ],
    },
    dynamics: { ...SLOW, startPressure: 30, peakAt: 55, windowTurns: 24, onsetEveryTurns: 4 },
    scale: { contained: 1.5, softened: 1, adapted: 0.7, unchecked: 0.2 },
  },
  [ELECTION_INTEGRITY_KEY]: {
    fromYear: 2028,
    opening: {
      baseAnnual: 0.02,
      capAnnual: 0.3,
      gates: [{ signal: "integrity", max: 55 }],
      stressors: [
        { signal: "integrity", from: 55, to: 20, weight: 0.12 },
        { signal: "openness", from: 60, to: 25, weight: 0.08 },
        { signal: "personalisedMediaOperators", from: 0, to: 6, weight: 0.06 },
      ],
    },
    dynamics: { ...SLOW, startPressure: 30, peakAt: 60, windowTurns: 24, onsetEveryTurns: 3 },
    scale: HARM_SCALE,
  },
};

const TABLE_NUMBER_FIELDS = (table: WaveFamilyTable): Array<[string, unknown]> => [
  ["fromYear", table.fromYear],
  ["opening.baseAnnual", table.opening.baseAnnual],
  ["opening.capAnnual", table.opening.capAnnual],
  ...Object.entries(table.dynamics).map(([key, value]): [string, unknown] => [
    `dynamics.${key}`,
    value,
  ]),
  ...Object.entries(table.scale).map(([key, value]): [string, unknown] => [`scale.${key}`, value]),
  ...table.opening.stressors.flatMap((stressor, index): Array<[string, unknown]> => [
    [`opening.stressors[${index}].from`, stressor.from],
    [`opening.stressors[${index}].to`, stressor.to],
    [`opening.stressors[${index}].weight`, stressor.weight],
  ]),
];

const REQUIRED_DYNAMICS: Array<keyof WaveDynamics> = [
  "startPressure",
  "onsetEveryTurns",
  "onsetStep",
  "peakEveryTurns",
  "peakStep",
  "repairStep",
  "peakAt",
  "containAt",
  "recoverAt",
  "relapseAt",
  "settleAt",
  "settledEscalationMax",
  "windowTurns",
  "uncheckedStep",
  "containedStep",
  "softenedStep",
  "adaptedStep",
  "restDecay",
];
const REQUIRED_SCALES: Array<keyof WaveEffectScale> = [
  "contained",
  "softened",
  "adapted",
  "unchecked",
];

/** The table for a family; a missing family or any missing number throws. */
export function waveFamilyTable(key: string): WaveFamilyTable {
  const table = WAVE_FAMILY_TABLES[key];
  if (!table) throw new Error(`Wave family ${key} has no table`);
  for (const [field, value] of TABLE_NUMBER_FIELDS(table)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Wave family ${key} is missing a number for ${field}`);
    }
  }
  for (const field of REQUIRED_DYNAMICS) {
    if (!(field in table.dynamics)) throw new Error(`Wave family ${key} lacks dynamics.${field}`);
  }
  for (const field of REQUIRED_SCALES) {
    if (!(field in table.scale)) throw new Error(`Wave family ${key} lacks scale.${field}`);
  }
  if (table.opening.gates.length === 0) {
    throw new Error(`Wave family ${key} has no opening gate, so it could not be prevented`);
  }
  return table;
}

export function waveFamilyKeys(): string[] {
  return Object.keys(WAVE_FAMILY_TABLES);
}
