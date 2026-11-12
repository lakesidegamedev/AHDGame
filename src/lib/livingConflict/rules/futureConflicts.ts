/**
 * Shared rules for the living-conflict families that can open after 2027.
 *
 * Each family is one world-level wave. The countries it hits are its
 * belligerents, recorded as `member:<countryId>` tracks on the conflict state,
 * so one phase ladder, one response menu and one resolution path serve every
 * affected country without a per-country state machine.
 *
 * Nothing here is scheduled. A country joins a wave only when its live
 * conditions hold and a deterministic roll, seeded by family, country and
 * turn, passes. A replayed turn rolls the same numbers.
 */
import { TURNS_PER_YEAR } from "@/lib/constants/calendar";
import { TECH_LABOR_REDUCTION_CAP } from "@/lib/constants/techTree/effects";
import type { LivingConflictState } from "../types";

/** At most this many severe living conflicts may hold a country at once. */
export const SEVERE_CONFLICT_LIMIT = 2;
export const MEMBER_TRACK_PREFIX = "member:";
/** Turns a resolved wave rests before the same family may hit again (two years). */
export const FUTURE_WAVE_COOLDOWN_TURNS = 2 * TURNS_PER_YEAR;

const clamp = (value: number, min = 0, max = 1) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

/**
 * FNV-1a over the joined parts with a murmur3 finaliser, mapped to [0, 1).
 * The finaliser matters: plain FNV clusters on consecutive turn numbers, so a
 * per-turn roll could miss for years at a time.
 */
export function seededUnit(...parts: Array<string | number>): number {
  let hash = 0x811c9dc5;
  for (const character of parts.join("|")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x100000000;
}

/** The per-turn chance that compounds to the given annual probability. */
export function perTurnChance(annualProbability: number): number {
  const annual = clamp(annualProbability);
  if (annual <= 0) return 0;
  if (annual >= 1) return 1;
  return 1 - (1 - annual) ** (1 / TURNS_PER_YEAR);
}

export function seededRoll(annualProbability: number, ...parts: Array<string | number>): boolean {
  const chance = perTurnChance(annualProbability);
  return chance > 0 && seededUnit(...parts) < chance;
}

export interface SevereMembership {
  defKey: string;
  countryIds: string[];
}

/** How many severe living conflicts already hold each country, other families only. */
export function severeConflictLoad(
  memberships: readonly SevereMembership[],
  excludeDefKey?: string
): Map<string, number> {
  const load = new Map<string, number>();
  for (const membership of memberships) {
    if (membership.defKey === excludeDefKey) continue;
    for (const countryId of new Set(membership.countryIds)) {
      load.set(countryId, (load.get(countryId) ?? 0) + 1);
    }
  }
  return load;
}

/** A third severe conflict queues: the country is not hit until a slot frees. */
export function stackingAllows(countryId: string, load: ReadonlyMap<string, number>): boolean {
  return (load.get(countryId) ?? 0) < SEVERE_CONFLICT_LIMIT;
}

export function memberCountries(state: Pick<LivingConflictState, "tracks">): string[] {
  return Object.entries(state.tracks ?? {})
    .filter(([key, value]) => key.startsWith(MEMBER_TRACK_PREFIX) && value >= 1)
    .map(([key]) => key.slice(MEMBER_TRACK_PREFIX.length))
    .sort();
}

export interface WaveMembershipInput {
  state: Pick<LivingConflictState, "hasOpened" | "status" | "tracks">;
  /** Key of the conflict's current phase, or null before it opens. */
  phaseKey: string | null;
  /** Settled phases in which the wave rests. */
  restingPhaseKeys: readonly string[];
  /** Countries whose conditions held and whose roll passed this turn. */
  hits: readonly string[];
}

export interface WaveMembership {
  members: string[];
  /** Authoritative track values for the driver to apply this turn. */
  observed: Record<string, number>;
  /** Opening pressure for a wave that has never opened. */
  openingPressure: number;
  /** True when this turn's hits may start a wave. */
  canStartWave: boolean;
}

/**
 * Decide who belongs to the wave this turn. An active wave keeps its members
 * and admits new hits. A resting wave clears its members and ignores hits
 * until its cooldown has run, after which new hits start a fresh wave.
 */
export function waveMembership(input: WaveMembershipInput): WaveMembership {
  const previous = memberCountries(input.state);
  const resting = input.phaseKey !== null && input.restingPhaseKeys.includes(input.phaseKey);
  const rested = (input.state.tracks?.recoveryTurns ?? 0) >= FUTURE_WAVE_COOLDOWN_TURNS;
  const canStartWave = !input.state.hasOpened || (resting && rested);
  const hits = [...new Set(input.hits)].sort();
  const members = canStartWave ? hits : resting ? [] : [...new Set([...previous, ...hits])].sort();
  const observed: Record<string, number> = {};
  for (const countryId of new Set([...previous, ...members])) {
    observed[`${MEMBER_TRACK_PREFIX}${countryId}`] = members.includes(countryId) ? 1 : 0;
  }
  observed.waveSignal = canStartWave ? hits.length : 0;
  return {
    members,
    observed,
    openingPressure: input.state.hasOpened ? 0 : hits.length,
    canStartWave,
  };
}

// AI labour shock.

export const AI_LABOUR_SHOCK_KEY = "ai_labour_shock";
/** Share of the maximum automation labour saving a country must reach. */
export const AI_LABOUR_AUTOMATION_THRESHOLD = 0.15;

/**
 * Automation share proxy. The corporate turn records a worker-weighted
 * automation index per region: 1 means no automation technology and
 * `1 - TECH_LABOR_REDUCTION_CAP` means full automation. The share is how far
 * along that range a country sits.
 */
export function automationShareFromIndex(index: number | null | undefined): number | null {
  if (typeof index !== "number" || !Number.isFinite(index)) return null;
  return clamp((1 - index) / TECH_LABOR_REDUCTION_CAP);
}

export interface LabourSignal {
  countryId: string;
  automationShare: number | null;
  /** Unemployment rate in percent. */
  unemployment: number | null;
  /** Recent change in the unemployment rate, when the metric records one. */
  unemploymentTrend: number | null;
}

/** Annual chance a country enters the AI labour shock; zero when its conditions fail. */
export function aiLabourAnnualProbability(signal: LabourSignal): number {
  const share = signal.automationShare;
  const unemployment = signal.unemployment;
  if (share === null || unemployment === null) return 0;
  if (share < AI_LABOUR_AUTOMATION_THRESHOLD) return 0;
  const rising =
    signal.unemploymentTrend !== null ? signal.unemploymentTrend > 0 : unemployment >= 6;
  if (!rising) return 0;
  return clamp(
    0.2 + (share - AI_LABOUR_AUTOMATION_THRESHOLD) + Math.max(0, unemployment - 5) * 0.03,
    0,
    0.8
  );
}

// Pacific strait crisis.

export const PACIFIC_STRAIT_KEY = "pacific_strait_crisis";
export const STRAIT_TENSION_THRESHOLD = 45;

/** Annual chance the strait crisis opens at a given world tension (0..100). */
export function straitAnnualProbability(tension: number): number {
  if (!Number.isFinite(tension) || tension < STRAIT_TENSION_THRESHOLD) return 0;
  return clamp(0.15 + ((tension - STRAIT_TENSION_THRESHOLD) / 55) * 0.6, 0, 0.75);
}

// Infrastructure cyberattack.

export const INFRASTRUCTURE_CYBERATTACK_KEY = "infrastructure_cyberattack";
/** Below this world tension (detente) no state-backed campaign is mounted. */
export const CYBER_TENSION_FLOOR = 15;

export interface CyberSignal {
  countryId: string;
  /** Cyber resilience score, 0..1 (`cyber/rules.ts`); null when the country has no board. */
  resilience: number | null;
}

/** Annual chance a country is hit, rising with tension and falling with resilience. */
export function cyberAnnualProbability(tension: number, signal: CyberSignal): number {
  if (!Number.isFinite(tension) || tension < CYBER_TENSION_FLOOR) return 0;
  if (signal.resilience === null) return 0;
  const exposure = 1.5 - clamp(signal.resilience, 0, 1);
  return clamp((0.04 + (0.2 * Math.min(100, tension)) / 100) * exposure, 0, 0.4);
}

// Turn planning shared by the three families.

export interface FutureWavePlanInput {
  defKey: string;
  state: Pick<LivingConflictState, "hasOpened" | "status" | "tracks">;
  phaseKey: string | null;
  restingPhaseKeys: readonly string[];
  /** Countries whose data lets them be hit, sorted or not. */
  candidates: readonly string[];
  annualProbability: (countryId: string) => number;
  load: ReadonlyMap<string, number>;
  turn: number;
}

/** Roll every eligible candidate and settle this turn's membership. */
export function planFutureWave(input: FutureWavePlanInput): WaveMembership {
  const current = new Set(memberCountries(input.state));
  const hits = [...new Set(input.candidates)]
    .sort()
    .filter(
      (countryId) =>
        !current.has(countryId) &&
        stackingAllows(countryId, input.load) &&
        seededRoll(input.annualProbability(countryId), input.defKey, countryId, input.turn)
    );
  return waveMembership({
    state: input.state,
    phaseKey: input.phaseKey,
    restingPhaseKeys: input.restingPhaseKeys,
    hits,
  });
}

/** True while a resting wave's cooldown still blocks any new hit. */
export function waveCoolingDown(
  state: Pick<LivingConflictState, "hasOpened" | "tracks">,
  phaseKey: string | null,
  restingPhaseKeys: readonly string[]
): boolean {
  return (
    state.hasOpened &&
    phaseKey !== null &&
    restingPhaseKeys.includes(phaseKey) &&
    (state.tracks?.recoveryTurns ?? 0) < FUTURE_WAVE_COOLDOWN_TURNS
  );
}
