import type { GovernmentFormation } from "@/lib/db/types/governmentFormation";

/**
 * Starts pending: no PM appointed. majorityThreshold 181 = 360/2 + 1, and
 * totalSeats 360, match the House of Representatives; Nigeria is presidential.
 */
export const ngGovernmentFormation: Omit<GovernmentFormation, "createdAt" | "updatedAt"> = {
  _id: "NG",
  countryId: "NG",
  cycle: 1,
  status: "pending",
  formationType: null,
  lostMajority: false,
  pmCharacterId: null,
  pmName: null,
  governingPartyId: null,
  coalitionId: null,
  coalitionPartyIds: null,
  totalSeatsSupporting: 0,
  majorityThreshold: 181,
  seatsByParty: {},
  totalSeats: 360,
  activeVoteId: null,
  formedAt: null,
  formedTurn: null,
  collapsedAt: null,
};
