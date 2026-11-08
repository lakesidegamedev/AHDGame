/**
 * Turn shell for the living conflicts that can open after 2027. Reads the
 * live signals each family needs, then hands plain data to the rules in
 * `rules/futureConflicts.ts`. Signals are read only while a family could
 * actually take a new hit, so a family outside its window or resting after a
 * wave costs one state read and nothing else.
 */
import type { Db } from "mongodb";
import { loadCyberResilience } from "@/lib/cyber/resilience";
import { loadConflictState, type ConflictParticipants } from "./driver";
import { normalizeConflictState, phaseFor } from "./engine";
import { calendarWindowOpen } from "./rules/openingWindow";
import { waveAnnualChances, yearFractionOfTurn } from "./rules/waveFamilies";
import { waveFamilyKeys } from "./rules/waveFamilyTables";
import { loadWaveSignals, type WaveSignalCache } from "./waveSignalLoader";
import { resolveConflictParticipants } from "./rules/participants";
import {
  AI_LABOUR_SHOCK_KEY,
  INFRASTRUCTURE_CYBERATTACK_KEY,
  PACIFIC_STRAIT_KEY,
  aiLabourAnnualProbability,
  automationShareFromIndex,
  cyberAnnualProbability,
  planFutureWave,
  stackingAllows,
  straitAnnualProbability,
  waveCoolingDown,
  type CyberSignal,
  type LabourSignal,
} from "./rules/futureConflicts";
import type { LivingConflictDef } from "./types";

/** Settled phases in which each family rests between waves. */
export const FUTURE_CONFLICT_RESTING_PHASES: Record<string, readonly string[]> = {
  [AI_LABOUR_SHOCK_KEY]: ["absorbed", "reformed", "entrenched"],
  [PACIFIC_STRAIT_KEY]: ["managed_peace"],
  [INFRASTRUCTURE_CYBERATTACK_KEY]: ["restored"],
  ...Object.fromEntries(waveFamilyKeys().map((key) => [key, ["rested"]])),
};

export function isFutureConflictFamily(defKey: string): boolean {
  return defKey in FUTURE_CONFLICT_RESTING_PHASES;
}

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Country means of regional unemployment, its trend and the automation index. */
export async function loadLabourSignals(db: Db, countryIds: string[]): Promise<LabourSignal[]> {
  if (countryIds.length === 0) return [];
  const rows = await db
    .collection<{
      countryId?: string;
      economic?: {
        unemploymentRate?: { value?: number; trend?: number };
        automationIndex?: { value?: number };
      };
    }>("macroMetrics")
    .find(
      { countryId: { $in: countryIds } },
      {
        projection: {
          _id: 0,
          countryId: 1,
          "economic.unemploymentRate.value": 1,
          "economic.unemploymentRate.trend": 1,
          "economic.automationIndex.value": 1,
        },
      }
    )
    .toArray();
  return countryIds.map((countryId) => {
    const local = rows.filter((row) => row.countryId === countryId);
    const automation = mean(
      local.map((row) => row.economic?.automationIndex?.value).filter(finite)
    );
    return {
      countryId,
      automationShare: automationShareFromIndex(automation),
      unemployment: mean(local.map((row) => row.economic?.unemploymentRate?.value).filter(finite)),
      unemploymentTrend: mean(
        local.map((row) => row.economic?.unemploymentRate?.trend).filter(finite)
      ),
    };
  });
}

/** Cyber resilience (0..1) per country, from the shared cyber resilience score. */
export async function loadCyberSignals(db: Db, countryIds: string[]): Promise<CyberSignal[]> {
  return loadCyberResilience(db, countryIds);
}

export interface FutureConflictTurnContext {
  turn: number;
  year: number | null | undefined;
  /** Every live country, including background ones. */
  availableCountryIds: ReadonlySet<string>;
  /** Countries with regional data; only these can be hit by per-country families. */
  regionCountryIds: ReadonlySet<string>;
  /** World tension, 0..100. */
  tension: number;
  /** Severe living conflicts already holding each country this turn. */
  load: ReadonlyMap<string, number>;
  /** Shared by every family in a turn so country readings load once. */
  signalCache?: WaveSignalCache;
}

export interface FutureConflictTurnPlan {
  participants: ConflictParticipants;
  externalPressure: number;
  observedTrackValues: Record<string, number>;
}

/** Participants, opening pressure and observations for one family this turn. */
export async function planFutureConflictTurn(
  db: Db,
  def: LivingConflictDef,
  context: FutureConflictTurnContext
): Promise<FutureConflictTurnPlan> {
  const state = normalizeConflictState(def, await loadConflictState(db, def.key));
  const phaseKey = state.hasOpened ? (phaseFor(def, state.phaseLevel)?.key ?? null) : null;
  const resting = FUTURE_CONFLICT_RESTING_PHASES[def.key] ?? [];
  const canHit =
    calendarWindowOpen(def, context.year) && !waveCoolingDown(state, phaseKey, resting);
  const regionCountries = [...context.regionCountryIds].filter((id) =>
    context.availableCountryIds.has(id)
  );

  let annualProbability: (countryId: string) => number = () => 0;
  let candidates: string[] = [];
  if (canHit && def.key === AI_LABOUR_SHOCK_KEY) {
    const signals = await loadLabourSignals(db, regionCountries);
    const byCountry = new Map(signals.map((signal) => [signal.countryId, signal]));
    candidates = regionCountries;
    annualProbability = (countryId) => {
      const signal = byCountry.get(countryId);
      return signal ? aiLabourAnnualProbability(signal) : 0;
    };
  } else if (canHit && def.key === INFRASTRUCTURE_CYBERATTACK_KEY) {
    const signals = await loadCyberSignals(db, regionCountries);
    const byCountry = new Map(signals.map((signal) => [signal.countryId, signal]));
    candidates = regionCountries;
    annualProbability = (countryId) => {
      const signal = byCountry.get(countryId);
      return signal ? cyberAnnualProbability(context.tension, signal) : 0;
    };
  } else if (canHit && waveFamilyKeys().includes(def.key)) {
    const signals = await loadWaveSignals(db, regionCountries, context.signalCache ?? {});
    const shared = new Map(
      [...signals].map(([countryId, reading]) => [
        countryId,
        {
          ...reading,
          tension: context.tension,
          yearFraction: yearFractionOfTurn(context.turn),
        },
      ])
    );
    const chances = waveAnnualChances(def.key, shared);
    candidates = [...chances.keys()];
    annualProbability = (countryId) => chances.get(countryId) ?? 0;
  } else if (
    canHit &&
    def.key === PACIFIC_STRAIT_KEY &&
    context.availableCountryIds.has("US") &&
    context.availableCountryIds.has("CN") &&
    // The guarantor is a principal too: both must have room under the stacking limit.
    stackingAllows("US", context.load)
  ) {
    candidates = ["CN"];
    annualProbability = () => straitAnnualProbability(context.tension);
  }

  const wave = planFutureWave({
    defKey: def.key,
    state,
    phaseKey,
    restingPhaseKeys: resting,
    candidates,
    annualProbability,
    load: context.load,
    turn: context.turn,
  });

  if (def.key === PACIFIC_STRAIT_KEY) {
    return {
      participants: resolveConflictParticipants(def, context.availableCountryIds),
      externalPressure: wave.openingPressure,
      observedTrackValues: { ...wave.observed, worldTension: context.tension },
    };
  }
  const members = new Set(wave.members);
  return {
    participants: {
      belligerents: wave.members,
      neighbors: [],
      blocMembers: [],
      bystanders: [...context.availableCountryIds].filter((id) => !members.has(id)).sort(),
    },
    externalPressure: wave.openingPressure,
    observedTrackValues: wave.observed,
  };
}
