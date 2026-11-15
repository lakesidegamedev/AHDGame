import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// ─── UK February 2020: Post-December 2019 Election ───────────────────────────
// House of Commons: 650 seats
// Conservative: 365, Labour: 202, SNP: 47, Lib Dem: 11, DUP: 8,
// Sinn Féin: 7, Plaid Cymru: 4, SDLP: 2, Green: 1, Alliance: 1, Speaker: 1, Independent: 1
//
// Each Commons entry = ONE NPP holding all that party's seats in that region

export const UK_COMMONS_2020: HistoricalSeat[] = [
  // The December 2019 general election, all 650 seats.
  //
  // Con 365, Lab 202, SNP 48, LD 11, DUP 8, SF 7, PC 4, SDLP 2, Green 1,
  // Alliance 1, Speaker 1 = 650. Region totals are the real constituency counts
  // and match ukRegions.houseDistricts exactly, so the seats, the chamber size
  // and the districts that elect them all agree.
  //
  // The Speaker sits for Chorley, in the NORTH WEST - not the South East, where
  // the previous roster placed him alongside an independent that the 2019
  // Parliament did not return.

  // London (73)
  { state: "LON", officeType: "commons", party: "uk_labour", seatsHeld: 49 },
  { state: "LON", officeType: "commons", party: "uk_conservative", seatsHeld: 21 },
  { state: "LON", officeType: "commons", party: "uk_libdem", seatsHeld: 3 },

  // South East England (84)
  { state: "SEE", officeType: "commons", party: "uk_conservative", seatsHeld: 74 },
  { state: "SEE", officeType: "commons", party: "uk_labour", seatsHeld: 8 },
  { state: "SEE", officeType: "commons", party: "uk_libdem", seatsHeld: 1 },
  { state: "SEE", officeType: "commons", party: "uk_green", seatsHeld: 1 },

  // South West England (55)
  { state: "SWE", officeType: "commons", party: "uk_conservative", seatsHeld: 48 },
  { state: "SWE", officeType: "commons", party: "uk_labour", seatsHeld: 6 },
  { state: "SWE", officeType: "commons", party: "uk_libdem", seatsHeld: 1 },

  // East of England (58)
  { state: "EAE", officeType: "commons", party: "uk_conservative", seatsHeld: 52 },
  { state: "EAE", officeType: "commons", party: "uk_labour", seatsHeld: 5 },
  { state: "EAE", officeType: "commons", party: "uk_libdem", seatsHeld: 1 },

  // East Midlands (46)
  { state: "EMI", officeType: "commons", party: "uk_conservative", seatsHeld: 38 },
  { state: "EMI", officeType: "commons", party: "uk_labour", seatsHeld: 8 },

  // West Midlands (59)
  { state: "WMI", officeType: "commons", party: "uk_conservative", seatsHeld: 44 },
  { state: "WMI", officeType: "commons", party: "uk_labour", seatsHeld: 15 },

  // Yorkshire and the Humber (54)
  { state: "YHU", officeType: "commons", party: "uk_conservative", seatsHeld: 26 },
  { state: "YHU", officeType: "commons", party: "uk_labour", seatsHeld: 28 },

  // North West England (75), including the Speaker's seat at Chorley
  { state: "NWE", officeType: "commons", party: "uk_labour", seatsHeld: 41 },
  { state: "NWE", officeType: "commons", party: "uk_conservative", seatsHeld: 32 },
  { state: "NWE", officeType: "commons", party: "uk_libdem", seatsHeld: 1 },
  { state: "NWE", officeType: "commons", party: "uk_speaker", seatsHeld: 1 },

  // North East England (29)
  { state: "NEE", officeType: "commons", party: "uk_labour", seatsHeld: 19 },
  { state: "NEE", officeType: "commons", party: "uk_conservative", seatsHeld: 10 },

  // Scotland (59)
  { state: "SCO", officeType: "commons", party: "uk_snp", seatsHeld: 48 },
  { state: "SCO", officeType: "commons", party: "uk_conservative", seatsHeld: 6 },
  { state: "SCO", officeType: "commons", party: "uk_libdem", seatsHeld: 4 },
  { state: "SCO", officeType: "commons", party: "uk_labour", seatsHeld: 1 },

  // Wales (40)
  { state: "WAL", officeType: "commons", party: "uk_labour", seatsHeld: 22 },
  { state: "WAL", officeType: "commons", party: "uk_conservative", seatsHeld: 14 },
  { state: "WAL", officeType: "commons", party: "uk_plaid", seatsHeld: 4 },

  // Northern Ireland (18)
  { state: "NIR", officeType: "commons", party: "uk_dup", seatsHeld: 8 },
  { state: "NIR", officeType: "commons", party: "uk_sf", seatsHeld: 7 },
  { state: "NIR", officeType: "commons", party: "uk_sdlp", seatsHeld: 2 },
  { state: "NIR", officeType: "commons", party: "uk_alliance", seatsHeld: 1 },
];

// ─── UK January 2020: Regional Council Compositions ────────────────────────
// Based on local council seat compositions as of January 2020.
// English regions use aggregated local authority control data.
// Scotland = Scottish Parliament (129 MSPs), Wales = Senedd (60 MSs),
// Northern Ireland = NI Assembly (90 MLAs).
// Each entry = ONE NPP holding all that party's seats in that council.

export const UK_REGIONAL_COUNCIL_2020: HistoricalSeat[] = [
  // London (32 seats): Labour-dominated with Tory suburbs
  { state: "LON", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 18 },
  { state: "LON", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 11 },
  { state: "LON", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 2 },
  { state: "LON", officeType: "regionalCouncil", party: "uk_green", seatsHeld: 1 },

  // South East England (67 seats): Conservative heartland
  { state: "SEE", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 40 },
  { state: "SEE", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 10 },
  { state: "SEE", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 12 },
  { state: "SEE", officeType: "regionalCouncil", party: "uk_green", seatsHeld: 5 },

  // South West England (39 seats): Conservative with Lib Dem pockets
  { state: "SWE", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 20 },
  { state: "SWE", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 10 },
  { state: "SWE", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 7 },
  { state: "SWE", officeType: "regionalCouncil", party: "uk_green", seatsHeld: 2 },

  // East of England (39 seats): Conservative leaning
  { state: "EAE", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 23 },
  { state: "EAE", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 10 },
  { state: "EAE", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 6 },

  // East Midlands (39 seats): Competitive Con-Lab
  { state: "EMI", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 20 },
  { state: "EMI", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 16 },
  { state: "EMI", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 3 },

  // West Midlands (18 seats): Mixed urban Labour / rural Tory
  { state: "WMI", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 9 },
  { state: "WMI", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 8 },
  { state: "WMI", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 1 },

  // Yorkshire & the Humber (21 seats): Labour urban, Tory rural
  { state: "YHU", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 12 },
  { state: "YHU", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 8 },
  { state: "YHU", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 1 },

  // North West England (27 seats): Labour heartland
  { state: "NWE", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 17 },
  { state: "NWE", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 9 },
  { state: "NWE", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 1 },

  // North East England (17 seats): Strong Labour
  { state: "NEE", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 13 },
  { state: "NEE", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 4 },

  // Scotland (129 MSPs): SNP government, fragmented opposition
  { state: "SCO", officeType: "regionalCouncil", party: "uk_snp", seatsHeld: 63 },
  { state: "SCO", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 31 },
  { state: "SCO", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 24 },
  { state: "SCO", officeType: "regionalCouncil", party: "uk_green", seatsHeld: 6 },
  { state: "SCO", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 5 },

  // Wales (60 MSs): Labour-led Senedd
  { state: "WAL", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 29 },
  { state: "WAL", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 11 },
  { state: "WAL", officeType: "regionalCouncil", party: "uk_plaid", seatsHeld: 10 },
  { state: "WAL", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 5 },
  { state: "WAL", officeType: "regionalCouncil", party: "uk_green", seatsHeld: 1 },
  // 4 seats: Brexit Party / independent — assigned independent
  { state: "WAL", officeType: "regionalCouncil", party: "uk_independent", seatsHeld: 4 },

  // Northern Ireland (90 MLAs): Cross-community power-sharing
  { state: "NIR", officeType: "regionalCouncil", party: "uk_dup", seatsHeld: 28 },
  { state: "NIR", officeType: "regionalCouncil", party: "uk_sf", seatsHeld: 27 },
  { state: "NIR", officeType: "regionalCouncil", party: "uk_sdlp", seatsHeld: 12 },
  { state: "NIR", officeType: "regionalCouncil", party: "uk_alliance", seatsHeld: 8 },
  // Remaining: UUP, TUV, PBP, independents — spread across smaller groups
  { state: "NIR", officeType: "regionalCouncil", party: "uk_independent", seatsHeld: 15 },
];

// ─── UK First Ministers + Mayor of London — February 2020 ──────────────────
// Devolved-executive seats (recycle the `governor` officeType — see
// docs/design/uk-jp-devolved-executives.md). One seat per devolved region:
//   - SCO: First Minister of Scotland — Nicola Sturgeon (SNP)
//   - WAL: First Minister of Wales — Mark Drakeford (Labour)
//   - NIR: First Minister of Northern Ireland — Arlene Foster (DUP) at this point
//   - LON: Mayor of London — Sadiq Khan (Labour)
// English non-London regions intentionally absent — they have no devolved
// executive and `getRegionalExecutive` returns null for them.
export const UK_FIRST_MINISTERS_2020: HistoricalSeat[] = [
  { state: "SCO", officeType: "governor", party: "uk_snp" },
  { state: "WAL", officeType: "governor", party: "uk_labour" },
  { state: "NIR", officeType: "governor", party: "uk_dup" },
  { state: "LON", officeType: "governor", party: "uk_labour" },
];
