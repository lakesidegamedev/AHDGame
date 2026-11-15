import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// No devolved executives existed at the 1991 starting settlement. Existing
// saves retain their seated leaders through the devolution compatibility path;
// new worlds require a founding law before these offices can hold elections.
export const UK_FIRST_MINISTERS_1992: HistoricalSeat[] = [];

// ─── UK 1992: Regional Council Compositions ────────────────────────────────
// Devolution didn't exist in 1992 (Scotland 1999, Wales 1999, NI 1998), so
// these party splits are aggregated from the local-government tier that DID
// exist in the early 90s:
//   - English regions: 1989 county councils + 1990/1991 London borough and
//     metropolitan district elections
//   - Scotland: 1990 Scottish regional council elections (the regional
//     councils that existed until the 1996 unitary reorganization)
//   - Wales: 1991 Welsh county + district council elections
//   - Northern Ireland: 1989 district council elections
//
// Totals match each region's current `stateSenateSeats` config in
// `src/lib/seeds/uk/ukRegions.ts`. The seat counts in the config are the
// modern devolved-parliament/assembly sizes (SCO 129 MSPs, WAL 60 MSs, NIR
// 90 MLAs, LON 32 GLA-equivalent) — we keep them as the chamber size for
// gameplay purposes and just allocate them according to the 1989-91 local
// vote shares scaled up.
//
// Major political backdrop: Conservative-led government under Major; Labour
// surging at local level after 1989-91 poll-tax backlash; Lib Dems
// recovering from the 1988 SDP-Liberal merger; SNP gaining at Westminster
// (3 MPs after 1992 GE) but still secondary to Labour in Scottish local
// councils.
//
// SDLP / Alliance are not seeded as default parties — like UK_COMMONS_1987,
// we keep `uk_sdlp` / `uk_alliance` slugs to preserve historical attribution
// (they fall back to `independent` via `seedHistorical`'s resolver until
// those parties are seeded).
//
// Each entry = ONE NPP holding all that party's seats in that region.

export const UK_REGIONAL_COUNCIL_1992: HistoricalSeat[] = [
  // London (32 seats): Labour swept the 1990 London borough elections in the
  // post-poll-tax backlash. Tory suburban boroughs still held outer London.
  { state: "LON", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 20 },
  { state: "LON", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 11 },
  { state: "LON", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 1 },

  // South East England (67 seats): Conservative heartland in the 1989 county
  // council elections; Lib Dems gaining footholds in Hampshire / Surrey.
  { state: "SEE", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 42 },
  { state: "SEE", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 12 },
  { state: "SEE", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 13 },

  // South West England (39 seats): Tory with strong Lib Dem pockets
  // (Cornwall, Devon, Somerset West).
  { state: "SWE", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 22 },
  { state: "SWE", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 9 },
  { state: "SWE", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 8 },

  // East of England (39 seats): Conservative-leaning rural and suburban
  // counties; Labour pockets in Norwich / Luton / Peterborough.
  { state: "EAE", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 23 },
  { state: "EAE", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 11 },
  { state: "EAE", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 5 },

  // East Midlands (39 seats): Closely contested between Tory shire counties
  // and Labour Derby / Nottingham / Leicester urban authorities.
  { state: "EMI", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 18 },
  { state: "EMI", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 18 },
  { state: "EMI", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 3 },

  // West Midlands (18 seats): Labour controlled Birmingham + the Black
  // Country metropolitan districts; Tory shires around Warwickshire.
  { state: "WMI", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 9 },
  { state: "WMI", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 8 },
  { state: "WMI", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 1 },

  // Yorkshire & the Humber (21 seats): Labour locked in the metropolitan
  // boroughs; Conservatives held N/E Yorkshire.
  { state: "YHU", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 13 },
  { state: "YHU", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 7 },
  { state: "YHU", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 1 },

  // North West England (27 seats): Labour heartland; Manchester / Liverpool
  // / Salford solidly Labour. Tories held Cheshire-area shires.
  { state: "NWE", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 18 },
  { state: "NWE", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 8 },
  { state: "NWE", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 1 },

  // North East England (17 seats): Strong Labour across Tyneside, Wearside,
  // Durham, Teesside.
  { state: "NEE", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 14 },
  { state: "NEE", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 3 },

  // Scotland (129 seats): 1990 regional council elections — Labour took
  // Strathclyde/Lothian/Central/Fife, SNP held a handful of districts in
  // Tayside, Conservatives clung on in Grampian/Borders. Plenty of
  // independent councillors in island and rural authorities.
  { state: "SCO", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 65 },
  { state: "SCO", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 20 },
  { state: "SCO", officeType: "regionalCouncil", party: "uk_snp", seatsHeld: 15 },
  { state: "SCO", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 14 },
  { state: "SCO", officeType: "regionalCouncil", party: "uk_independent", seatsHeld: 15 },

  // Wales (60 seats): 1991 county + district elections. Labour controlled
  // South Wales valleys, Conservative held Powys / Vale of Glamorgan, Plaid
  // Cymru concentrated in Gwynedd, Lib Dems in mid-Wales.
  { state: "WAL", officeType: "regionalCouncil", party: "uk_labour", seatsHeld: 30 },
  { state: "WAL", officeType: "regionalCouncil", party: "uk_conservative", seatsHeld: 10 },
  { state: "WAL", officeType: "regionalCouncil", party: "uk_plaid", seatsHeld: 8 },
  { state: "WAL", officeType: "regionalCouncil", party: "uk_libdem", seatsHeld: 6 },
  { state: "WAL", officeType: "regionalCouncil", party: "uk_independent", seatsHeld: 6 },

  // Northern Ireland (90 seats): 1989 district council elections, scaled
  // proportionally. UUP largest, DUP second, SDLP third, SF fourth,
  // Alliance fifth. Misc unionist/loyalist Independents fill the remainder.
  { state: "NIR", officeType: "regionalCouncil", party: "uk_uup", seatsHeld: 30 },
  { state: "NIR", officeType: "regionalCouncil", party: "uk_sdlp", seatsHeld: 19 },
  { state: "NIR", officeType: "regionalCouncil", party: "uk_dup", seatsHeld: 16 },
  { state: "NIR", officeType: "regionalCouncil", party: "uk_sf", seatsHeld: 10 },
  { state: "NIR", officeType: "regionalCouncil", party: "uk_independent", seatsHeld: 9 },
  { state: "NIR", officeType: "regionalCouncil", party: "uk_alliance", seatsHeld: 6 },
];
