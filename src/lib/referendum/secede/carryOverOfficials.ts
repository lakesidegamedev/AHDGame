/** Independence retains the First Minister as caretaker and retires departing UK mandates. */
import {
  ensureParliamentaryGovernmentFormation,
  unformGovernmentAndVacatePM,
} from "@/lib/turn/parliamentaryGovernment";
import type { Db } from "mongodb";
import { getCountryConfig, type CountryId } from "@/lib/constants/countries";
import type { ElectedOfficial } from "@/lib/db/types/officials";
import type { ParliamentaryGovernment } from "@/lib/db/types/parliamentaryGovernment";
import { interimHeadRegion } from "../rules/pooledElectorate";
import { sovereigntyMemberRegionIds } from "../rules/sovereigntyRegions";
import { statesCollection } from "@/lib/db/repositories/states";
import { CAPITAL_SUBREGION, type SecedingCountryId } from "./subRegions";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { nppsCollection } from "@/lib/db/repositories/npps";
import type { Document } from "mongodb";
import { governmentFormationsCollection } from "@/lib/db/repositories/governmentFormations";
import { cabinetMembersCollection } from "@/lib/db/repositories/cabinetMembers";
import { seatsCollection } from "@/lib/db/repositories/seats";

export interface CarryOverOfficialsResult {
  msps: number;
  headOfGov: 0 | 1;
}

export async function carryOverOfficials(
  db: Db,
  regionId: string,
  fromCountryId: CountryId,
  toCountryId: SecedingCountryId,
  idMap: Record<number, number>
): Promise<CarryOverOfficialsResult> {
  const now = new Date();
  const officials = electedOfficialsCollection(db);
  const members = sovereigntyMemberRegionIds(regionId);
  const bloc = members.length > 1;
  // A bloc has several Governors: the most populous state's leads until elections;
  // the others stay in office as regional executives.
  let headState = regionId;
  if (bloc) {
    const rows = await statesCollection(db)
      .find({ _id: { $in: members } }, { projection: { population: 1 } })
      .toArray();
    headState =
      interimHeadRegion(
        members.map((id) => ({
          regionId: id,
          population: rows.find((row) => row._id === id)?.population ?? 0,
        }))
      ) ?? members[0];
  }
  const fm = await officials.findOne({
    countryId: fromCountryId,
    officeType: "governor",
    state: headState,
  });
  const retained = bloc
    ? await officials
        .find({
          countryId: fromCountryId,
          officeType: "governor",
          state: { $in: members.filter((id) => id !== headState) },
        })
        .toArray()
    : [];
  const retainedIds = new Set(retained.map((row) => String(row._id)));
  const residents = await charactersCollection(db)
    .find({ countryId: toCountryId }, { projection: { _id: 1 } })
    .toArray();
  const npps = await nppsCollection<Document>(db)
    .find({ countryId: toCountryId }, { projection: { _id: 1 } })
    .toArray();
  const departing = (
    await officials.find({ countryId: fromCountryId, state: { $in: members } }).toArray()
  ).filter((row) => !retainedIds.has(String(row._id)));
  const characterIds = [
    ...residents.map((row) => row._id),
    ...departing.flatMap((row) => (row.characterId ? [row.characterId] : [])),
  ];
  const nppIds = [
    ...npps.map((row) => row._id),
    ...departing.flatMap((row) => (row.nppId ? [row.nppId] : [])),
  ];
  const holders = [{ characterId: { $in: characterIds } }, { nppId: { $in: nppIds } }];
  const government = await governmentFormationsCollection<ParliamentaryGovernment>(db).findOne({
    _id: fromCountryId,
    $or: [{ pmCharacterId: { $in: characterIds } }, { pmNppId: { $in: nppIds } }],
  });
  if (government)
    await unformGovernmentAndVacatePM(db, fromCountryId, now, { reason: "lost-seat" });
  await officials.deleteMany({
    countryId: fromCountryId,
    _id: { $nin: retained.map((row) => row._id) },
    $or: [{ state: { $in: members } }, ...holders],
  });
  await cabinetMembersCollection<Document>(db).deleteMany({
    countryId: fromCountryId,
    $or: holders,
  });
  await seatsCollection<Document>(db).deleteMany({
    countryId: fromCountryId,
    state: { $in: members },
  });
  const retainedCharacters = retained.flatMap((row) => (row.characterId ? [row.characterId] : []));
  const retainedNpps = retained.flatMap((row) => (row.nppId ? [row.nppId] : []));
  await charactersCollection(db).updateMany(
    { _id: { $in: characterIds, $nin: retainedCharacters } },
    { $set: { currentOffice: null, updatedAt: now }, $unset: { cabinetPosition: "" } }
  );
  await nppsCollection<Document>(db).updateMany(
    { _id: { $in: nppIds, $nin: retainedNpps } },
    { $set: { currentOffice: null, updatedAt: now } }
  );
  if (!fm || (!fm.characterId && !fm.nppId)) {
    await ensureParliamentaryGovernmentFormation(db, toCountryId);
    return { msps: 0, headOfGov: 0 };
  }
  const party = idMap[Number(fm.party)] != null ? String(idMap[Number(fm.party)]) : "independent";
  const state = bloc ? headState : CAPITAL_SUBREGION[toCountryId];
  await officials.insertOne({
    ...fm,
    countryId: toCountryId,
    officeType: "firstMinister",
    state,
    party,
    updatedAt: now,
  });
  const collection = fm.characterId ? "characters" : "npps";
  await db.collection(collection).updateOne(
    { _id: (fm.characterId ?? fm.nppId)! },
    {
      $set: {
        countryId: toCountryId,
        homeState: state,
        party,
        currentOffice: { type: "firstMinister" },
        updatedAt: now,
      },
    }
  );
  const seats = getCountryConfig(toCountryId).legislature.lowerChamber.seats;
  await governmentFormationsCollection<ParliamentaryGovernment>(db).updateOne(
    { _id: toCountryId },
    {
      $set: {
        countryId: toCountryId,
        cycle: 1,
        status: "formed",
        formationType: "minority",
        pmCharacterId: fm.characterId ?? null,
        ...(fm.nppId ? { pmNppId: fm.nppId } : {}),
        pmName: fm.characterName,
        governingPartyId: party,
        totalSeatsSupporting: 0,
        majorityThreshold: Math.floor(seats / 2) + 1,
        isMinority: true,
        seatsByParty: {},
        totalSeats: seats,
        formedAt: now,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
      $unset: { headOfGovernmentCharacterId: "", ...(fm.nppId ? {} : { pmNppId: "" }) },
    },
    { upsert: true }
  );
  return { msps: 0, headOfGov: 1 };
}
