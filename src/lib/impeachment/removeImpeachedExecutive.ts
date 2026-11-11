import { ObjectId } from "mongodb";
import type { Db } from "@/lib/mongodb";
import type { CareerEvent, ElectedOfficial, GameState, OfficeType } from "@/lib/db/types";
import { type CountryId } from "@/lib/constants/countries";
import {
  getExecutiveOfficialFilter,
  type ExecutiveOfficeType,
} from "@/lib/elections/executiveOfficeFilters";
import { getOfficeLabel } from "@/lib/utils/officeTitle";
import { governorOfficialFilter } from "@/lib/db/electedOfficialScope";
import { captureOfficeTransition } from "@/lib/analytics/officeTransitionAnalytics";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";

/** Record the "removed" career event and clear the character's office. Shared by
 *  the executive and governor removal paths. */
async function recordRemovalOnCharacter(
  db: Db,
  countryId: CountryId,
  office: OfficeType,
  targetCharacterId: ObjectId,
  now: Date
): Promise<void> {
  const character = await charactersCollection(db).findOne(
    { _id: targetCharacterId },
    { projection: { _id: 1, party: 1, careerHistory: 1 } }
  );

  const careerEvent: CareerEvent = {
    type: "removed",
    office,
    officeLabel: getOfficeLabel(office, countryId),
    date: now,
    ...(character?.party ? { party: character.party, partyCountryId: countryId } : {}),
  };

  await charactersCollection(db).updateOne(
    { _id: targetCharacterId },
    {
      $set: { currentOffice: null, updatedAt: now },
      $push: { careerHistory: careerEvent },
    }
  );
  const gameState = await gameStateCollection(db)
    .findOne({ _id: "current" }, { projection: { currentTurn: 1, iteration: 1 } })
    .catch(() => null);
  await captureOfficeTransition({
    db,
    officeType: office.type,
    transitionType: "lost",
    partyId: character?.party,
    selectionMethod: "removal",
    tenureTurns: 0,
    careerStage: character?.careerHistory?.length ?? 0,
    nationId: countryId,
    turn: gameState?.currentTurn ?? 0,
    iteration: gameState?.iteration,
    flush: true,
  });
}

/**
 * Vacate an executive seat on impeachment conviction. Mirrors
 * {@link resignExecutiveOffice} but records a "removed" career event. Leaves the
 * seat vacant so the existing `presidentialSuccession` phase promotes the VP the
 * same turn (this must run BEFORE that phase).
 */
export async function removeImpeachedExecutive(
  db: Db,
  countryId: CountryId,
  officeType: ExecutiveOfficeType,
  targetCharacterId: ObjectId,
  now: Date
): Promise<void> {
  await electedOfficialsCollection(db).updateOne(
    getExecutiveOfficialFilter(countryId, officeType),
    {
      $set: { characterId: null, isNPP: false, updatedAt: now },
      $unset: { characterName: "", party: "", nppId: "", electedAt: "" },
    }
  );

  await recordRemovalOnCharacter(db, countryId, { type: officeType }, targetCharacterId, now);
}

/**
 * Vacate a governor's seat on impeachment conviction. Leaves the seat vacant
 * (tombstone `characterId: null`) so the already-merged `byElectionWatcher` turn
 * phase detects the vacancy and spawns a governor by-election to refill it.
 */
export async function removeImpeachedGovernor(
  db: Db,
  countryId: CountryId,
  state: string,
  targetCharacterId: ObjectId,
  now: Date
): Promise<void> {
  await electedOfficialsCollection(db).updateOne(governorOfficialFilter(countryId, state), {
    $set: { characterId: null, isNPP: false, updatedAt: now },
    $unset: { characterName: "", party: "", nppId: "", electedAt: "" },
  });

  await recordRemovalOnCharacter(db, countryId, { type: "governor" }, targetCharacterId, now);
}
