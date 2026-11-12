import { advanceStreak, type StreakRecord } from "./streak";
import type { CrisisScope } from "./types";

/**
 * An emergent trigger: a reading that stays past a threshold for a number of
 * turns proposes a crisis. Whether it opens is the director's call.
 */
export interface DetectorSpec {
  id: string;
  definitionId: string;
  scope: CrisisScope;
  comparator: "atLeast" | "atMost";
  threshold: number;
  sustainedTurns: number;
  /** Higher opens first when the director cannot fit everything. */
  priority: number;
}

export interface DetectorReading {
  /** Stable key for the thing watched, e.g. a country or region id. */
  key: string;
  countryIds: readonly string[];
  regionIds: readonly string[];
  value: number;
}

export interface DetectorProposal {
  reading: DetectorReading;
  streak: StreakRecord;
  /** How far past the threshold, as a share of the threshold's size. */
  excess: number;
}

export interface DetectorStep {
  /** Streaks to store, by reading key. */
  streaks: Map<string, StreakRecord>;
  /** Keys that had a stored streak and no longer hold. */
  cleared: string[];
  proposals: DetectorProposal[];
}

export function detectorHolds(spec: DetectorSpec, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  return spec.comparator === "atLeast" ? value >= spec.threshold : value <= spec.threshold;
}

export function detectorExcess(spec: DetectorSpec, value: number): number {
  const scale = Math.max(Math.abs(spec.threshold), 1);
  const gap = spec.comparator === "atLeast" ? value - spec.threshold : spec.threshold - value;
  return Math.max(0, gap) / scale;
}

/** Advances every streak one turn and lists the readings that have held long enough. */
export function stepDetector(
  spec: DetectorSpec,
  readings: readonly DetectorReading[],
  previous: ReadonlyMap<string, StreakRecord>,
  turn: number
): DetectorStep {
  const streaks = new Map<string, StreakRecord>();
  const proposals: DetectorProposal[] = [];

  for (const reading of readings) {
    const next = advanceStreak(previous.get(reading.key), detectorHolds(spec, reading.value), turn);
    if (!next) continue;
    streaks.set(reading.key, next);
    if (next.count >= spec.sustainedTurns) {
      proposals.push({ reading, streak: next, excess: detectorExcess(spec, reading.value) });
    }
  }
  const cleared = [...previous.keys()].filter((key) => !streaks.has(key));
  return { streaks, cleared, proposals };
}

/** A crisis of some definition that has already ended, as far as cooldown cares. */
export interface ResolvedCrisisRecord {
  endTurn: number;
  countryIds: readonly string[];
  regionIds: readonly string[];
}

/**
 * True while a detector must not reopen a crisis because one of the same
 * definition ended in the same place within the cooldown. Place is the regions
 * when the proposal names any, the countries otherwise.
 */
export function reopenCooldownActive(
  proposal: Pick<DetectorReading, "countryIds" | "regionIds">,
  resolved: readonly ResolvedCrisisRecord[],
  cooldownTurns: number,
  turn: number
): boolean {
  if (cooldownTurns <= 0) return false;
  const byRegion = proposal.regionIds.length > 0;
  const place = new Set(byRegion ? proposal.regionIds : proposal.countryIds);
  return resolved.some((record) => {
    if (turn - record.endTurn >= cooldownTurns) return false;
    const where = byRegion ? record.regionIds : record.countryIds;
    return where.some((id) => place.has(id));
  });
}
