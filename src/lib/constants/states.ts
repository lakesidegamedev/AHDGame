/**
 * US state seat and electoral-vote tables live in statesTables and the preset selectors in
 * states/rules/seatSelectors.
 * This module forwards both so existing imports keep working.
 */
export * from "./statesTables";
export {
  getCnNpcSeats,
  getCnPeoplesCongressSeats,
  subNationalChamberSeats,
  getHouseSeats,
  getUkCommonsSeats,
  getTotalUkCommonsSeats,
  getElectoralVotes,
  getElectoralVoteUnits,
  isUsElectoralState,
  isUsPartyOrganizationJurisdiction,
  isNonPartyOrganizationUsRegion,
  getTravelActionCost,
} from "@/lib/states/rules/seatSelectors";
