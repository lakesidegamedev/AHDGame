import type { Db } from "mongodb";
import type { GovernmentFormation } from "@/lib/db/types/governmentFormation";
import type { ElectedOfficial, State } from "@/lib/db/types";

/*
 * RU seeds governmentFormations as FORMED (unlike CN's pending start): a Cold-War
 * world must not open with a vacant Council of Ministers. Premier is an NPP from
 * the SU HistoricalSeat rows via pmNppId; pmCharacterId is the player path (exactly
 * one is non-null for a formed government). totalSeats/majorityThreshold come from
 * the seeded Union chamber's houseDistricts sum. coalitionThreshold stays nominal.
 * 1991 has a 2,250-seat Congress but no historical Soviet executive officials, so
 * open a neutral pending formation instead. Returns null when no RU regions are seeded.
 */
export async function buildRuGovernmentFormation(
  db: Db,
  now: Date,
  preset: string
): Promise<Omit<GovernmentFormation, "createdAt" | "updatedAt"> | null> {
  const regions = await db
    .collection<State>("states")
    .find({ countryId: "RU" }, { projection: { houseDistricts: 1 } })
    .toArray();
  if (regions.length === 0) return null; // RU not seeded in this preset

  const totalSeats = regions.reduce((sum, r) => sum + (r.houseDistricts ?? 0), 0);
  const majorityThreshold = Math.floor(totalSeats / 2) + 1;

  if (preset === "1991-default" || preset === "2027-default") {
    return {
      _id: "RU",
      countryId: "RU",
      cycle: 1,
      status: "pending",
      formationType: null,
      lostMajority: false,
      pmCharacterId: null,
      pmNppId: null,
      pmName: null,
      governingPartyId: null,
      coalitionId: null,
      coalitionPartyIds: null,
      totalSeatsSupporting: 0,
      majorityThreshold,
      seatsByParty: {},
      totalSeats,
      activeVoteId: null,
      formedAt: null,
      formedTurn: null,
      collapsedAt: null,
      hosCharacterId: null,
      hosNppId: null,
      hosName: null,
    };
  }

  const premier = await db
    .collection<ElectedOfficial>("electedOfficials")
    .findOne({ countryId: "RU", officeType: "premier" });
  const chairman = await db
    .collection<ElectedOfficial>("electedOfficials")
    .findOne({ countryId: "RU", officeType: "chairmanOfPresidium" });

  const hasPremier = premier?.nppId != null;

  return {
    _id: "RU",
    countryId: "RU",
    cycle: 1,
    status: hasPremier ? "formed" : "pending",
    formationType: hasPremier ? "majority" : null,
    lostMajority: false,
    pmCharacterId: null,
    pmNppId: premier?.nppId ?? null,
    pmName: premier?.characterName ?? null,
    governingPartyId: "1", // CPSU — seeded first, sequentialId 1 (mirrors CN)
    coalitionId: null,
    coalitionPartyIds: null,
    totalSeatsSupporting: totalSeats,
    majorityThreshold,
    seatsByParty: {},
    totalSeats,
    activeVoteId: null,
    formedAt: hasPremier ? now : null,
    formedTurn: hasPremier ? 1 : null,
    collapsedAt: null,
    // Seeded NPC Chairman of the Presidium (4b: legislature-appointment flow
    // replaces him at each convocation; hosNppId parallels pmNppId).
    hosCharacterId: null,
    hosNppId: chairman?.nppId ?? null,
    hosName: chairman?.characterName ?? null,
  };
}
