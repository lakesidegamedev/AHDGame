import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// ─── Germany: 20th Bundestag (post-2021 election) scaled + 2020 Ministerpräsidenten ──
// Seat counts scaled down from the 736-seat 2021 Bundestag to 201 NPP-held seats
// to match the existing seed-de-npps targets (SPD 56, CDU 42, CSU 12, Greens 32,
// FDP 25, AfD 23, Linke 11). Distribution per Land follows 2021 Zweitstimmen
// vote shares and Land population. One NPP per (Land × party) holds that
// party's seatsHeld share of the Bundestag group for that Land.
export const DE_BUNDESTAG_2021: HistoricalSeat[] = [
  // Baden-Württemberg (~14% pop — CDU-leaning, strong Greens)
  { state: "BW", officeType: "bundestag", party: "de_spd", seatsHeld: 7 },
  { state: "BW", officeType: "bundestag", party: "de_cdu", seatsHeld: 7 },
  { state: "BW", officeType: "bundestag", party: "de_greens", seatsHeld: 6 },
  { state: "BW", officeType: "bundestag", party: "de_fdp", seatsHeld: 4 },
  { state: "BW", officeType: "bundestag", party: "de_afd", seatsHeld: 3 },
  { state: "BW", officeType: "bundestag", party: "de_linke", seatsHeld: 1 },
  // Bayern (~16% pop — CSU replaces CDU here)
  { state: "BY", officeType: "bundestag", party: "de_spd", seatsHeld: 7 },
  { state: "BY", officeType: "bundestag", party: "de_csu", seatsHeld: 12 },
  { state: "BY", officeType: "bundestag", party: "de_greens", seatsHeld: 5 },
  { state: "BY", officeType: "bundestag", party: "de_fdp", seatsHeld: 3 },
  { state: "BY", officeType: "bundestag", party: "de_afd", seatsHeld: 3 },
  // Berlin (city-state, left-liberal)
  { state: "BE", officeType: "bundestag", party: "de_spd", seatsHeld: 2 },
  { state: "BE", officeType: "bundestag", party: "de_cdu", seatsHeld: 2 },
  { state: "BE", officeType: "bundestag", party: "de_greens", seatsHeld: 2 },
  { state: "BE", officeType: "bundestag", party: "de_fdp", seatsHeld: 1 },
  { state: "BE", officeType: "bundestag", party: "de_afd", seatsHeld: 1 },
  { state: "BE", officeType: "bundestag", party: "de_linke", seatsHeld: 1 },
  // Brandenburg (east — strong AfD)
  { state: "BB", officeType: "bundestag", party: "de_spd", seatsHeld: 2 },
  { state: "BB", officeType: "bundestag", party: "de_cdu", seatsHeld: 1 },
  { state: "BB", officeType: "bundestag", party: "de_greens", seatsHeld: 1 },
  { state: "BB", officeType: "bundestag", party: "de_fdp", seatsHeld: 1 },
  { state: "BB", officeType: "bundestag", party: "de_afd", seatsHeld: 1 },
  // Bremen (smallest, SPD stronghold)
  { state: "BRE", officeType: "bundestag", party: "de_spd", seatsHeld: 1 },
  { state: "BRE", officeType: "bundestag", party: "de_greens", seatsHeld: 1 },
  // Hamburg (SPD/Greens)
  { state: "HH", officeType: "bundestag", party: "de_spd", seatsHeld: 1 },
  { state: "HH", officeType: "bundestag", party: "de_cdu", seatsHeld: 1 },
  { state: "HH", officeType: "bundestag", party: "de_greens", seatsHeld: 1 },
  { state: "HH", officeType: "bundestag", party: "de_fdp", seatsHeld: 1 },
  // Hessen
  { state: "HE", officeType: "bundestag", party: "de_spd", seatsHeld: 5 },
  { state: "HE", officeType: "bundestag", party: "de_cdu", seatsHeld: 4 },
  { state: "HE", officeType: "bundestag", party: "de_greens", seatsHeld: 2 },
  { state: "HE", officeType: "bundestag", party: "de_fdp", seatsHeld: 3 },
  { state: "HE", officeType: "bundestag", party: "de_afd", seatsHeld: 2 },
  { state: "HE", officeType: "bundestag", party: "de_linke", seatsHeld: 1 },
  // Mecklenburg-Vorpommern (east)
  { state: "MV", officeType: "bundestag", party: "de_spd", seatsHeld: 1 },
  { state: "MV", officeType: "bundestag", party: "de_cdu", seatsHeld: 1 },
  { state: "MV", officeType: "bundestag", party: "de_afd", seatsHeld: 1 },
  { state: "MV", officeType: "bundestag", party: "de_linke", seatsHeld: 1 },
  // Niedersachsen (large north — SPD leaning)
  { state: "NI", officeType: "bundestag", party: "de_spd", seatsHeld: 6 },
  { state: "NI", officeType: "bundestag", party: "de_cdu", seatsHeld: 5 },
  { state: "NI", officeType: "bundestag", party: "de_greens", seatsHeld: 3 },
  { state: "NI", officeType: "bundestag", party: "de_fdp", seatsHeld: 2 },
  { state: "NI", officeType: "bundestag", party: "de_afd", seatsHeld: 2 },
  { state: "NI", officeType: "bundestag", party: "de_linke", seatsHeld: 1 },
  // Nordrhein-Westfalen (largest Land by population)
  { state: "NW", officeType: "bundestag", party: "de_spd", seatsHeld: 14 },
  { state: "NW", officeType: "bundestag", party: "de_cdu", seatsHeld: 11 },
  { state: "NW", officeType: "bundestag", party: "de_greens", seatsHeld: 8 },
  { state: "NW", officeType: "bundestag", party: "de_fdp", seatsHeld: 5 },
  { state: "NW", officeType: "bundestag", party: "de_afd", seatsHeld: 3 },
  { state: "NW", officeType: "bundestag", party: "de_linke", seatsHeld: 2 },
  // Rheinland-Pfalz
  { state: "RP", officeType: "bundestag", party: "de_spd", seatsHeld: 3 },
  { state: "RP", officeType: "bundestag", party: "de_cdu", seatsHeld: 3 },
  { state: "RP", officeType: "bundestag", party: "de_greens", seatsHeld: 1 },
  { state: "RP", officeType: "bundestag", party: "de_fdp", seatsHeld: 1 },
  { state: "RP", officeType: "bundestag", party: "de_afd", seatsHeld: 1 },
  { state: "RP", officeType: "bundestag", party: "de_linke", seatsHeld: 1 },
  // Saarland (smallest western)
  { state: "SL", officeType: "bundestag", party: "de_spd", seatsHeld: 1 },
  { state: "SL", officeType: "bundestag", party: "de_cdu", seatsHeld: 1 },
  // Sachsen (east — AfD stronghold)
  { state: "SN", officeType: "bundestag", party: "de_spd", seatsHeld: 2 },
  { state: "SN", officeType: "bundestag", party: "de_cdu", seatsHeld: 2 },
  { state: "SN", officeType: "bundestag", party: "de_greens", seatsHeld: 1 },
  { state: "SN", officeType: "bundestag", party: "de_fdp", seatsHeld: 1 },
  { state: "SN", officeType: "bundestag", party: "de_afd", seatsHeld: 3 },
  { state: "SN", officeType: "bundestag", party: "de_linke", seatsHeld: 1 },
  // Sachsen-Anhalt (east)
  { state: "ST", officeType: "bundestag", party: "de_spd", seatsHeld: 1 },
  { state: "ST", officeType: "bundestag", party: "de_cdu", seatsHeld: 1 },
  { state: "ST", officeType: "bundestag", party: "de_fdp", seatsHeld: 1 },
  { state: "ST", officeType: "bundestag", party: "de_afd", seatsHeld: 1 },
  { state: "ST", officeType: "bundestag", party: "de_linke", seatsHeld: 1 },
  // Schleswig-Holstein
  { state: "SH", officeType: "bundestag", party: "de_spd", seatsHeld: 2 },
  { state: "SH", officeType: "bundestag", party: "de_cdu", seatsHeld: 2 },
  { state: "SH", officeType: "bundestag", party: "de_greens", seatsHeld: 1 },
  { state: "SH", officeType: "bundestag", party: "de_fdp", seatsHeld: 1 },
  { state: "SH", officeType: "bundestag", party: "de_afd", seatsHeld: 1 },
  // Thüringen (east — AfD + Linke)
  { state: "TH", officeType: "bundestag", party: "de_spd", seatsHeld: 1 },
  { state: "TH", officeType: "bundestag", party: "de_cdu", seatsHeld: 1 },
  { state: "TH", officeType: "bundestag", party: "de_fdp", seatsHeld: 1 },
  { state: "TH", officeType: "bundestag", party: "de_afd", seatsHeld: 1 },
  { state: "TH", officeType: "bundestag", party: "de_linke", seatsHeld: 1 },
];
