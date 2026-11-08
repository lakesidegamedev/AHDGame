/**
 * Era gating for generated politician names.
 *
 * Name pools are flat lists with no sense of when a name entered use, so
 * every era drew from the same modern-weighted set.
 *
 * Only names that are demonstrably modern in American use are gated:
 * post-war coinages and names with a documented mid-century-or-later
 * surge. Traditional names carry no entry and work in every era. A name
 * with no entry is ELIGIBLE, not assumed old: over-excluding flattens
 * variety, while an over-inclusive early era is a mild flavour miss.
 *
 * Years are the decade a name became common, not the first recorded use.
 */

/** Name → earliest year it reads as plausible for an adult politician. */
const NAME_NOT_BEFORE: Record<string, number> = {
  // ── Male: documented post-war usage surges ────────────────────────────────
  Joshua: 1975,
  Jason: 1970,
  Ryan: 1975,
  Zachary: 1985,
  Ethan: 1995,
  Noah: 1995,
  Brandon: 1980,
  Tyler: 1990,
  // Post-war African-American coinages and popularisations.
  DeShawn: 1975,
  Darnell: 1965,
  Jamal: 1970,
  Terrence: 1960,

  // ── Female: same standard ─────────────────────────────────────────────────
  Jennifer: 1970,
  Jessica: 1980,
  Ashley: 1980,
  Kimberly: 1965,
  Michelle: 1965,
  Amanda: 1975,
  Melissa: 1965,
  Stephanie: 1965,
  Nicole: 1975,
  Samantha: 1975,
  Tamika: 1975,
  Keisha: 1975,
  Latoya: 1975,
  Ebony: 1975,
  Jasmine: 1985,
  Aaliyah: 1995,
  Imani: 1975,
};

/**
 * Names plausible for a world at `year`.
 *
 * Null year (no era clock) keeps the whole pool. Never returns empty: a pool
 * whose every entry is gated still has to produce a name, and a generation
 * failure is far worse than an anachronistic first name.
 */
export function namesForYear(pool: string[], year: number | null | undefined): string[] {
  if (year == null || !Number.isFinite(year)) return pool;
  const eligible = pool.filter((name) => {
    const notBefore = NAME_NOT_BEFORE[name];
    return notBefore == null || year >= notBefore;
  });
  return eligible.length > 0 ? eligible : pool;
}

/** Test seam — lets a test assert the table is non-empty without exporting it wholesale. */
export function gatedNameCount(): number {
  return Object.keys(NAME_NOT_BEFORE).length;
}
