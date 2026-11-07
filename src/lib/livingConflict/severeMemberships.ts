import type { Db } from "mongodb";
import { nationsForRoles, type ConflictParticipants } from "./driver";
import { isFutureConflictFamily } from "./futureConflicts";
import { allLivingConflictDefs } from "./registry";
import { PACIFIC_STRAIT_KEY, memberCountries } from "./rules/futureConflicts";
import { resolveConflictParticipants } from "./rules/participants";
import { PANDEMIC_KEY, pandemicParticipants } from "./rules/pandemic";
import type { LivingConflictState } from "./types";

type StoredMembership = Pick<
  LivingConflictState,
  "defKey" | "hasOpened" | "status" | "openedYear" | "pandemicOriginCountryId" | "tracks"
>;

/**
 * The countries each active living conflict holds in a severe role, read from
 * the stored conflict states in one round trip. Used by the crisis spawners so
 * the stacking guard counts crisis templates and living conflicts together.
 *
 * Mirrors how the living-conflict phase builds its own severe list: wave
 * families count their current members, the pandemic its origin, and every
 * other family its resolved participants in its `severeRoles`.
 */
export async function loadLivingConflictSevereCountryIds(
  db: Db,
  availableCountryIds: ReadonlySet<string>
): Promise<string[][]> {
  const states = await db
    .collection<LivingConflictState>("livingConflicts")
    .find(
      { hasOpened: true, status: "active" },
      {
        projection: {
          _id: 0,
          defKey: 1,
          hasOpened: 1,
          status: 1,
          openedYear: 1,
          pandemicOriginCountryId: 1,
          tracks: 1,
        },
      }
    )
    .toArray();
  return severeCountryIdsFromStates(states, availableCountryIds);
}

export function severeCountryIdsFromStates(
  states: readonly StoredMembership[],
  availableCountryIds: ReadonlySet<string>
): string[][] {
  const byKey = new Map(states.map((state) => [state.defKey, state]));
  const out: string[][] = [];
  for (const def of allLivingConflictDefs()) {
    const state = byKey.get(def.key);
    if (!state || !state.hasOpened || state.status !== "active") continue;
    let participants: ConflictParticipants;
    if (isFutureConflictFamily(def.key) && def.key !== PACIFIC_STRAIT_KEY) {
      participants = {
        belligerents: memberCountries(state),
        neighbors: [],
        blocMembers: [],
      };
    } else if (def.key === PANDEMIC_KEY) {
      participants = pandemicParticipants(
        availableCountryIds,
        state.openedYear ?? 2018,
        state.pandemicOriginCountryId
      );
    } else {
      participants = resolveConflictParticipants(def, availableCountryIds);
    }
    const countryIds = nationsForRoles(participants, def.severeRoles ?? ["belligerent"]);
    if (countryIds.length > 0) out.push(countryIds);
  }
  return out;
}
