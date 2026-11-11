/**
 * Complete federation dissolution retires offices, cabinet posts and pending votes.
 * materializeFederationFederalRetirement archives their history and clears office
 * links in the settlement transaction, preserving residents and their accounts.
 */
import type { ClientSession, Db, ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type {
  Character,
  CountryGameState,
  ElectedOfficial,
  Election,
  ElectionCandidate,
  NPP,
} from "@/lib/db/types";
import { FEDERATION_ARCHIVED_POLITICAL_ROWS_COLLECTION } from "./materializeRussianCongress";
import type { GovernmentFormation } from "@/lib/db/types/governmentFormation";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import { countryGameStatesCollection } from "@/lib/db/repositories/countryGameStates";
import { governmentFormationsCollection } from "@/lib/db/repositories/governmentFormations";
import { cabinetMembersCollection } from "@/lib/db/repositories/cabinetMembers";
import type { Document } from "mongodb";
import { ukCabinetCooldownsCollection } from "@/lib/db/repositories/ukCabinetCooldowns";

type HistoricalPoliticalRow = { _id: ObjectId | string; [key: string]: unknown };

export async function materializeFederationFederalRetirement(input: {
  db: Db;
  session: ClientSession;
  sourceCountryId: CountryId;
  applicationId: string;
  appliedOnTurn: number;
  now: Date;
}): Promise<{ cancelledElections: number; vacatedOffices: number }> {
  const { db, session, sourceCountryId, applicationId, appliedOnTurn, now } = input;
  if (
    !session.inTransaction() ||
    !applicationId ||
    !Number.isSafeInteger(appliedOnTurn) ||
    appliedOnTurn < 1 ||
    !Number.isFinite(now.getTime())
  )
    throw new Error("Federation retirement needs a transaction, application, turn and time");
  const country = await countryGameStatesCollection(db).findOne(
    { _id: sourceCountryId, dissolvedTurn: null },
    { session }
  );
  if (!country) throw new Error("Federation source country changed before dissolution");
  // Keep historical offices and cabinet memberships before vacating the source.
  // Each collection is read once and archived in the existing settlement ledger.
  for (const collectionName of ["electedOfficials", "cabinetMembers", "governmentFormations"]) {
    const filter =
      collectionName === "governmentFormations"
        ? { _id: sourceCountryId }
        : { countryId: sourceCountryId };
    const rows = await db
      .collection<HistoricalPoliticalRow>(collectionName)
      .find(filter, { session })
      .toArray();
    if (rows.length)
      await db
        .collection<{
          _id: string;
          applicationId: string;
          sourceCountryId: CountryId;
          value: HistoricalPoliticalRow;
        }>(FEDERATION_ARCHIVED_POLITICAL_ROWS_COLLECTION)
        .insertMany(
          rows.map((value) => ({
            _id: `${applicationId}:${collectionName}:${value._id.toString()}`,
            applicationId,
            sourceCountryId,
            value,
          })),
          { session }
        );
  }
  const activeElectionIds = await electionsCollection(db)
    .find(
      { countryId: sourceCountryId, status: { $in: ["upcoming", "active"] } },
      { session, projection: { _id: 1 } }
    )
    .toArray();
  if (activeElectionIds.length)
    await electionCandidatesCollection(db).updateMany(
      {
        electionId: { $in: activeElectionIds.map((election) => election._id) },
        status: "active",
      },
      { $set: { status: "withdrawn", updatedAt: now } },
      { session }
    );
  await charactersCollection(db).updateMany(
    { countryId: sourceCountryId, currentOffice: { $ne: null } },
    { $set: { currentOffice: null, updatedAt: now } },
    { session }
  );
  await nppsCollection(db).updateMany(
    { countryId: sourceCountryId, currentOffice: { $ne: null } },
    { $set: { currentOffice: null, updatedAt: now } },
    { session }
  );
  for (const collectionName of ["pmAppointmentVotes", "noConfidenceVotes"])
    await db
      .collection(collectionName)
      .updateMany(
        { countryId: sourceCountryId, status: "active" },
        { $set: { status: "cancelled", closedAt: now, updatedAt: now } },
        { session }
      );
  await cabinetMembersCollection<Document>(db).deleteMany(
    { countryId: sourceCountryId },
    { session }
  );
  await ukCabinetCooldownsCollection<Document>(db).deleteMany(
    { countryId: sourceCountryId },
    { session }
  );
  const elections = await electionsCollection(db).updateMany(
    { countryId: sourceCountryId, status: { $in: ["upcoming", "active"] } },
    { $set: { status: "cancelled", updatedAt: now } },
    { session }
  );
  const offices = await electedOfficialsCollection(db).deleteMany(
    { countryId: sourceCountryId },
    { session }
  );
  await governmentFormationsCollection(db).updateOne(
    { _id: sourceCountryId },
    {
      $set: {
        status: "collapsed",
        collapsedAt: now,
        pmCharacterId: null,
        pmNppId: null,
        pmName: null,
        hosCharacterId: null,
        hosNppId: null,
        hosName: null,
        presidentNppId: null,
        presidentName: null,
        governingPartyId: null,
        coalitionId: null,
        coalitionPartyIds: null,
        formationType: null,
        seatsByParty: {},
        totalSeats: 0,
        totalSeatsSupporting: 0,
        majorityThreshold: 1,
        activeVoteId: null,
        formedAt: null,
        formedTurn: null,
        pmVacancyDeadlineTurn: null,
        pmAppointmentNominationLockId: null,
        pmAppointmentNominationLockExpiresAt: null,
        governingAgenda: null,
        fiscalStance: null,
        commandStance: null,
        governingGoals: null,
        ministerialReshuffle: null,
        updatedAt: now,
      },
    },
    { session }
  );
  const updated = await countryGameStatesCollection(db).updateOne(
    { _id: sourceCountryId, dissolvedTurn: null },
    {
      $set: {
        dissolvedTurn: appliedOnTurn,
        updatedAt: now,
        ...(countryHasFeature("yuLib", sourceCountryId)
          ? { yuSettlementAppliedSinceTurn: appliedOnTurn }
          : {}),
      },
    },
    { session }
  );
  if (updated.matchedCount !== 1)
    throw new Error("Federation source country changed during dissolution");
  return { cancelledElections: elections.modifiedCount, vacatedOffices: offices.deletedCount };
}
