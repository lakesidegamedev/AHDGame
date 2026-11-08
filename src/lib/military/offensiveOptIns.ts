import type { Db } from "mongodb";
import type { ConflictDoc } from "@/lib/db/types/conflict";
import type { TheaterStateDoc } from "@/lib/db/types/theaterState";
import { listTheaterStates } from "@/lib/db/collections/theaterState";
import { getAllCountryAccess } from "@/lib/countryAccess";

/**
 * Who joins an offensive at a front without declaring one.
 *
 * There are two sources of that consent and they must be read the same way in both
 * places that ask. `battleResolution` builds the roster an offensive actually fights
 * with; the cabinet battle forecast predicts that roster for the minister about to
 * order the attack. The forecast's own contract is that it can never disagree with
 * the outcome it predicts, so the question is asked here once and answered
 * identically for both.
 *
 * Spec: docs/superpowers/specs/2026-08-04-allied-coalition-battles-design.md
 */
export interface OffensiveOptInSources {
  /** Every country's standing orders, as written by the player auto-join route. */
  theaterStates: TheaterStateDoc[];
  /**
   * Countries nobody is playing, opted in wholesale. Membership of a specific front
   * is NOT decided here — see `offensiveOptInsAtFront`.
   */
  nppAutoJoiners: ReadonlySet<string>;
}

/**
 * Read both sources once.
 *
 * Read once per tick / per request on purpose: neither answer can change between the
 * fronts of a single resolution pass, and the resolver runs inside a phase with a turn
 * time budget.
 */
export async function loadOffensiveOptInSources(db: Db): Promise<OffensiveOptInSources> {
  const nppAutoJoiners = new Set<string>();
  const [theaterStates, countryAccess] = await Promise.all([
    listTheaterStates(db),
    getAllCountryAccess(db),
  ]);
  // `enabledForPlayers` and not `nppGoverned`, deliberately. `nppGoverned` also
  // requires the NPP autonomy ladder to be at v1 or above. Joining an ally's attack
  // needs no autonomy engine: the units are already at the front and the coalition
  // is already attacking. `enabledForPlayers` is also the exact predicate
  // `isNppAutonomyActive` uses for "nobody is playing this country".
  for (const [countryId, access] of Object.entries(countryAccess)) {
    if (!access.enabledForPlayers) nppAutoJoiners.add(countryId);
  }
  return { theaterStates, nppAutoJoiners };
}

/**
 * The opted-in set for one front, ready to hand to `autoJoinersAtFront`.
 *
 * The two sources are NOT filtered the same way, and the difference is the point:
 *
 * - A standing order names its front. A player wrote it for this theatre deliberately,
 *   so it is taken as given — including the case where `sideOf` places that player on a
 *   side by bloc rather than by roster, which is long-standing behaviour.
 * - The NPP set names nobody. It is a blanket permission, so it is narrowed to the
 *   conflict's actual belligerents here. Without that, `sideOf`'s permissive bloc
 *   fallback would enrol an unrostered bloc member that happened to have units parked
 *   at the theatre into attacking a war it never entered. A player opting in one front
 *   at a time could never reach that; a blanket opt-in reaches it on every front at
 *   once, which is why the narrowing lives on this side of the union only.
 */
export function offensiveOptInsAtFront(
  sources: OffensiveOptInSources,
  conflict: Pick<ConflictDoc, "sideA" | "sideB">,
  theaterId: string
): Set<string> {
  const optedIn = new Set(
    sources.theaterStates
      .filter((state) => state.autoJoin?.[theaterId])
      .map((state) => String(state.countryId))
  );
  if (sources.nppAutoJoiners.size > 0) {
    for (const countryId of [...conflict.sideA.countries, ...conflict.sideB.countries]) {
      if (sources.nppAutoJoiners.has(countryId)) optedIn.add(countryId);
    }
  }
  return optedIn;
}
