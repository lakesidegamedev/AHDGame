import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { StatePolicy } from "@/lib/db/types/statePolicy";
import { REDISTRICT_AUTHORITY_LAW } from "./caps";
import { statePoliciesCollection } from "@/lib/db/repositories/statePolicies";

/**
 * "Legislature-drawn" authority ladder index, the historically correct
 * baseline for the eras the game ships: before Baker v. Carr (1962) and
 * Wesberry v. Sanders (1964), congressional maps were drawn by state
 * legislatures, and independent/bipartisan commissions did not yet exist.
 * It is also the only option that lets a governing trifecta actually
 * redraw (see AUTHORITY_TABLE in ./caps), so seeding it is what makes the
 * feature reachable: the code default is bipartisan (canDraw:false) and
 * nothing else writes this statePolicies key.
 *
 * Mirrors the "Legislative Redistricting Authority Act" option (index 2)
 * of `us_state_redistricting_authority` in
 * src/lib/seeds/reference/legislationTypes.ts.
 */
export const AUTHORITY_LEGISLATIVE_INDEX = 2;
export const AUTHORITY_LEGISLATIVE_OPTION_ID = "state_redistricting_authority_opt_2";

/** Enacted-baseline statePolicy fields for the legislature-drawn authority. */
export function legislativeAuthorityPolicy(stateId: string, now: Date): Omit<StatePolicy, "_id"> {
  return {
    scope: "state",
    stateId,
    legislationTypeId: REDISTRICT_AUTHORITY_LAW,
    policyOptionId: AUTHORITY_LEGISLATIVE_OPTION_ID,
    policyOptionIndex: AUTHORITY_LEGISLATIVE_INDEX,
    enactedAt: now,
    enactedTurn: 0,
    economic: 0,
    // Right-stance option on the social axis (deriveStanceScore("right", 0, 1)).
    social: 3,
    effectDirection: -1,
  };
}

/**
 * Seed each US state's redistricting-authority law to "Legislature-drawn" as an
 * enacted baseline.
 *
 * Non-clobbering by construction: `$setOnInsert` only, so a world where a player
 * or a SCOTUS ruling later changes the authority keeps that value on reseed, and
 * the write is a safe no-op if a row already exists (a seed can overlap a turn).
 */
export async function seedRedistrictingAuthority(
  db: Db,
  opts: { countryId?: CountryId; stateIds: string[]; now: Date; log?: (m: string) => void }
): Promise<{ seeded: number }> {
  const log = opts.log ?? (() => {});
  const stateIds = Array.from(new Set(opts.stateIds));
  if (stateIds.length === 0) return { seeded: 0 };

  const result = await statePoliciesCollection(db).bulkWrite(
    stateIds.map((stateId) => ({
      updateOne: {
        filter: { stateId, legislationTypeId: REDISTRICT_AUTHORITY_LAW },
        update: { $setOnInsert: legislativeAuthorityPolicy(stateId, opts.now) },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  const seeded = result.upsertedCount ?? 0;
  log(
    `Seeded redistricting authority (legislature-drawn) for ${seeded}/${stateIds.length} state(s)`
  );
  return { seeded };
}
