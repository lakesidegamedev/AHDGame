import { ObjectId, type Db } from "mongodb";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { governmentFormationsCollection } from "@/lib/db/repositories/governmentFormations";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { nppsCollection } from "@/lib/db/repositories/npps";
import {
  appointPrimeMinister,
  updateParliamentaryGovernmentSeats,
  syncRulingPartyIdFromFormedGovernment,
} from "@/lib/turn/parliamentaryGovernment";
import { planCaOpeningGovernment } from "./rules/openingGovernment";

/** Called by fresh historical bootstrap after the opening Commons has been seated. */
export async function seedCaOpeningGovernment(
  db: Db,
  preset: string,
  log: (message: string) => void = () => {}
): Promise<boolean> {
  if (preset !== "2027-default") return false;
  const world = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { startingPartiesMode: 1, preIteration: 1, currentTurn: 1 } }
  );
  if ((world?.startingPartiesMode ?? "default") !== "default" || world?.preIteration?.active)
    return false;
  const gov = await governmentFormationsCollection(db).findOne({ _id: "CA" });
  if (!gov || gov.status !== "pending" || gov.pmCharacterId || gov.pmNppId || gov.activeVoteId)
    return false;
  const members = await electedOfficialsCollection(db)
    .find(
      { countryId: "CA", officeType: "caCommons" },
      { projection: { nppId: 1, isNPP: 1, party: 1, seatsHeld: 1 } }
    )
    .toArray();
  if (members.some((member) => !member.isNPP)) return false;
  const plan = planCaOpeningGovernment(
    members.map((member) => ({
      id: String(member._id),
      nppId: member.nppId?.toString(),
      party: member.party,
      seats: member.seatsHeld ?? 1,
    }))
  );
  if (!plan) throw new Error("Canadian opening Commons must contain 343 valid party seats");
  const leader = await nppsCollection(db).findOne(
    { _id: new ObjectId(plan.leaderNppId), countryId: "CA", retiredAt: null },
    { projection: { name: 1 } }
  );
  if (!leader) throw new Error("Canadian opening Prime Minister has no live actor");
  const now = new Date();
  await appointPrimeMinister(db, "CA", null, leader._id, leader.name, now, preset);
  await governmentFormationsCollection(db).updateOne(
    { _id: "CA", status: "pending" },
    {
      $set: {
        status: "formed",
        pmCharacterId: null,
        pmNppId: leader._id,
        pmName: leader.name,
        governingPartyId: plan.governingPartyId,
        formationType: plan.formationType,
        seatsByParty: plan.seatsByParty,
        totalSeats: plan.totalSeats,
        majorityThreshold: plan.majorityThreshold,
        totalSeatsSupporting: plan.totalSeatsSupporting,
        coalitionId: null,
        coalitionPartyIds: null,
        confidenceAbstentionPartyIds: [],
        lostMajority: false,
        activeVoteId: null,
        formedAt: now,
        formedTurn: world?.currentTurn ?? 1,
        collapsedAt: null,
        pmVacancyDeadlineTurn: null,
        snapElectionsUsed: 0,
        lastSnapElectionTurn: null,
        updatedAt: now,
      },
    }
  );
  await updateParliamentaryGovernmentSeats(db, "CA", preset);
  await syncRulingPartyIdFromFormedGovernment(db, "CA");
  log(
    `Seeded Canadian opening ${plan.formationType} government with ${plan.totalSeatsSupporting} Commons seats`
  );
  return true;
}
