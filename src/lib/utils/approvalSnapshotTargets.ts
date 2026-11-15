import type { CountryId } from "@/lib/constants/countries";
import type { ConflictDoc } from "@/lib/db/types/conflict";

/**
 * Which countries the per-turn approval snapshot must cover.
 *
 * Every country has a reachable approval page backed by full metrics and
 * demographics, but the snapshot previously covered only active countries.
 * A non-playable country then had no `governmentApprovals` document, so its
 * page fell back to the live recompute in `loadNationalApproval`, which
 * carries no national providers: no war, address bump, org statements, or
 * cabinet.
 *
 * Pure set arithmetic: the turn phase does the reads and passes results in,
 * so roster rules are pinned by tests.
 */

/** Distinct values, first occurrence wins, so callers get a stable order. */
function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Countries on either roster of the given conflicts.
 *
 * `hostCountry` is deliberately NOT counted. `listConflictsForCountry` matches
 * on it, but `rosterSideOf` returns null for a host that is on neither side, so
 * its war block is permanently zero — pulling it in here would mint an approval
 * document every turn and release it again the next, forever. A host that is
 * also fighting appears on a roster and is picked up that way.
 */
export function belligerentsOf(conflicts: ConflictDoc[]): CountryId[] {
  return unique(
    conflicts.flatMap((conflict) => [
      ...((conflict.sideA?.countries ?? []) as CountryId[]),
      ...((conflict.sideB?.countries ?? []) as CountryId[]),
    ])
  );
}

export interface ApprovalSnapshotPlan {
  /** Every country to snapshot this turn, permanent seeded countries first. */
  ids: CountryId[];
  /** The subset present only because of a war, which can later be released. */
  guests: CountryId[];
}

/**
 * The snapshot roster for one turn.
 *
 * `documented` is every country that already HAS an approval document. Keying
 * on the document existing, not on its contents, is load-bearing: a guest
 * stays in the set until deliberately released, and the only deletion path
 * runs for countries in the set.
 *
 * Keying on "still has exhaustion to heal" lets a guest whose war ended at
 * exactly zero exhaustion fall out with its document left on disk. Since
 * `loadNationalApproval` prefers a stored rating over live recompute, that
 * country's page would be pinned to its last wartime number permanently.
 */
export function planApprovalSnapshot(
  activeIds: CountryId[],
  belligerents: CountryId[],
  documented: CountryId[],
  seededIds: CountryId[] = []
): ApprovalSnapshotPlan {
  const permanent = new Set([...activeIds, ...seededIds]);
  const guests = unique([...belligerents, ...documented]).filter((id) => !permanent.has(id));
  return { ids: unique([...activeIds, ...seededIds, ...guests]), guests };
}

/**
 * Guests whose `governmentApprovals` document should be dropped.
 *
 * A guest only ever had a document because of a war, and `loadNationalApproval`
 * prefers a stored rating over its live recompute unconditionally. A document
 * left behind after the war would pin that country to its last wartime number
 * permanently. Releasing puts it back where it was before the war: no
 * document, live recompute, like any country at peace.
 *
 * Keyed on stored EXHAUSTION, not the block total. Exhaustion is the one war
 * term that outlives its war, healing a point per in-game year, and this
 * document is its only home. Releasing while still negative would delete the
 * country's memory of the war and grant the clean slate the cooldown exists to
 * deny. The block total rounds to a tenth and reads zero while real residue
 * remains.
 *
 * A missing value counts as healed: nothing left to carry.
 */
export function guestsToRelease(
  guests: CountryId[],
  belligerents: CountryId[],
  exhaustion: Map<CountryId, number>
): CountryId[] {
  const fighting = new Set(belligerents);
  return guests.filter((id) => !fighting.has(id) && (exhaustion.get(id) ?? 0) === 0);
}
