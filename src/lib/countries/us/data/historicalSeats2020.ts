import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// ─── US February 2020: 116th Congress ────────────────────────────────────────
// House: 232 Democrats, 197 Republicans, 1 Independent (MI), 5 Vacant = 435
//   The five vacancies are CA-25, MD-07, NY-27, TX-04 and WI-07, and they are
//   NOT seated: the rows below sum to the 430 OCCUPIED seats, and the roster
//   declares `vacantSeats: { "US.house": 5 }` so S4 can check 430 + 5 == 435.
//   Seating them would invent five members who did not exist; seating only 430
//   without declaring the gap would be indistinguishable from a truncated
//   roster.
// Senate: 53 Republicans, 45 Democrats, 2 Independents (VT, ME)
// Governors: 26 Republicans, 24 Democrats
//
// Each House entry = ONE NPP holding all that party's seats in that state

export const US_HOUSE_2020: HistoricalSeat[] = [
  // Alabama: 1 Dem NPP (1 seat), 1 GOP NPP (6 seats)
  { state: "AL", officeType: "house", party: "republican", seatsHeld: 6 },
  { state: "AL", officeType: "house", party: "democrat", seatsHeld: 1 },
  // Alaska: 1 GOP NPP (1 seat)
  { state: "AK", officeType: "house", party: "republican", seatsHeld: 1 },
  // Arizona: 1 Dem NPP (5 seats), 1 GOP NPP (4 seats)
  { state: "AZ", officeType: "house", party: "democrat", seatsHeld: 5 },
  { state: "AZ", officeType: "house", party: "republican", seatsHeld: 4 },
  // Arkansas: 1 GOP NPP (4 seats)
  { state: "AR", officeType: "house", party: "republican", seatsHeld: 4 },
  // California: 1 Dem NPP (45 seats), 1 GOP NPP (7 seats). CA-25 sits VACANT in
  // February 2020, so this is 52 of the state's 53 seats.
  { state: "CA", officeType: "house", party: "democrat", seatsHeld: 45 },
  { state: "CA", officeType: "house", party: "republican", seatsHeld: 7 },
  // Colorado: 1 Dem NPP (4 seats), 1 GOP NPP (3 seats)
  { state: "CO", officeType: "house", party: "democrat", seatsHeld: 4 },
  { state: "CO", officeType: "house", party: "republican", seatsHeld: 3 },
  // Connecticut: 1 Dem NPP (5 seats)
  { state: "CT", officeType: "house", party: "democrat", seatsHeld: 5 },
  // Delaware: 1 Dem NPP (1 seat)
  { state: "DE", officeType: "house", party: "democrat", seatsHeld: 1 },
  // Florida: 1 GOP NPP (14 seats), 1 Dem NPP (13 seats)
  { state: "FL", officeType: "house", party: "republican", seatsHeld: 14 },
  { state: "FL", officeType: "house", party: "democrat", seatsHeld: 13 },
  // Georgia: 1 GOP NPP (9 seats), 1 Dem NPP (5 seats)
  { state: "GA", officeType: "house", party: "republican", seatsHeld: 9 },
  { state: "GA", officeType: "house", party: "democrat", seatsHeld: 5 },
  // Hawaii: 1 Dem NPP (2 seats)
  { state: "HI", officeType: "house", party: "democrat", seatsHeld: 2 },
  // Idaho: 1 GOP NPP (2 seats)
  { state: "ID", officeType: "house", party: "republican", seatsHeld: 2 },
  // Illinois: 1 Dem NPP (13 seats), 1 GOP NPP (5 seats)
  { state: "IL", officeType: "house", party: "democrat", seatsHeld: 13 },
  { state: "IL", officeType: "house", party: "republican", seatsHeld: 5 },
  // Indiana: 1 GOP NPP (7 seats), 1 Dem NPP (2 seats)
  { state: "IN", officeType: "house", party: "republican", seatsHeld: 7 },
  { state: "IN", officeType: "house", party: "democrat", seatsHeld: 2 },
  // Iowa: 1 Dem NPP (3 seats), 1 GOP NPP (1 seat). The 2018 election returned
  // Finkenauer, Loebsack and Axne for the Democrats against one Republican in
  // IA-04; this delegation was recorded the wrong way round, which is where the
  // national split's two-seat error came from.
  { state: "IA", officeType: "house", party: "democrat", seatsHeld: 3 },
  { state: "IA", officeType: "house", party: "republican", seatsHeld: 1 },
  // Kansas: 1 GOP NPP (3 seats), 1 Dem NPP (1 seat)
  { state: "KS", officeType: "house", party: "republican", seatsHeld: 3 },
  { state: "KS", officeType: "house", party: "democrat", seatsHeld: 1 },
  // Kentucky: 1 GOP NPP (5 seats), 1 Dem NPP (1 seat)
  { state: "KY", officeType: "house", party: "republican", seatsHeld: 5 },
  { state: "KY", officeType: "house", party: "democrat", seatsHeld: 1 },
  // Louisiana: 1 GOP NPP (5 seats), 1 Dem NPP (1 seat)
  { state: "LA", officeType: "house", party: "republican", seatsHeld: 5 },
  { state: "LA", officeType: "house", party: "democrat", seatsHeld: 1 },
  // Maine: 1 Dem NPP (2 seats)
  { state: "ME", officeType: "house", party: "democrat", seatsHeld: 2 },
  // Maryland: 1 Dem NPP (6 seats), 1 GOP NPP (1 seat). MD-07 sits VACANT in
  // February 2020 - the seat fell vacant in October 2019 and was not filled
  // until the April 2020 special election.
  { state: "MD", officeType: "house", party: "democrat", seatsHeld: 6 },
  { state: "MD", officeType: "house", party: "republican", seatsHeld: 1 },
  // Massachusetts: 1 Dem NPP (9 seats)
  { state: "MA", officeType: "house", party: "democrat", seatsHeld: 9 },
  // Michigan: 1 Dem NPP (7 seats), 1 GOP NPP (6 seats), 1 Independent NPP (1 seat - Amash)
  { state: "MI", officeType: "house", party: "democrat", seatsHeld: 7 },
  { state: "MI", officeType: "house", party: "republican", seatsHeld: 6 },
  { state: "MI", officeType: "house", party: "independent", seatsHeld: 1 },
  // Minnesota: 1 Dem NPP (5 seats), 1 GOP NPP (3 seats)
  { state: "MN", officeType: "house", party: "democrat", seatsHeld: 5 },
  { state: "MN", officeType: "house", party: "republican", seatsHeld: 3 },
  // Mississippi: 1 GOP NPP (3 seats), 1 Dem NPP (1 seat)
  { state: "MS", officeType: "house", party: "republican", seatsHeld: 3 },
  { state: "MS", officeType: "house", party: "democrat", seatsHeld: 1 },
  // Missouri: 1 GOP NPP (6 seats), 1 Dem NPP (2 seats)
  { state: "MO", officeType: "house", party: "republican", seatsHeld: 6 },
  { state: "MO", officeType: "house", party: "democrat", seatsHeld: 2 },
  // Montana: 1 GOP NPP (1 seat)
  { state: "MT", officeType: "house", party: "republican", seatsHeld: 1 },
  // Nebraska: 1 GOP NPP (3 seats)
  { state: "NE", officeType: "house", party: "republican", seatsHeld: 3 },
  // Nevada: 1 Dem NPP (3 seats), 1 GOP NPP (1 seat)
  { state: "NV", officeType: "house", party: "democrat", seatsHeld: 3 },
  { state: "NV", officeType: "house", party: "republican", seatsHeld: 1 },
  // New Hampshire: 1 Dem NPP (2 seats)
  { state: "NH", officeType: "house", party: "democrat", seatsHeld: 2 },
  // New Jersey: 1 Dem NPP (10 seats), 1 GOP NPP (2 seats)
  { state: "NJ", officeType: "house", party: "democrat", seatsHeld: 10 },
  { state: "NJ", officeType: "house", party: "republican", seatsHeld: 2 },
  // New Mexico: 1 Dem NPP (3 seats)
  { state: "NM", officeType: "house", party: "democrat", seatsHeld: 3 },
  // New York: 1 Dem NPP (21 seats), 1 GOP NPP (5 seats). NY-27 sits VACANT in
  // February 2020, the seat having fallen vacant in October 2019.
  { state: "NY", officeType: "house", party: "democrat", seatsHeld: 21 },
  { state: "NY", officeType: "house", party: "republican", seatsHeld: 5 },
  // North Carolina: 1 GOP NPP (10 seats), 1 Dem NPP (3 seats) = the full 13.
  // Both 2019 vacancies (NC-03 and NC-09) were filled at the September 2019
  // special elections, so nothing here is vacant by February 2020.
  { state: "NC", officeType: "house", party: "republican", seatsHeld: 10 },
  { state: "NC", officeType: "house", party: "democrat", seatsHeld: 3 },
  // North Dakota: 1 GOP NPP (1 seat)
  { state: "ND", officeType: "house", party: "republican", seatsHeld: 1 },
  // Ohio: 1 GOP NPP (12 seats), 1 Dem NPP (4 seats)
  { state: "OH", officeType: "house", party: "republican", seatsHeld: 12 },
  { state: "OH", officeType: "house", party: "democrat", seatsHeld: 4 },
  // Oklahoma: 1 GOP NPP (4 seats), 1 Dem NPP (1 seat)
  { state: "OK", officeType: "house", party: "republican", seatsHeld: 4 },
  { state: "OK", officeType: "house", party: "democrat", seatsHeld: 1 },
  // Oregon: 1 Dem NPP (4 seats), 1 GOP NPP (1 seat)
  { state: "OR", officeType: "house", party: "democrat", seatsHeld: 4 },
  { state: "OR", officeType: "house", party: "republican", seatsHeld: 1 },
  // Pennsylvania: 1 Dem NPP (9 seats), 1 GOP NPP (9 seats)
  { state: "PA", officeType: "house", party: "democrat", seatsHeld: 9 },
  { state: "PA", officeType: "house", party: "republican", seatsHeld: 9 },
  // Rhode Island: 1 Dem NPP (2 seats)
  { state: "RI", officeType: "house", party: "democrat", seatsHeld: 2 },
  // South Carolina: 1 GOP NPP (5 seats), 1 Dem NPP (2 seats)
  { state: "SC", officeType: "house", party: "republican", seatsHeld: 5 },
  { state: "SC", officeType: "house", party: "democrat", seatsHeld: 2 },
  // South Dakota: 1 GOP NPP (1 seat)
  { state: "SD", officeType: "house", party: "republican", seatsHeld: 1 },
  // Tennessee: 1 GOP NPP (7 seats), 1 Dem NPP (2 seats)
  { state: "TN", officeType: "house", party: "republican", seatsHeld: 7 },
  { state: "TN", officeType: "house", party: "democrat", seatsHeld: 2 },
  // Texas: 1 GOP NPP (22 seats), 1 Dem NPP (13 seats). TX-04 sits VACANT in
  // February 2020, the seat having fallen vacant that January.
  { state: "TX", officeType: "house", party: "republican", seatsHeld: 22 },
  { state: "TX", officeType: "house", party: "democrat", seatsHeld: 13 },
  // Utah: 1 GOP NPP (3 seats), 1 Dem NPP (1 seat)
  { state: "UT", officeType: "house", party: "republican", seatsHeld: 3 },
  { state: "UT", officeType: "house", party: "democrat", seatsHeld: 1 },
  // Vermont: 1 Dem NPP (1 seat)
  { state: "VT", officeType: "house", party: "democrat", seatsHeld: 1 },
  // Virginia: 1 Dem NPP (7 seats), 1 GOP NPP (4 seats)
  { state: "VA", officeType: "house", party: "democrat", seatsHeld: 7 },
  { state: "VA", officeType: "house", party: "republican", seatsHeld: 4 },
  // Washington: 1 Dem NPP (7 seats), 1 GOP NPP (3 seats)
  { state: "WA", officeType: "house", party: "democrat", seatsHeld: 7 },
  { state: "WA", officeType: "house", party: "republican", seatsHeld: 3 },
  // West Virginia: 1 GOP NPP (3 seats)
  { state: "WV", officeType: "house", party: "republican", seatsHeld: 3 },
  // Wisconsin: 1 GOP NPP (4 seats), 1 Dem NPP (3 seats). WI-07 sits VACANT in
  // February 2020, the seat having fallen vacant in September 2019.
  { state: "WI", officeType: "house", party: "republican", seatsHeld: 4 },
  { state: "WI", officeType: "house", party: "democrat", seatsHeld: 3 },
  // Wyoming: 1 GOP NPP (1 seat)
  { state: "WY", officeType: "house", party: "republican", seatsHeld: 1 },
];

// Senate: Each entry = ONE NPP holding one Senate seat
export const US_SENATE_2020: HistoricalSeat[] = [
  // Alabama: 2 GOP NPPs
  { state: "AL", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "AL", officeType: "senate", party: "republican", senateClass: 3 },
  // Alaska: 2 GOP NPPs
  { state: "AK", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "AK", officeType: "senate", party: "republican", senateClass: 3 },
  // Arizona: 1 GOP NPP, 1 Dem NPP
  { state: "AZ", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "AZ", officeType: "senate", party: "democrat", senateClass: 1 },
  // Arkansas: 2 GOP NPPs
  { state: "AR", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "AR", officeType: "senate", party: "republican", senateClass: 3 },
  // California: 2 Dem NPPs
  { state: "CA", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "CA", officeType: "senate", party: "democrat", senateClass: 3 },
  // Colorado: 1 Dem NPP, 1 GOP NPP
  { state: "CO", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "CO", officeType: "senate", party: "republican", senateClass: 2 },
  // Connecticut: 2 Dem NPPs
  { state: "CT", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "CT", officeType: "senate", party: "democrat", senateClass: 3 },
  // Delaware: 2 Dem NPPs
  { state: "DE", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "DE", officeType: "senate", party: "democrat", senateClass: 2 },
  // Florida: 2 GOP NPPs
  { state: "FL", officeType: "senate", party: "republican", senateClass: 3 },
  { state: "FL", officeType: "senate", party: "republican", senateClass: 1 },
  // Georgia: 2 GOP NPPs
  { state: "GA", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "GA", officeType: "senate", party: "republican", senateClass: 3 },
  // Hawaii: 2 Dem NPPs
  { state: "HI", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "HI", officeType: "senate", party: "democrat", senateClass: 3 },
  // Idaho: 2 GOP NPPs
  { state: "ID", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "ID", officeType: "senate", party: "republican", senateClass: 3 },
  // Illinois: 2 Dem NPPs
  { state: "IL", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "IL", officeType: "senate", party: "democrat", senateClass: 3 },
  // Indiana: 2 GOP NPPs
  { state: "IN", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "IN", officeType: "senate", party: "republican", senateClass: 3 },
  // Iowa: 2 GOP NPPs
  { state: "IA", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "IA", officeType: "senate", party: "republican", senateClass: 3 },
  // Kansas: 2 GOP NPPs
  { state: "KS", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "KS", officeType: "senate", party: "republican", senateClass: 3 },
  // Kentucky: 2 GOP NPPs
  { state: "KY", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "KY", officeType: "senate", party: "republican", senateClass: 3 },
  // Louisiana: 2 GOP NPPs
  { state: "LA", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "LA", officeType: "senate", party: "republican", senateClass: 3 },
  // Maine: 1 GOP NPP, 1 Independent NPP (Angus King)
  { state: "ME", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "ME", officeType: "senate", party: "independent", senateClass: 1 },
  // Maryland: 2 Dem NPPs
  { state: "MD", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "MD", officeType: "senate", party: "democrat", senateClass: 3 },
  // Massachusetts: 2 Dem NPPs
  { state: "MA", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "MA", officeType: "senate", party: "democrat", senateClass: 2 },
  // Michigan: 2 Dem NPPs
  { state: "MI", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "MI", officeType: "senate", party: "democrat", senateClass: 2 },
  // Minnesota: 2 Dem NPPs
  { state: "MN", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "MN", officeType: "senate", party: "democrat", senateClass: 2 },
  // Mississippi: 2 GOP NPPs
  { state: "MS", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "MS", officeType: "senate", party: "republican", senateClass: 2 },
  // Missouri: 2 GOP NPPs
  { state: "MO", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "MO", officeType: "senate", party: "republican", senateClass: 3 },
  // Montana: 1 Dem NPP, 1 GOP NPP
  { state: "MT", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "MT", officeType: "senate", party: "republican", senateClass: 2 },
  // Nebraska: 2 GOP NPPs
  { state: "NE", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "NE", officeType: "senate", party: "republican", senateClass: 2 },
  // Nevada: 2 Dem NPPs
  { state: "NV", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "NV", officeType: "senate", party: "democrat", senateClass: 3 },
  // New Hampshire: 2 Dem NPPs
  { state: "NH", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "NH", officeType: "senate", party: "democrat", senateClass: 3 },
  // New Jersey: 2 Dem NPPs
  { state: "NJ", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "NJ", officeType: "senate", party: "democrat", senateClass: 2 },
  // New Mexico: 2 Dem NPPs
  { state: "NM", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "NM", officeType: "senate", party: "democrat", senateClass: 2 },
  // New York: 2 Dem NPPs
  { state: "NY", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "NY", officeType: "senate", party: "democrat", senateClass: 3 },
  // North Carolina: 2 GOP NPPs
  { state: "NC", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "NC", officeType: "senate", party: "republican", senateClass: 3 },
  // North Dakota: 2 GOP NPPs
  { state: "ND", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "ND", officeType: "senate", party: "republican", senateClass: 3 },
  // Ohio: 1 Dem NPP, 1 GOP NPP
  { state: "OH", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "OH", officeType: "senate", party: "republican", senateClass: 3 },
  // Oklahoma: 2 GOP NPPs
  { state: "OK", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "OK", officeType: "senate", party: "republican", senateClass: 3 },
  // Oregon: 2 Dem NPPs
  { state: "OR", officeType: "senate", party: "democrat", senateClass: 2 },
  { state: "OR", officeType: "senate", party: "democrat", senateClass: 3 },
  // Pennsylvania: 1 Dem NPP, 1 GOP NPP
  { state: "PA", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "PA", officeType: "senate", party: "republican", senateClass: 3 },
  // Rhode Island: 2 Dem NPPs
  { state: "RI", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "RI", officeType: "senate", party: "democrat", senateClass: 2 },
  // South Carolina: 2 GOP NPPs
  { state: "SC", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "SC", officeType: "senate", party: "republican", senateClass: 3 },
  // South Dakota: 2 GOP NPPs
  { state: "SD", officeType: "senate", party: "republican", senateClass: 2 },
  { state: "SD", officeType: "senate", party: "republican", senateClass: 3 },
  // Tennessee: 2 GOP NPPs
  { state: "TN", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "TN", officeType: "senate", party: "republican", senateClass: 2 },
  // Texas: 2 GOP NPPs
  { state: "TX", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "TX", officeType: "senate", party: "republican", senateClass: 2 },
  // Utah: 2 GOP NPPs
  { state: "UT", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "UT", officeType: "senate", party: "republican", senateClass: 3 },
  // Vermont: 1 Dem NPP, 1 Independent NPP (Bernie Sanders)
  { state: "VT", officeType: "senate", party: "democrat", senateClass: 3 },
  { state: "VT", officeType: "senate", party: "independent", senateClass: 1 },
  // Virginia: 2 Dem NPPs
  { state: "VA", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "VA", officeType: "senate", party: "democrat", senateClass: 2 },
  // Washington: 2 Dem NPPs
  { state: "WA", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "WA", officeType: "senate", party: "democrat", senateClass: 3 },
  // West Virginia: 1 Dem NPP, 1 GOP NPP
  { state: "WV", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "WV", officeType: "senate", party: "republican", senateClass: 2 },
  // Wisconsin: 1 Dem NPP, 1 GOP NPP
  { state: "WI", officeType: "senate", party: "democrat", senateClass: 1 },
  { state: "WI", officeType: "senate", party: "republican", senateClass: 3 },
  // Wyoming: 2 GOP NPPs
  { state: "WY", officeType: "senate", party: "republican", senateClass: 1 },
  { state: "WY", officeType: "senate", party: "republican", senateClass: 2 },
];

// Governors: Each entry = ONE NPP holding the governorship
export const US_GOVERNORS_2020: HistoricalSeat[] = [
  { state: "AL", officeType: "governor", party: "republican" },
  { state: "AK", officeType: "governor", party: "republican" },
  { state: "AZ", officeType: "governor", party: "republican" },
  { state: "AR", officeType: "governor", party: "republican" },
  { state: "CA", officeType: "governor", party: "democrat" },
  { state: "CO", officeType: "governor", party: "democrat" },
  { state: "CT", officeType: "governor", party: "democrat" },
  { state: "DE", officeType: "governor", party: "democrat" },
  { state: "FL", officeType: "governor", party: "republican" },
  { state: "GA", officeType: "governor", party: "republican" },
  { state: "HI", officeType: "governor", party: "democrat" },
  { state: "ID", officeType: "governor", party: "republican" },
  { state: "IL", officeType: "governor", party: "democrat" },
  { state: "IN", officeType: "governor", party: "republican" },
  { state: "IA", officeType: "governor", party: "republican" },
  { state: "KS", officeType: "governor", party: "democrat" },
  { state: "KY", officeType: "governor", party: "democrat" },
  { state: "LA", officeType: "governor", party: "democrat" },
  { state: "ME", officeType: "governor", party: "democrat" },
  { state: "MD", officeType: "governor", party: "republican" },
  { state: "MA", officeType: "governor", party: "republican" },
  { state: "MI", officeType: "governor", party: "democrat" },
  { state: "MN", officeType: "governor", party: "democrat" },
  { state: "MS", officeType: "governor", party: "republican" },
  { state: "MO", officeType: "governor", party: "republican" },
  { state: "MT", officeType: "governor", party: "democrat" },
  { state: "NE", officeType: "governor", party: "republican" },
  { state: "NV", officeType: "governor", party: "democrat" },
  { state: "NH", officeType: "governor", party: "republican" },
  { state: "NJ", officeType: "governor", party: "democrat" },
  { state: "NM", officeType: "governor", party: "democrat" },
  { state: "NY", officeType: "governor", party: "democrat" },
  { state: "NC", officeType: "governor", party: "democrat" },
  { state: "ND", officeType: "governor", party: "republican" },
  { state: "OH", officeType: "governor", party: "republican" },
  { state: "OK", officeType: "governor", party: "republican" },
  { state: "OR", officeType: "governor", party: "democrat" },
  { state: "PA", officeType: "governor", party: "democrat" },
  { state: "RI", officeType: "governor", party: "democrat" },
  { state: "SC", officeType: "governor", party: "republican" },
  { state: "SD", officeType: "governor", party: "republican" },
  { state: "TN", officeType: "governor", party: "republican" },
  { state: "TX", officeType: "governor", party: "republican" },
  { state: "UT", officeType: "governor", party: "republican" },
  { state: "VT", officeType: "governor", party: "republican" },
  { state: "VA", officeType: "governor", party: "democrat" },
  { state: "WA", officeType: "governor", party: "democrat" },
  { state: "WV", officeType: "governor", party: "republican" },
  { state: "WI", officeType: "governor", party: "democrat" },
  { state: "WY", officeType: "governor", party: "republican" },
];

// ─── US January 2020: State Senate Compositions ────────────────────────────
// Based on state legislative chamber compositions as of January 1, 2020.
// Each entry = ONE NPP holding all that party's seats in that state senate.
// Nebraska is unicameral (nonpartisan) — omitted as it uses a different system.

export const US_STATE_SENATE_2020: HistoricalSeat[] = [
  // Alabama: 27R, 8D
  { state: "AL", officeType: "stateSenate", party: "republican", seatsHeld: 27 },
  { state: "AL", officeType: "stateSenate", party: "democrat", seatsHeld: 8 },
  // Alaska: 13R, 7D
  { state: "AK", officeType: "stateSenate", party: "republican", seatsHeld: 13 },
  { state: "AK", officeType: "stateSenate", party: "democrat", seatsHeld: 7 },
  // Arizona: 17R, 13D
  { state: "AZ", officeType: "stateSenate", party: "republican", seatsHeld: 17 },
  { state: "AZ", officeType: "stateSenate", party: "democrat", seatsHeld: 13 },
  // Arkansas: 26R, 9D
  { state: "AR", officeType: "stateSenate", party: "republican", seatsHeld: 26 },
  { state: "AR", officeType: "stateSenate", party: "democrat", seatsHeld: 9 },
  // California: 29D, 11R
  { state: "CA", officeType: "stateSenate", party: "democrat", seatsHeld: 29 },
  { state: "CA", officeType: "stateSenate", party: "republican", seatsHeld: 11 },
  // Colorado: 19D, 16R
  { state: "CO", officeType: "stateSenate", party: "democrat", seatsHeld: 19 },
  { state: "CO", officeType: "stateSenate", party: "republican", seatsHeld: 16 },
  // Connecticut: 22D, 14R
  { state: "CT", officeType: "stateSenate", party: "democrat", seatsHeld: 22 },
  { state: "CT", officeType: "stateSenate", party: "republican", seatsHeld: 14 },
  // Delaware: 12D, 9R
  { state: "DE", officeType: "stateSenate", party: "democrat", seatsHeld: 12 },
  { state: "DE", officeType: "stateSenate", party: "republican", seatsHeld: 9 },
  // Florida: 23R, 17D
  { state: "FL", officeType: "stateSenate", party: "republican", seatsHeld: 23 },
  { state: "FL", officeType: "stateSenate", party: "democrat", seatsHeld: 17 },
  // Georgia: 35R, 21D
  { state: "GA", officeType: "stateSenate", party: "republican", seatsHeld: 35 },
  { state: "GA", officeType: "stateSenate", party: "democrat", seatsHeld: 21 },
  // Hawaii: 24D, 1R
  { state: "HI", officeType: "stateSenate", party: "democrat", seatsHeld: 24 },
  { state: "HI", officeType: "stateSenate", party: "republican", seatsHeld: 1 },
  // Idaho: 28R, 7D
  { state: "ID", officeType: "stateSenate", party: "republican", seatsHeld: 28 },
  { state: "ID", officeType: "stateSenate", party: "democrat", seatsHeld: 7 },
  // Illinois: 40D, 19R
  { state: "IL", officeType: "stateSenate", party: "democrat", seatsHeld: 40 },
  { state: "IL", officeType: "stateSenate", party: "republican", seatsHeld: 19 },
  // Indiana: 40R, 10D
  { state: "IN", officeType: "stateSenate", party: "republican", seatsHeld: 40 },
  { state: "IN", officeType: "stateSenate", party: "democrat", seatsHeld: 10 },
  // Iowa: 32R, 18D
  { state: "IA", officeType: "stateSenate", party: "republican", seatsHeld: 32 },
  { state: "IA", officeType: "stateSenate", party: "democrat", seatsHeld: 18 },
  // Kansas: 29R, 11D
  { state: "KS", officeType: "stateSenate", party: "republican", seatsHeld: 29 },
  { state: "KS", officeType: "stateSenate", party: "democrat", seatsHeld: 11 },
  // Kentucky: 29R, 9D
  { state: "KY", officeType: "stateSenate", party: "republican", seatsHeld: 29 },
  { state: "KY", officeType: "stateSenate", party: "democrat", seatsHeld: 9 },
  // Louisiana: 27R, 12D
  { state: "LA", officeType: "stateSenate", party: "republican", seatsHeld: 27 },
  { state: "LA", officeType: "stateSenate", party: "democrat", seatsHeld: 12 },
  // Maine: 21D, 14R
  { state: "ME", officeType: "stateSenate", party: "democrat", seatsHeld: 21 },
  { state: "ME", officeType: "stateSenate", party: "republican", seatsHeld: 14 },
  // Maryland: 32D, 15R
  { state: "MD", officeType: "stateSenate", party: "democrat", seatsHeld: 32 },
  { state: "MD", officeType: "stateSenate", party: "republican", seatsHeld: 15 },
  // Massachusetts: 34D, 6R
  { state: "MA", officeType: "stateSenate", party: "democrat", seatsHeld: 34 },
  { state: "MA", officeType: "stateSenate", party: "republican", seatsHeld: 6 },
  // Michigan: 22R, 16D
  { state: "MI", officeType: "stateSenate", party: "republican", seatsHeld: 22 },
  { state: "MI", officeType: "stateSenate", party: "democrat", seatsHeld: 16 },
  // Minnesota: 35R, 32D
  { state: "MN", officeType: "stateSenate", party: "republican", seatsHeld: 35 },
  { state: "MN", officeType: "stateSenate", party: "democrat", seatsHeld: 32 },
  // Mississippi: 36R, 16D
  { state: "MS", officeType: "stateSenate", party: "republican", seatsHeld: 36 },
  { state: "MS", officeType: "stateSenate", party: "democrat", seatsHeld: 16 },
  // Missouri: 24R, 10D
  { state: "MO", officeType: "stateSenate", party: "republican", seatsHeld: 24 },
  { state: "MO", officeType: "stateSenate", party: "democrat", seatsHeld: 10 },
  // Montana: 30R, 20D
  { state: "MT", officeType: "stateSenate", party: "republican", seatsHeld: 30 },
  { state: "MT", officeType: "stateSenate", party: "democrat", seatsHeld: 20 },
  // Nebraska: unicameral nonpartisan — omitted
  // Nevada: 13D, 8R
  { state: "NV", officeType: "stateSenate", party: "democrat", seatsHeld: 13 },
  { state: "NV", officeType: "stateSenate", party: "republican", seatsHeld: 8 },
  // New Hampshire: 14R, 10D
  { state: "NH", officeType: "stateSenate", party: "republican", seatsHeld: 14 },
  { state: "NH", officeType: "stateSenate", party: "democrat", seatsHeld: 10 },
  // New Jersey: 25D, 15R
  { state: "NJ", officeType: "stateSenate", party: "democrat", seatsHeld: 25 },
  { state: "NJ", officeType: "stateSenate", party: "republican", seatsHeld: 15 },
  // New Mexico: 26D, 16R
  { state: "NM", officeType: "stateSenate", party: "democrat", seatsHeld: 26 },
  { state: "NM", officeType: "stateSenate", party: "republican", seatsHeld: 16 },
  // New York: 40D, 23R
  { state: "NY", officeType: "stateSenate", party: "democrat", seatsHeld: 40 },
  { state: "NY", officeType: "stateSenate", party: "republican", seatsHeld: 23 },
  // North Carolina: 29R, 21D
  { state: "NC", officeType: "stateSenate", party: "republican", seatsHeld: 29 },
  { state: "NC", officeType: "stateSenate", party: "democrat", seatsHeld: 21 },
  // North Dakota: 37R, 10D
  { state: "ND", officeType: "stateSenate", party: "republican", seatsHeld: 37 },
  { state: "ND", officeType: "stateSenate", party: "democrat", seatsHeld: 10 },
  // Ohio: 24R, 9D
  { state: "OH", officeType: "stateSenate", party: "republican", seatsHeld: 24 },
  { state: "OH", officeType: "stateSenate", party: "democrat", seatsHeld: 9 },
  // Oklahoma: 39R, 9D
  { state: "OK", officeType: "stateSenate", party: "republican", seatsHeld: 39 },
  { state: "OK", officeType: "stateSenate", party: "democrat", seatsHeld: 9 },
  // Oregon: 18D, 12R
  { state: "OR", officeType: "stateSenate", party: "democrat", seatsHeld: 18 },
  { state: "OR", officeType: "stateSenate", party: "republican", seatsHeld: 12 },
  // Pennsylvania: 29R, 21D
  { state: "PA", officeType: "stateSenate", party: "republican", seatsHeld: 29 },
  { state: "PA", officeType: "stateSenate", party: "democrat", seatsHeld: 21 },
  // Rhode Island: 33D, 5R
  { state: "RI", officeType: "stateSenate", party: "democrat", seatsHeld: 33 },
  { state: "RI", officeType: "stateSenate", party: "republican", seatsHeld: 5 },
  // South Carolina: 27R, 19D
  { state: "SC", officeType: "stateSenate", party: "republican", seatsHeld: 27 },
  { state: "SC", officeType: "stateSenate", party: "democrat", seatsHeld: 19 },
  // South Dakota: 30R, 5D
  { state: "SD", officeType: "stateSenate", party: "republican", seatsHeld: 30 },
  { state: "SD", officeType: "stateSenate", party: "democrat", seatsHeld: 5 },
  // Tennessee: 28R, 5D
  { state: "TN", officeType: "stateSenate", party: "republican", seatsHeld: 28 },
  { state: "TN", officeType: "stateSenate", party: "democrat", seatsHeld: 5 },
  // Texas: 19R, 12D
  { state: "TX", officeType: "stateSenate", party: "republican", seatsHeld: 19 },
  { state: "TX", officeType: "stateSenate", party: "democrat", seatsHeld: 12 },
  // Utah: 23R, 6D
  { state: "UT", officeType: "stateSenate", party: "republican", seatsHeld: 23 },
  { state: "UT", officeType: "stateSenate", party: "democrat", seatsHeld: 6 },
  // Vermont: 23D, 7R
  { state: "VT", officeType: "stateSenate", party: "democrat", seatsHeld: 23 },
  { state: "VT", officeType: "stateSenate", party: "republican", seatsHeld: 7 },
  // Virginia: 21D, 19R
  { state: "VA", officeType: "stateSenate", party: "democrat", seatsHeld: 21 },
  { state: "VA", officeType: "stateSenate", party: "republican", seatsHeld: 19 },
  // Washington: 29D, 20R
  { state: "WA", officeType: "stateSenate", party: "democrat", seatsHeld: 29 },
  { state: "WA", officeType: "stateSenate", party: "republican", seatsHeld: 20 },
  // West Virginia: 20R, 14D
  { state: "WV", officeType: "stateSenate", party: "republican", seatsHeld: 20 },
  { state: "WV", officeType: "stateSenate", party: "democrat", seatsHeld: 14 },
  // Wisconsin: 19R, 14D
  { state: "WI", officeType: "stateSenate", party: "republican", seatsHeld: 19 },
  { state: "WI", officeType: "stateSenate", party: "democrat", seatsHeld: 14 },
  // Wyoming: 27R, 3D
  { state: "WY", officeType: "stateSenate", party: "republican", seatsHeld: 27 },
  { state: "WY", officeType: "stateSenate", party: "democrat", seatsHeld: 3 },
];

// Republican ticket, from the 2016 election, sitting through the 2020 world.
// Shared by the 1999/2007/2023 presets, which reuse the 2020 groups wholesale:
// a 1999 world seating a 2020-era executive is wrong, but it is consistent with
// those presets already reusing the entire 2020 legislature, and strictly
// better than opening with no head of state at all.
export const US_EXECUTIVE_2020: HistoricalSeat[] = [
  { state: "US", officeType: "president", party: "republican" },
  { state: "US", officeType: "vicePresident", party: "republican" },
];
