/**
 * Pooled referendum rules for a bloc of states that vote as one electorate.
 * A single region is a bloc of one, so every function returns exactly what the
 * single-region path computes when given one member.
 */
import { recenterLeans } from "./cohorts";

export interface PooledMember {
  regionId: string;
  population: number;
}

export interface PooledCohort {
  groupId: string;
  share: number;
  turnout: number;
  yesLean: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Each member's share of the bloc's population; equal shares when population is unknown. */
export function populationShares(members: readonly PooledMember[]): number[] {
  const total = members.reduce((sum, member) => sum + Math.max(0, member.population), 0);
  if (total <= 0) return members.map(() => 1 / Math.max(1, members.length));
  return members.map((member) => Math.max(0, member.population) / total);
}

/** The bloc's independence desire: the population-weighted mean of its members' desire. */
export function pooledDesire(members: ReadonlyArray<PooledMember & { desire: number }>): number {
  if (members.length === 0) return 0;
  if (members.length === 1) return members[0].desire;
  const shares = populationShares(members);
  return clamp(
    members.reduce((sum, member, i) => sum + member.desire * shares[i], 0),
    0,
    100
  );
}

/**
 * One electorate from each member's own cohorts. Member cohorts keep their
 * identity (`<member>:<group>`) so a campaign can target one state's voters;
 * shares are scaled by population and leans are re-centered so the pooled
 * Yes share equals `target` at campaign open.
 */
export function poolCohorts(
  members: ReadonlyArray<PooledMember & { cohorts: readonly PooledCohort[] }>,
  target: number
): PooledCohort[] {
  if (members.length === 1) return members[0].cohorts.map((cohort) => ({ ...cohort }));
  const shares = populationShares(members);
  const raw = members.flatMap((member, i) =>
    member.cohorts.map((cohort) => ({
      ...cohort,
      groupId: `${member.regionId}:${cohort.groupId}`,
      share: cohort.share * shares[i],
    }))
  );
  const leans = recenterLeans(raw, target);
  return raw.map((cohort, i) => ({ ...cohort, yesLean: leans[i] }));
}

/** The member a pooled cohort belongs to, or null for a single-region cohort. */
export function cohortMember(groupId: string): string | null {
  const at = groupId.indexOf(":");
  return at > 0 ? groupId.slice(0, at) : null;
}

/**
 * The state whose Governor leads the successor until it elects its own
 * government: the most populous member, with ties going to the lower id.
 */
export function interimHeadRegion(members: readonly PooledMember[]): string | null {
  if (members.length === 0) return null;
  return [...members].sort(
    (a, b) => b.population - a.population || a.regionId.localeCompare(b.regionId)
  )[0].regionId;
}
