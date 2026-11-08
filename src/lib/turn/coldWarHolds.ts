import type { Db, Filter } from "mongodb";
import type { ConflictDoc } from "@/lib/db/types/conflict";
import { getConflictsCollection } from "@/lib/db/collections/conflicts";
import { getGameStateCollection } from "@/lib/db/collections/gameState";
import { resolveConflict } from "@/lib/military/resolveConflict";
import { hostEntitiesOf } from "@/lib/military/hostEntities";
import { blocOrgFor } from "@/lib/world/blocMembership";
import type { WorldBloc } from "@/lib/world/bloc";
import { admitMember } from "@/lib/internationalOrganizations/joinApplication";
import { recordOrgHistoryEvent } from "@/lib/internationalOrganizations/service";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { applyConflictOutcomeAlignment } from "@/lib/alignment/commands/applyConflictOutcomeAlignment";
import { resolveGameYear } from "@/lib/era/era";

/**
 * Turns a bloc must hold a pole before the proxy war resolves in its favour.
 *
 * The whole point of the mechanism: taking the ground is not the same as keeping it,
 * so the loser has three turns to push back before the country changes hands.
 */
export const POLE_HOLD_TURNS = 3;

/**
 * Resolve every proxy war that has been pinned at a pole for three turns.
 *
 * ⚠️ A TURN STEP, not a check inside `applyOccupation`: that only runs when
 * a battle moves the front and early-returns when `control` is unchanged, so
 * a pinned front would never re-enter it. This sweeps by `poleSinceTurn`
 * alone, on every turn.
 */
export async function resolveColdWarHolds(
  db: Db,
  currentTurn: number
): Promise<{ resolved: number }> {
  const gameState = await getGameStateCollection(db).then((col) =>
    col.findOne(
      { _id: "current" },
      {
        projection: {
          currentYear: 1,
          currentTurn: 1,
          startingYear: 1,
        },
      }
    )
  );

  const held = await getConflictsCollection(db)
    .find({
      type: "cold_war",
      status: { $ne: "resolved" },
      poleSide: { $ne: null },
      poleSinceTurn: { $lte: currentTurn - POLE_HOLD_TURNS },
    } as Filter<ConflictDoc>)
    .toArray();

  // Read once for the tick, and only when something is actually resolving.
  const preset = held.length > 0 ? await getGameStatePresetOrDefault(db) : undefined;

  let resolved = 0;
  for (const conflict of held as ConflictDoc[]) {
    // Re-read the stamp rather than trusting the query alone: `applyOccupation` may
    // have cleared it earlier in this same tick when a battle pushed the front off
    // the pole, and a war that was broken open again must not resolve for the side
    // that no longer holds it.
    if (!conflict.poleSide || conflict.poleSinceTurn == null) continue;
    if (conflict.poleSinceTurn > currentTurn - POLE_HOLD_TURNS) continue;

    // CLAIM the war before resolving it. The find above and the writes below are not
    // atomic, and this project has had overlapping turn runs before (a rolling
    // deploy). Admission is idempotent and `resolveConflict` is effectively so, but
    // the ALIGNMENT SWING is not — a double run would move both hosts twice, which
    // is the one effect here that cannot be replayed safely.
    //
    // Claiming on `status` is what makes the second runner's update match nothing:
    // it is the same field `resolveConflict` sets, so the two cannot interleave.
    const claim = await getConflictsCollection(db).updateOne(
      { _id: conflict._id, status: { $ne: "resolved" } } as Filter<ConflictDoc>,
      { $set: { status: "resolved" } }
    );
    if (claim.modifiedCount !== 1) continue;

    await resolveConflict(db, conflict, conflict.poleSide, currentTurn, { endingType: "victory" });
    await admitHostsToWinningBloc(db, conflict, conflict.poleSide, currentTurn, preset);

    const backer = conflict.poleSide === "A" ? conflict.sideA.backer : conflict.sideB.backer;
    const year = gameState ? resolveGameYear(gameState) : null;
    if (backer && year != null) {
      await applyConflictOutcomeAlignment(db, {
        entityIds: hostEntitiesOf(conflict),
        bloc: backer as WorldBloc,
        turn: currentTurn,
        // The LIVE year: poles are era state, unlike the organisation above.
        year,
      });
    }
    resolved++;
  }

  return { resolved };
}

/**
 * Take the countries the war was fought over into the winner's bloc.
 *
 * This is the prize: a proxy war is not about the ground, it is about which side of
 * the board the host ends up on. Every host entity is admitted, not just the map
 * anchor — Vietnam is two countries and both change hands.
 *
 * Silent no-op when the bloc has no accession organisation in this world, which is
 * the honest answer rather than admitting anyone into an org that does not exist.
 */
async function admitHostsToWinningBloc(
  db: Db,
  conflict: ConflictDoc,
  winner: "A" | "B",
  currentTurn: number,
  preset: string | undefined
): Promise<void> {
  const backer = winner === "A" ? conflict.sideA.backer : conflict.sideB.backer;
  if (!backer) return;

  const organizationId = blocOrgFor(preset, backer as WorldBloc);
  if (!organizationId) return;

  for (const entity of hostEntitiesOf(conflict)) {
    // Idempotent: a re-run admits nobody twice.
    await admitMember(db, organizationId, entity, currentTurn);
    // Country history is a player-facing timeline, so it only takes ids the game
    // renders a country page for. A proxy war's hosts are usually NOT playable — the
    // membership is still written above, it simply has no page to be logged on.
    if (entity in COUNTRY_CONFIGS) {
      await recordOrgHistoryEvent(
        db,
        entity as CountryId,
        currentTurn,
        `${COUNTRY_CONFIGS[entity as CountryId].name} joined ${organizationId} following the outcome of the ${conflict.name}.`,
        { organizationId }
      );
    }
  }
}
