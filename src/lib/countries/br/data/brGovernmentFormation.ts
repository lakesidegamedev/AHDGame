import type { Db } from "mongodb";
import type { GovernmentFormation } from "@/lib/db/types/governmentFormation";
import type { ElectedOfficial } from "@/lib/db/types";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";

/**
 * Build the BR governmentFormations doc.
 *
 * When a president is already seated, start FORMED with `presidentNppId`
 * linked. Without that link, `appointNppPresident` early-returns on the seated
 * official and never stamps `presidentNppId`, leaving the NPP governing brain
 * without a head.
 *
 * Otherwise status stays `pending` so turn-time seating can form the
 * government.
 *
 * majorityThreshold and totalSeats come from COUNTRY_CONFIGS.BR (257 of 513
 * Chamber of Deputies seats). Brazil is presidential: the President is both
 * head of state and head of government.
 */
export async function buildBrGovernmentFormation(
  db: Db,
  now: Date
): Promise<Omit<GovernmentFormation, "createdAt" | "updatedAt">> {
  const config = COUNTRY_CONFIGS.BR;
  const totalSeats = config.legislature.lowerChamber.seats;
  const majorityThreshold = config.coalitionThreshold;

  const president = await db
    .collection<ElectedOfficial>("electedOfficials")
    .findOne({ countryId: "BR", officeType: "president" });

  const hasPresident = Boolean(president?.nppId || president?.characterId);

  return {
    _id: "BR",
    countryId: "BR",
    cycle: 1,
    status: hasPresident ? "formed" : "pending",
    formationType: hasPresident ? "majority" : null,
    lostMajority: false,
    pmCharacterId: null,
    pmNppId: null,
    pmName: hasPresident ? (president?.characterName ?? null) : null,
    presidentNppId: president?.nppId ?? null,
    presidentName: hasPresident ? (president?.characterName ?? null) : null,
    governingPartyId: hasPresident ? (president?.party ?? null) : null,
    coalitionId: null,
    coalitionPartyIds: null,
    // Chamber may still be vacant at seed time (1953 democracies start vacant).
    totalSeatsSupporting: 0,
    majorityThreshold,
    seatsByParty: {},
    totalSeats,
    activeVoteId: null,
    formedAt: hasPresident ? now : null,
    formedTurn: hasPresident ? 1 : null,
    collapsedAt: null,
  };
}
