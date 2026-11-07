import type { GovernmentFormation } from "@/lib/db/types/governmentFormation";

/**
 * Initial US governmentFormation seed document, created in "pending" status.
 *
 * THIS IS NOT WHERE THE PRESIDENT LIVES; seeding it does not seat one.
 * For a presidential system `getHeadOfGovernmentCharacterId` reads
 * `electedOfficials` with `officeType: "president"`. `pmCharacterId` stays
 * null here deliberately; the row exists so legislature majority arithmetic
 * has somewhere to live and country diagnostics resolve uniformly.
 *
 * Nothing creates this lazily: `runParliamentaryCountry` only seeds missing
 * rows for parliamentary systems, and the US is not one, so without a seed
 * step the row never appears.
 *
 * House of Representatives:
 *   - totalSeats: 435
 *   - majorityThreshold: 218 (435 / 2 + 1)
 * The Senate is deliberately excluded: the threshold is a lower-chamber
 * majority, matching Nigeria.
 */
export const usGovernmentFormation: Omit<GovernmentFormation, "createdAt" | "updatedAt"> = {
  _id: "US",
  countryId: "US",
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
  majorityThreshold: 218,
  seatsByParty: {},
  totalSeats: 435,
  activeVoteId: null,
  formedAt: null,
  formedTurn: null,
  collapsedAt: null,
};
