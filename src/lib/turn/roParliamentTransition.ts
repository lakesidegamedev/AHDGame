import { ObjectId, type ClientSession, type Db } from "mongodb";
import type { CountryGameState, GameState } from "@/lib/db/types";
import type { GovernmentFormation } from "@/lib/db/types/governmentFormation";
import { calendarTurn } from "@/lib/utils/gameDate";
import { runRequiredTransaction } from "@/lib/db/runRequiredTransaction";
import { reconcileRoDelegateCapacity } from "@/lib/countries/ro/rules/handover1992";
import type { NPP } from "@/lib/db/types";
import {
  RO_1992_DEPUTIES_BY_REGION,
  RO_1992_DEPUTY_SEATS,
  RO_1992_SENATORS_BY_REGION,
} from "@/lib/countries/ro/rules/parliament1992";
import {
  getGameStateCollection,
  GAME_STATE_PRE_ITERATION_FIELDS,
} from "@/lib/db/collections/gameState";
import { getStatesCollection } from "@/lib/db/collections/states";
import { getElectionsCollection } from "@/lib/db/collections/elections";
import { getElectedOfficialsCollection } from "@/lib/db/collections/electedOfficials";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { countryGameStatesCollection } from "@/lib/db/repositories/countryGameStates";
import { governmentFormationsCollection } from "@/lib/db/repositories/governmentFormations";

/**
 * Seat the parliament returned by the September 1992 election once both
 * regional slates have resolved. The game places that vote at year-end turn 96.
 * The marker is last: interrupted writes repeat deterministically next turn.
 * Official records are reconciled to the new regional magnitudes even if a
 * partial resolution left an old delegation in place.
 * https://legislatie.just.ro/public/DetaliiDocument/94779
 * https://legislatie.just.ro/public/DetaliiDocument/94780
 */
export async function processRoParliamentTransition(
  db: Db,
  gameState: Pick<GameState, "preset" | "preIteration" | "preIterationTurns">,
  currentTurn: number,
  now: Date
): Promise<boolean> {
  if (gameState.preset !== "1991-default") return false;
  if (
    calendarTurn(currentTurn, {
      preIterationActive: gameState.preIteration?.active,
      preIterationTurns: gameState.preIterationTurns,
    }) < 96
  )
    return false;

  const ready = await countryGameStatesCollection(db)
    .findOne(
      { _id: "RO" },
      { projection: { roParliament1992SinceTurn: 1, roElectoralLaw1992SinceTurn: 1 } }
    );
  if (
    !ready ||
    ready.roParliament1992SinceTurn != null ||
    ready.roElectoralLaw1992SinceTurn == null
  )
    return false;
  return runRequiredTransaction(
    (session) => materializeRoParliamentTransition(db, currentTurn, now, session),
    { client: db.client }
  );
}
async function materializeRoParliamentTransition(
  db: Db,
  currentTurn: number,
  now: Date,
  session: ClientSession
) {
  if (
    !session.inTransaction() ||
    !Number.isSafeInteger(currentTurn) ||
    currentTurn < 1 ||
    !Number.isFinite(now.getTime())
  )
    throw new Error("Romanian handover needs a transaction and valid clock");
  const game = await (
    await getGameStateCollection(db)
  ).findOne({ _id: "current" }, { session, projection: GAME_STATE_PRE_ITERATION_FIELDS });
  if (
    game?.preset !== "1991-default" ||
    calendarTurn(currentTurn, {
      preIterationActive: game.preIteration?.active,
      preIterationTurns: game.preIterationTurns,
    }) < 96
  )
    return false;
  const countries = countryGameStatesCollection(db);
  const country = await countries.findOne(
    { _id: "RO" },
    { session, projection: { roParliament1992SinceTurn: 1, roElectoralLaw1992SinceTurn: 1 } }
  );
  if (
    !country ||
    country.roParliament1992SinceTurn != null ||
    country.roElectoralLaw1992SinceTurn == null
  )
    return false;

  const regions = await (
    await getStatesCollection(db)
  )
    .find({ countryId: "RO" }, { session, projection: { _id: 1 } })
    .toArray();
  const regionIds = regions.map((region) => String(region._id));
  if (
    regionIds.length !== Object.keys(RO_1992_DEPUTIES_BY_REGION).length ||
    regionIds.some((id) => RO_1992_DEPUTIES_BY_REGION[id] == null)
  )
    return false;

  const slates = await (
    await getElectionsCollection(db)
  )
    .find(
      {
        countryId: "RO",
        electionType: { $in: ["chamberOfDeputies", "senat"] },
        cycle: { $gte: 1 },
        status: "resolved",
      },
      { session, projection: { cycle: 1, electionType: 1, state: 1, totalSeats: 1 } }
    )
    .toArray();
  const complete = [...new Set(slates.map((row) => row.cycle))].some((cycle) =>
    (
      [
        ["chamberOfDeputies", RO_1992_DEPUTIES_BY_REGION],
        ["senat", RO_1992_SENATORS_BY_REGION],
      ] as const
    ).every(([chamber, expected]) => {
      const rows = slates.filter((row) => row.cycle === cycle && row.electionType === chamber);
      return (
        rows.length === regionIds.length &&
        new Set(rows.map((row) => row.state)).size === regionIds.length &&
        rows.every((row) => expected[row.state] === row.totalSeats)
      );
    })
  );
  if (!complete) return false;

  const officials = await (
    await getElectedOfficialsCollection(db)
  )
    .find(
      { countryId: "RO", officeType: { $in: ["deputy", "senator"] } },
      {
        session,
        projection: {
          _id: 1,
          state: 1,
          officeType: 1,
          seatsHeld: 1,
          characterId: 1,
          nppId: 1,
          party: 1,
        },
      }
    )
    .toArray();
  if (
    officials.some(
      (row) =>
        (row.seatsHeld ?? 0) > 0 &&
        ((!row.characterId && !row.nppId) || (!!row.characterId && !!row.nppId))
    )
  )
    throw new Error("Romanian mandate has missing or conflicting financial identity");
  const officialOps = regionIds.flatMap((regionId) =>
    (
      [
        ["deputy", RO_1992_DEPUTIES_BY_REGION],
        ["senator", RO_1992_SENATORS_BY_REGION],
      ] as const
    ).flatMap(([officeType, target]) => {
      const peers = officials.filter(
        (official) => official.state === regionId && official.officeType === officeType
      );
      if (peers.length === 0 || peers.every((official) => !((official.seatsHeld ?? 0) > 0)))
        return [];
      const shares = reconcileRoDelegateCapacity(
        peers.map((row) => ({
          id: String(row._id),
          party: row.party ?? `independent@${row._id}`,
          seats: row.seatsHeld ?? 0,
          isNpc: !row.characterId,
        })),
        target[regionId]
      );
      if (!shares) throw new Error("Romanian handover lacks viable party slate capacity");
      return peers.map((official) => ({
        updateOne: {
          filter: { _id: official._id },
          update: { $set: { seatsHeld: shares[String(official._id)] ?? 0, updatedAt: now } },
        },
      }));
    })
  );
  await (
    await getStatesCollection(db)
  ).bulkWrite(
    regionIds.map((id) => ({
      updateOne: {
        filter: { _id: id, countryId: "RO" },
        update: {
          $set: {
            houseDistricts: RO_1992_DEPUTIES_BY_REGION[id],
            stateSenateSeats: RO_1992_SENATORS_BY_REGION[id],
          },
        },
      },
    })),
    { session }
  );

  if (officialOps.length > 0)
    await (await getElectedOfficialsCollection(db)).bulkWrite(officialOps, { session });

  const revised = await (
    await getElectedOfficialsCollection(db)
  )
    .find(
      { countryId: "RO", officeType: { $in: ["deputy", "senator"] } },
      { session, projection: { characterId: 1, nppId: 1, officeType: 1, state: 1, seatsHeld: 1 } }
    )
    .toArray();
  const players = revised.filter((row) => row.characterId && (row.seatsHeld ?? 0) > 0);
  if (
    players.some((row) => row.seatsHeld !== 1) ||
    new Set(players.map((row) => row.characterId!.toHexString())).size !== players.length
  )
    throw new Error("A Romanian player cannot hold duplicate parliamentary seats");
  for (const isNpc of [true, false]) {
    const ids = [
      ...new Set(
        revised.flatMap((row) => {
          const id = isNpc ? row.nppId : row.characterId;
          return id ? [id.toHexString()] : [];
        })
      ),
    ].map((id) => new ObjectId(id));
    if (!ids.length) continue;
    const owners = isNpc
      ? await nppsCollection(db)
          .find(
            { _id: { $in: ids }, countryId: "RO" },
            { session, projection: { currentOffice: 1 } }
          )
          .toArray()
      : await charactersCollection(db)
          .find(
            { _id: { $in: ids }, countryId: "RO" },
            { session, projection: { currentOffice: 1 } }
          )
          .toArray();
    if (owners.length !== ids.length)
      throw new Error("Romanian parliamentary financial owner is missing");
    const ops = owners.map((owner) => {
      const held = revised.filter(
        (row) =>
          (isNpc ? row.nppId : row.characterId)?.equals(owner._id) && (row.seatsHeld ?? 0) > 0
      );
      const seats = held.reduce((n, row) => n + (row.seatsHeld ?? 0), 0);
      const oldOffice: unknown = owner.currentOffice;
      const currentOffice =
        oldOffice === "primeMinister"
          ? { type: "primeMinister" as const }
          : owner.currentOffice?.type === "primeMinister"
            ? owner.currentOffice
            : held.length
              ? { type: held[0].officeType, state: held[0].state, seatsHeld: seats }
              : null;
      return {
        updateOne: {
          filter: { _id: owner._id, countryId: "RO" as const },
          update: {
            $set: { currentOffice, updatedAt: now, ...(isNpc ? { seatsHeld: seats } : {}) },
          },
        },
      };
    });
    if (isNpc) await nppsCollection(db).bulkWrite(ops, { session });
    else await charactersCollection(db).bulkWrite(ops, { session });
  }
  await governmentFormationsCollection(db).updateOne(
    { _id: "RO" },
    {
      $set: {
        totalSeats: RO_1992_DEPUTY_SEATS,
        majorityThreshold: Math.floor(RO_1992_DEPUTY_SEATS / 2) + 1,
        updatedAt: now,
      },
    },
    { session }
  );
  const marked = await countries.updateOne(
    { _id: "RO", roParliament1992SinceTurn: { $exists: false } },
    { $set: { roParliament1992SinceTurn: currentTurn, updatedAt: now } },
    { session }
  );
  if (marked.modifiedCount !== 1) throw new Error("Romanian handover changed during settlement");
  return true;
}
