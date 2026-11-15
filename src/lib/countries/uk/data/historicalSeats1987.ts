import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// ─── UK April 1992: Post-1992 General Election ─────────────────────────────
// House of Commons: 651 seats
// Conservative 336, Labour 271, Lib Dem 20, SNP 3, Plaid 4,
// DUP 3, UUP 9, SDLP 4, Alliance 1

// ─── UK Commons — the parliament elected June 1987 ───────────────────────────
//
// ⚠️ THIS REPLACED A 1992 ROSTER, AND THAT WAS THE WHOLE BUG. `1991-default`
// opens in JANUARY 1991, so the sitting Commons is the one elected in June 1987
// on the 1983 boundaries. The preset previously seated the APRIL 1992 result —
// a parliament fifteen months in the world's future, on boundaries that did not
// exist yet — and then `CANONICAL_REAL_ELECTION_YEARS_BY_PRESET.ukCommons` sent
// the world to the polls in 1992 for the election whose outcome it was already
// holding. The US and Japan were never wrong this way: US_HOUSE_1992 is the
// 102nd Congress (elected Nov 1990, seated Jan 1991) despite its name, and
// Japan seats the Feb 1990 Shugiin and Jul 1989 Sangiin.
//
// 650 seats, not 651. The extra seat is the 1992 boundary review's.
//
// National totals are the real 1987 result: Con 376, Lab 229, Alliance 22,
// UUP 9, DUP 3, SDLP 3, PC 3, SNP 3, UPUP 1, SF 1.
//
// ⚠️ THE ALLIANCE'S 22 SEATS ARE RECORDED AS `uk_libdem`. The SDP-Liberal
// Alliance fought 1987 as two parties and merged into the Liberal Democrats in
// March 1988, so by this world's January 1991 start those members sit as Lib
// Dems — which is also the only one of the three that `ukParties.ts` makes
// valid for this preset. Recording them as Alliance would fold all 22 to
// "independent" through the seedHistorical resolver.
//
// Scotland (Lab 50, Con 10, Alliance 9, SNP 3), Wales (Lab 24, Con 8, PC 3,
// Alliance 3) and Northern Ireland are the real regional results. England's
// 358/155/10 is split across the nine English regions to match each region's
// `houseDistricts` in `ukRegions1991`, whose per-region English split is itself
// modelled rather than historical — see that file's header. The national
// totals and the three non-English blocs are exact; the English regional
// distribution is shaped to the real 1987 pattern (Conservative dominance
// through the South and Midlands, Labour majorities in the North, the Alliance
// concentrated in the South West) without claiming per-seat precision.
export const UK_COMMONS_1987: HistoricalSeat[] = [
  { state: "LON", officeType: "commons", party: "uk_conservative", seatsHeld: 56 },
  { state: "LON", officeType: "commons", party: "uk_labour", seatsHeld: 23 },
  { state: "LON", officeType: "commons", party: "uk_libdem", seatsHeld: 2 },

  { state: "SEE", officeType: "commons", party: "uk_conservative", seatsHeld: 84 },
  { state: "SEE", officeType: "commons", party: "uk_labour", seatsHeld: 4 },
  { state: "SEE", officeType: "commons", party: "uk_libdem", seatsHeld: 1 },

  { state: "SWE", officeType: "commons", party: "uk_conservative", seatsHeld: 44 },
  { state: "SWE", officeType: "commons", party: "uk_labour", seatsHeld: 1 },
  { state: "SWE", officeType: "commons", party: "uk_libdem", seatsHeld: 5 },

  { state: "EAE", officeType: "commons", party: "uk_conservative", seatsHeld: 48 },
  { state: "EAE", officeType: "commons", party: "uk_labour", seatsHeld: 5 },

  { state: "EMI", officeType: "commons", party: "uk_conservative", seatsHeld: 31 },
  { state: "EMI", officeType: "commons", party: "uk_labour", seatsHeld: 10 },

  { state: "WMI", officeType: "commons", party: "uk_conservative", seatsHeld: 36 },
  { state: "WMI", officeType: "commons", party: "uk_labour", seatsHeld: 20 },

  { state: "YHU", officeType: "commons", party: "uk_labour", seatsHeld: 32 },
  { state: "YHU", officeType: "commons", party: "uk_conservative", seatsHeld: 20 },

  { state: "NWE", officeType: "commons", party: "uk_labour", seatsHeld: 36 },
  { state: "NWE", officeType: "commons", party: "uk_conservative", seatsHeld: 34 },
  { state: "NWE", officeType: "commons", party: "uk_libdem", seatsHeld: 2 },

  { state: "NEE", officeType: "commons", party: "uk_labour", seatsHeld: 24 },
  { state: "NEE", officeType: "commons", party: "uk_conservative", seatsHeld: 5 },

  { state: "SCO", officeType: "commons", party: "uk_labour", seatsHeld: 50 },
  { state: "SCO", officeType: "commons", party: "uk_conservative", seatsHeld: 10 },
  { state: "SCO", officeType: "commons", party: "uk_libdem", seatsHeld: 9 },
  { state: "SCO", officeType: "commons", party: "uk_snp", seatsHeld: 3 },

  { state: "WAL", officeType: "commons", party: "uk_labour", seatsHeld: 24 },
  { state: "WAL", officeType: "commons", party: "uk_conservative", seatsHeld: 8 },
  { state: "WAL", officeType: "commons", party: "uk_plaid", seatsHeld: 3 },
  { state: "WAL", officeType: "commons", party: "uk_libdem", seatsHeld: 3 },

  // 1987 NIR Commons: UUP 9, DUP 3, SDLP 3, SF 1 (West Belfast) and the lone
  // UPUP member for North Down, recorded directly as `uk_independent`.
  // Unlike 1992, Sinn Féin DID take a seat in 1987 — and unlike `uk_sdlp`,
  // `uk_sf` is a seeded default party in this preset, so that seat keeps its
  // real attribution. `uk_sdlp` is retained for the historical record and
  // still folds to "independent" through the seedHistorical resolver.
  { state: "NIR", officeType: "commons", party: "uk_uup", seatsHeld: 9 },
  { state: "NIR", officeType: "commons", party: "uk_dup", seatsHeld: 3 },
  { state: "NIR", officeType: "commons", party: "uk_sdlp", seatsHeld: 3 },
  { state: "NIR", officeType: "commons", party: "uk_sf", seatsHeld: 1 },
  { state: "NIR", officeType: "commons", party: "uk_independent", seatsHeld: 1 },
];
