/*
 * Is this country at war, and where does a reader go to see it?
 *
 * For the wartime banner on country pages. Deliberately NOT
 * `listConflictsForCountry`, which matches `hostCountry` alone. A conflict is
 * fought over `hostEntities`, so a war widened to a second country should show
 * there too. West Germany is the case: both Germanies are hosts, only one is
 * the map anchor.
 *
 * BELLIGERENCY OR GROUND. A country whose army is in the field is at war; so is
 * one whose territory is the theatre. Telling a reader on the second country's
 * pages that nothing is happening would be the plainer error.
 *
 * Everything read here is already public on the conflict record.
 */
import type { Db, Filter } from "mongodb";
import type { ConflictDoc } from "@/lib/db/types/conflict";
import { getConflictsCollection } from "@/lib/db/collections/conflicts";

export interface CountryWarNotice {
  /** How many live conflicts this country is in — the banner's wording turns on it. */
  count: number;
  /** The war to link to when there is exactly one; null when there are several. */
  conflictNumber: number | null;
  /** That war's name, for the banner copy. Null when there are several. */
  name: string | null;
  /** True when the country is only the ground, on nobody's roster. */
  hostOnly: boolean;
}

/** Rosters this country stands on, ignoring whose ground the war is fought over. */
function isBelligerent(c: ConflictDoc, countryId: string): boolean {
  return (
    ((c.sideA?.countries ?? []) as string[]).includes(countryId) ||
    ((c.sideB?.countries ?? []) as string[]).includes(countryId)
  );
}

export async function loadCountryWarNotice(
  db: Db,
  countryId: string
): Promise<CountryWarNotice | null> {
  const rows = await getConflictsCollection(db)
    .find({
      status: { $ne: "resolved" },
      $or: [
        { "sideA.countries": countryId },
        { "sideB.countries": countryId },
        { hostCountry: countryId },
        // The widened roster, which `hostCountry` alone does not cover.
        { hostEntities: countryId },
      ],
    } as Filter<ConflictDoc>)
    .toArray();
  if (rows.length === 0) return null;

  // Oldest first, so a country in two wars always names the same one and the
  // banner does not change on a reload. `?? 0` because a seeded conflict can
  // predate the field.
  const ordered = [...rows].sort((a, b) => (a.startTurn ?? 0) - (b.startTurn ?? 0));
  const first = ordered[0]!;
  const single = ordered.length === 1;

  return {
    count: ordered.length,
    // A conflict with no public number has no page to link to. Saying so with a
    // dead link would be worse than saying it without one.
    conflictNumber: single ? (first.conflictId ?? null) : null,
    name: single ? first.name : null,
    hostOnly: ordered.every((c) => !isBelligerent(c, countryId)),
  };
}
