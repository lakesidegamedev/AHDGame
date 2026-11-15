/**
 * Opening rules for the table-driven wave families. Plain readings in, an
 * annual chance out. A family opens only where every gate holds, so each one
 * has a condition a country or a policy can move out of; nothing here is
 * scheduled.
 */
import { TURNS_PER_YEAR } from "@/lib/constants/calendar";
import {
  waveFamilyTable,
  type WaveOpeningRule,
  type WaveSignalName,
  type WaveSignals,
} from "./waveFamilyTables";

const clamp = (value: number, min = 0, max = 1) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

/** 0 at `from`, 1 at `to`, in either direction. */
export function ramp(value: number, from: number, to: number): number {
  if (from === to) throw new Error("A ramp needs two different ends");
  return clamp((value - from) / (to - from));
}

export const EMPTY_WAVE_SIGNALS: WaveSignals = {
  healthPrevention: null,
  healthEfficiency: null,
  utilities: null,
  stewardship: null,
  integration: null,
  openness: null,
  integrity: null,
  energySecurity: null,
  rdIntensity: null,
  unemployment: null,
  gdpGrowth: null,
  urbanization: null,
  migrationRate: null,
  debtToGdp: null,
  tension: null,
  yearFraction: null,
  orbitalOperators: null,
  personalisedMediaOperators: null,
  sovereignCrisis: null,
};

/** Position in the year, 0..1, from the turn number. */
export function yearFractionOfTurn(turn: number): number {
  return (((turn % TURNS_PER_YEAR) + TURNS_PER_YEAR) % TURNS_PER_YEAR) / TURNS_PER_YEAR;
}

const reading = (signals: WaveSignals, name: WaveSignalName): number | null => {
  const value = signals[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/** True when the country can be hit: it is allowed and every gate holds. */
export function waveGatesHold(
  rule: WaveOpeningRule,
  countryId: string,
  signals: WaveSignals
): boolean {
  if (rule.onlyCountries && !rule.onlyCountries.includes(countryId)) return false;
  return rule.gates.every((gate) => {
    const value = reading(signals, gate.signal);
    if (value === null) return false;
    if (gate.min !== undefined && value < gate.min) return false;
    if (gate.max !== undefined && value > gate.max) return false;
    return true;
  });
}

/** Annual chance for one country whose gates hold. */
export function waveAnnualChance(rule: WaveOpeningRule, signals: WaveSignals): number {
  let chance = rule.baseAnnual;
  for (const stressor of rule.stressors) {
    const value = reading(signals, stressor.signal);
    if (value !== null) chance += stressor.weight * ramp(value, stressor.from, stressor.to);
  }
  return clamp(chance, 0, rule.capAnnual);
}

/**
 * Annual chance for every candidate. A family with a world threshold stays
 * shut for all of them until enough countries qualify together.
 */
export function waveAnnualChances(
  defKey: string,
  candidates: ReadonlyMap<string, WaveSignals>
): Map<string, number> {
  const rule = waveFamilyTable(defKey).opening;
  const qualifying = [...candidates].filter(([countryId, signals]) =>
    waveGatesHold(rule, countryId, signals)
  );
  const open = qualifying.length >= (rule.worldMinQualifying ?? 1);
  return new Map(
    qualifying.map(([countryId, signals]) => [
      countryId,
      open ? waveAnnualChance(rule, signals) : 0,
    ])
  );
}
