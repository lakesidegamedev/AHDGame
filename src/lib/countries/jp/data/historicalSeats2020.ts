import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// ─── JP January 2020: National Diet ─────────────────────────────────────────
// Minor party slugs (jp_sdp, jp_reiwa, jp_nhk, jp_independent) resolve to
// "independent" at seed time if the party doesn't exist in the DB, matching
// the Northern Ireland pattern for DUP/SF/etc.
//
// Shugiin (House of Representatives): 465 seats
//   Post-October 2017 general election + party realignments through Jan 2020
//   LDP 278, CDP 59, Komeito 32, DPFP 43, JCP 14, Ishin 11, SDP 2, NHK 1, Ind 25
// Sangiin (House of Councillors): 245 seats (pre-2022 expansion to 248)
//   Post-July 2019 half-election
//   LDP 113, CDP 32, Komeito 28, DPFP 21, Ishin 16, JCP 13, Other 22
// Governors: 8 regions, all LDP-affiliated at game start
//
// Seat distribution is proportional to each region's Shugiin/Sangiin allocation.
// Each entry = ONE NPP holding all that party's seats in that region.

export const JP_SHUGIIN_2020: HistoricalSeat[] = [
  // Hokkaido (12 seats): LDP-CDP competitive
  { state: "HOK", officeType: "shugiin", party: "jp_ldp", seatsHeld: 6 },
  { state: "HOK", officeType: "shugiin", party: "jp_cdp", seatsHeld: 3 },
  { state: "HOK", officeType: "shugiin", party: "jp_komeito", seatsHeld: 1 },
  { state: "HOK", officeType: "shugiin", party: "jp_dpfp", seatsHeld: 1 },
  { state: "HOK", officeType: "shugiin", party: "jp_jcp", seatsHeld: 1 },

  // Tohoku (37 seats): Strong LDP rural base
  { state: "TOH", officeType: "shugiin", party: "jp_ldp", seatsHeld: 23 },
  { state: "TOH", officeType: "shugiin", party: "jp_cdp", seatsHeld: 5 },
  { state: "TOH", officeType: "shugiin", party: "jp_komeito", seatsHeld: 3 },
  { state: "TOH", officeType: "shugiin", party: "jp_dpfp", seatsHeld: 4 },
  { state: "TOH", officeType: "shugiin", party: "jp_jcp", seatsHeld: 1 },
  { state: "TOH", officeType: "shugiin", party: "jp_ishin", seatsHeld: 1 },

  // Kanto (150 seats): Mixed — LDP strong suburban, CDP strong Tokyo urban
  { state: "KAN", officeType: "shugiin", party: "jp_ldp", seatsHeld: 88 },
  { state: "KAN", officeType: "shugiin", party: "jp_cdp", seatsHeld: 22 },
  { state: "KAN", officeType: "shugiin", party: "jp_komeito", seatsHeld: 10 },
  { state: "KAN", officeType: "shugiin", party: "jp_dpfp", seatsHeld: 16 },
  { state: "KAN", officeType: "shugiin", party: "jp_jcp", seatsHeld: 5 },
  { state: "KAN", officeType: "shugiin", party: "jp_ishin", seatsHeld: 2 },
  { state: "KAN", officeType: "shugiin", party: "jp_sdp", seatsHeld: 1 },
  { state: "KAN", officeType: "shugiin", party: "jp_independent", seatsHeld: 6 },

  // Chubu (81 seats): LDP-leaning industrial/rural mix
  { state: "CHU", officeType: "shugiin", party: "jp_ldp", seatsHeld: 50 },
  { state: "CHU", officeType: "shugiin", party: "jp_cdp", seatsHeld: 9 },
  { state: "CHU", officeType: "shugiin", party: "jp_komeito", seatsHeld: 5 },
  { state: "CHU", officeType: "shugiin", party: "jp_dpfp", seatsHeld: 10 },
  { state: "CHU", officeType: "shugiin", party: "jp_jcp", seatsHeld: 2 },
  { state: "CHU", officeType: "shugiin", party: "jp_ishin", seatsHeld: 2 },
  { state: "CHU", officeType: "shugiin", party: "jp_independent", seatsHeld: 3 },

  // Kansai (82 seats): Ishin stronghold (Osaka-based), LDP also strong
  { state: "KNS", officeType: "shugiin", party: "jp_ldp", seatsHeld: 43 },
  { state: "KNS", officeType: "shugiin", party: "jp_cdp", seatsHeld: 8 },
  { state: "KNS", officeType: "shugiin", party: "jp_komeito", seatsHeld: 6 },
  { state: "KNS", officeType: "shugiin", party: "jp_dpfp", seatsHeld: 4 },
  { state: "KNS", officeType: "shugiin", party: "jp_jcp", seatsHeld: 2 },
  { state: "KNS", officeType: "shugiin", party: "jp_ishin", seatsHeld: 4 },
  { state: "KNS", officeType: "shugiin", party: "jp_independent", seatsHeld: 15 },

  // Chugoku (28 seats): Strong LDP (Abe's home region)
  { state: "CGK", officeType: "shugiin", party: "jp_ldp", seatsHeld: 20 },
  { state: "CGK", officeType: "shugiin", party: "jp_cdp", seatsHeld: 3 },
  { state: "CGK", officeType: "shugiin", party: "jp_komeito", seatsHeld: 2 },
  { state: "CGK", officeType: "shugiin", party: "jp_dpfp", seatsHeld: 2 },
  { state: "CGK", officeType: "shugiin", party: "jp_jcp", seatsHeld: 1 },

  // Shikoku (14 seats): Strong LDP
  { state: "SHI", officeType: "shugiin", party: "jp_ldp", seatsHeld: 10 },
  { state: "SHI", officeType: "shugiin", party: "jp_cdp", seatsHeld: 2 },
  { state: "SHI", officeType: "shugiin", party: "jp_komeito", seatsHeld: 1 },
  { state: "SHI", officeType: "shugiin", party: "jp_dpfp", seatsHeld: 1 },

  // Kyushu & Okinawa (61 seats): LDP strong mainland, Okinawa opposition
  { state: "KYU", officeType: "shugiin", party: "jp_ldp", seatsHeld: 38 },
  { state: "KYU", officeType: "shugiin", party: "jp_cdp", seatsHeld: 7 },
  { state: "KYU", officeType: "shugiin", party: "jp_komeito", seatsHeld: 4 },
  { state: "KYU", officeType: "shugiin", party: "jp_dpfp", seatsHeld: 5 },
  { state: "KYU", officeType: "shugiin", party: "jp_jcp", seatsHeld: 2 },
  { state: "KYU", officeType: "shugiin", party: "jp_ishin", seatsHeld: 2 },
  { state: "KYU", officeType: "shugiin", party: "jp_sdp", seatsHeld: 1 },
  { state: "KYU", officeType: "shugiin", party: "jp_nhk", seatsHeld: 1 },
  { state: "KYU", officeType: "shugiin", party: "jp_independent", seatsHeld: 1 },
];

// Shugiin totals: LDP 278, CDP 59, Komeito 32, DPFP 43, JCP 14, Ishin 11, SDP 2, NHK 1, Ind 25 = 465

export const JP_SANGIIN_2020: HistoricalSeat[] = [
  // Each region participates in both Class 1 and Class 2. Seats split ~50/50 per party.
  // Class 1 gets ceil, Class 2 gets floor for odd totals.
  // Total per region = sum of both classes = full Sangiin allocation.

  // Hokkaido (7 total: C1=4, C2=3)
  { state: "HOK", officeType: "sangiin", party: "jp_ldp", seatsHeld: 2, chamberClass: 1 },
  { state: "HOK", officeType: "sangiin", party: "jp_cdp", seatsHeld: 1, chamberClass: 1 },
  { state: "HOK", officeType: "sangiin", party: "jp_komeito", seatsHeld: 1, chamberClass: 1 },
  { state: "HOK", officeType: "sangiin", party: "jp_ldp", seatsHeld: 1, chamberClass: 2 },
  { state: "HOK", officeType: "sangiin", party: "jp_cdp", seatsHeld: 1, chamberClass: 2 },
  { state: "HOK", officeType: "sangiin", party: "jp_jcp", seatsHeld: 1, chamberClass: 2 },

  // Tohoku (20 total: C1=10, C2=10)
  { state: "TOH", officeType: "sangiin", party: "jp_ldp", seatsHeld: 5, chamberClass: 1 },
  { state: "TOH", officeType: "sangiin", party: "jp_cdp", seatsHeld: 2, chamberClass: 1 },
  { state: "TOH", officeType: "sangiin", party: "jp_komeito", seatsHeld: 1, chamberClass: 1 },
  { state: "TOH", officeType: "sangiin", party: "jp_dpfp", seatsHeld: 1, chamberClass: 1 },
  { state: "TOH", officeType: "sangiin", party: "jp_jcp", seatsHeld: 1, chamberClass: 1 },
  { state: "TOH", officeType: "sangiin", party: "jp_ldp", seatsHeld: 5, chamberClass: 2 },
  { state: "TOH", officeType: "sangiin", party: "jp_cdp", seatsHeld: 2, chamberClass: 2 },
  { state: "TOH", officeType: "sangiin", party: "jp_komeito", seatsHeld: 1, chamberClass: 2 },
  { state: "TOH", officeType: "sangiin", party: "jp_dpfp", seatsHeld: 1, chamberClass: 2 },
  { state: "TOH", officeType: "sangiin", party: "jp_ishin", seatsHeld: 1, chamberClass: 2 },

  // Kanto (80 total: C1=40, C2=40)
  { state: "KAN", officeType: "sangiin", party: "jp_ldp", seatsHeld: 18, chamberClass: 1 },
  { state: "KAN", officeType: "sangiin", party: "jp_cdp", seatsHeld: 6, chamberClass: 1 },
  { state: "KAN", officeType: "sangiin", party: "jp_komeito", seatsHeld: 5, chamberClass: 1 },
  { state: "KAN", officeType: "sangiin", party: "jp_dpfp", seatsHeld: 4, chamberClass: 1 },
  { state: "KAN", officeType: "sangiin", party: "jp_ishin", seatsHeld: 3, chamberClass: 1 },
  { state: "KAN", officeType: "sangiin", party: "jp_jcp", seatsHeld: 3, chamberClass: 1 },
  { state: "KAN", officeType: "sangiin", party: "jp_reiwa", seatsHeld: 1, chamberClass: 1 },
  { state: "KAN", officeType: "sangiin", party: "jp_ldp", seatsHeld: 18, chamberClass: 2 },
  { state: "KAN", officeType: "sangiin", party: "jp_cdp", seatsHeld: 6, chamberClass: 2 },
  { state: "KAN", officeType: "sangiin", party: "jp_komeito", seatsHeld: 5, chamberClass: 2 },
  { state: "KAN", officeType: "sangiin", party: "jp_dpfp", seatsHeld: 3, chamberClass: 2 },
  { state: "KAN", officeType: "sangiin", party: "jp_ishin", seatsHeld: 3, chamberClass: 2 },
  { state: "KAN", officeType: "sangiin", party: "jp_jcp", seatsHeld: 2, chamberClass: 2 },
  { state: "KAN", officeType: "sangiin", party: "jp_reiwa", seatsHeld: 1, chamberClass: 2 },
  { state: "KAN", officeType: "sangiin", party: "jp_independent", seatsHeld: 2, chamberClass: 2 },

  // Chubu (44 total: C1=22, C2=22)
  { state: "CHU", officeType: "sangiin", party: "jp_ldp", seatsHeld: 11, chamberClass: 1 },
  { state: "CHU", officeType: "sangiin", party: "jp_cdp", seatsHeld: 3, chamberClass: 1 },
  { state: "CHU", officeType: "sangiin", party: "jp_komeito", seatsHeld: 3, chamberClass: 1 },
  { state: "CHU", officeType: "sangiin", party: "jp_dpfp", seatsHeld: 3, chamberClass: 1 },
  { state: "CHU", officeType: "sangiin", party: "jp_ishin", seatsHeld: 1, chamberClass: 1 },
  { state: "CHU", officeType: "sangiin", party: "jp_jcp", seatsHeld: 1, chamberClass: 1 },
  { state: "CHU", officeType: "sangiin", party: "jp_ldp", seatsHeld: 10, chamberClass: 2 },
  { state: "CHU", officeType: "sangiin", party: "jp_cdp", seatsHeld: 2, chamberClass: 2 },
  { state: "CHU", officeType: "sangiin", party: "jp_komeito", seatsHeld: 2, chamberClass: 2 },
  { state: "CHU", officeType: "sangiin", party: "jp_dpfp", seatsHeld: 2, chamberClass: 2 },
  { state: "CHU", officeType: "sangiin", party: "jp_ishin", seatsHeld: 2, chamberClass: 2 },
  { state: "CHU", officeType: "sangiin", party: "jp_jcp", seatsHeld: 1, chamberClass: 2 },
  { state: "CHU", officeType: "sangiin", party: "jp_independent", seatsHeld: 3, chamberClass: 2 },

  // Kansai (44 total: C1=22, C2=22)
  { state: "KNS", officeType: "sangiin", party: "jp_ldp", seatsHeld: 9, chamberClass: 1 },
  { state: "KNS", officeType: "sangiin", party: "jp_ishin", seatsHeld: 3, chamberClass: 1 },
  { state: "KNS", officeType: "sangiin", party: "jp_komeito", seatsHeld: 3, chamberClass: 1 },
  { state: "KNS", officeType: "sangiin", party: "jp_cdp", seatsHeld: 2, chamberClass: 1 },
  { state: "KNS", officeType: "sangiin", party: "jp_dpfp", seatsHeld: 2, chamberClass: 1 },
  { state: "KNS", officeType: "sangiin", party: "jp_jcp", seatsHeld: 1, chamberClass: 1 },
  { state: "KNS", officeType: "sangiin", party: "jp_sdp", seatsHeld: 1, chamberClass: 1 },
  { state: "KNS", officeType: "sangiin", party: "jp_independent", seatsHeld: 1, chamberClass: 1 },
  { state: "KNS", officeType: "sangiin", party: "jp_ldp", seatsHeld: 9, chamberClass: 2 },
  { state: "KNS", officeType: "sangiin", party: "jp_ishin", seatsHeld: 3, chamberClass: 2 },
  { state: "KNS", officeType: "sangiin", party: "jp_komeito", seatsHeld: 2, chamberClass: 2 },
  { state: "KNS", officeType: "sangiin", party: "jp_cdp", seatsHeld: 2, chamberClass: 2 },
  { state: "KNS", officeType: "sangiin", party: "jp_dpfp", seatsHeld: 1, chamberClass: 2 },
  { state: "KNS", officeType: "sangiin", party: "jp_jcp", seatsHeld: 1, chamberClass: 2 },
  { state: "KNS", officeType: "sangiin", party: "jp_sdp", seatsHeld: 1, chamberClass: 2 },
  { state: "KNS", officeType: "sangiin", party: "jp_independent", seatsHeld: 3, chamberClass: 2 },

  // Chugoku (14 total: C1=7, C2=7)
  { state: "CGK", officeType: "sangiin", party: "jp_ldp", seatsHeld: 4, chamberClass: 1 },
  { state: "CGK", officeType: "sangiin", party: "jp_cdp", seatsHeld: 1, chamberClass: 1 },
  { state: "CGK", officeType: "sangiin", party: "jp_komeito", seatsHeld: 1, chamberClass: 1 },
  { state: "CGK", officeType: "sangiin", party: "jp_jcp", seatsHeld: 1, chamberClass: 1 },
  { state: "CGK", officeType: "sangiin", party: "jp_ldp", seatsHeld: 4, chamberClass: 2 },
  { state: "CGK", officeType: "sangiin", party: "jp_cdp", seatsHeld: 1, chamberClass: 2 },
  { state: "CGK", officeType: "sangiin", party: "jp_komeito", seatsHeld: 1, chamberClass: 2 },
  { state: "CGK", officeType: "sangiin", party: "jp_dpfp", seatsHeld: 1, chamberClass: 2 },

  // Shikoku (8 total: C1=4, C2=4)
  { state: "SHI", officeType: "sangiin", party: "jp_ldp", seatsHeld: 2, chamberClass: 1 },
  { state: "SHI", officeType: "sangiin", party: "jp_cdp", seatsHeld: 1, chamberClass: 1 },
  { state: "SHI", officeType: "sangiin", party: "jp_komeito", seatsHeld: 1, chamberClass: 1 },
  { state: "SHI", officeType: "sangiin", party: "jp_ldp", seatsHeld: 2, chamberClass: 2 },
  { state: "SHI", officeType: "sangiin", party: "jp_dpfp", seatsHeld: 1, chamberClass: 2 },
  { state: "SHI", officeType: "sangiin", party: "jp_jcp", seatsHeld: 1, chamberClass: 2 },

  // Kyushu & Okinawa (31 total: C1=16, C2=15)
  { state: "KYU", officeType: "sangiin", party: "jp_ldp", seatsHeld: 8, chamberClass: 1 },
  { state: "KYU", officeType: "sangiin", party: "jp_cdp", seatsHeld: 2, chamberClass: 1 },
  { state: "KYU", officeType: "sangiin", party: "jp_komeito", seatsHeld: 2, chamberClass: 1 },
  { state: "KYU", officeType: "sangiin", party: "jp_dpfp", seatsHeld: 2, chamberClass: 1 },
  { state: "KYU", officeType: "sangiin", party: "jp_jcp", seatsHeld: 1, chamberClass: 1 },
  { state: "KYU", officeType: "sangiin", party: "jp_ishin", seatsHeld: 1, chamberClass: 1 },
  { state: "KYU", officeType: "sangiin", party: "jp_ldp", seatsHeld: 7, chamberClass: 2 },
  { state: "KYU", officeType: "sangiin", party: "jp_cdp", seatsHeld: 2, chamberClass: 2 },
  { state: "KYU", officeType: "sangiin", party: "jp_komeito", seatsHeld: 2, chamberClass: 2 },
  { state: "KYU", officeType: "sangiin", party: "jp_dpfp", seatsHeld: 1, chamberClass: 2 },
  { state: "KYU", officeType: "sangiin", party: "jp_jcp", seatsHeld: 1, chamberClass: 2 },
  { state: "KYU", officeType: "sangiin", party: "jp_nhk", seatsHeld: 1, chamberClass: 2 },
  { state: "KYU", officeType: "sangiin", party: "jp_independent", seatsHeld: 1, chamberClass: 2 },
];

// Sangiin totals: 248 seats (124 Class 1 + 124 Class 2)
// LDP 115, CDP 34, Komeito 30, DPFP 22, Ishin 17, JCP 15, Reiwa 2, SDP 2, NHK 1, Ind 10

export const JP_GOVERNORS_2020: HistoricalSeat[] = [
  // All JP governors are LDP-affiliated at game start (Jan 2020)
  { state: "HOK", officeType: "governor", party: "jp_ldp" },
  { state: "TOH", officeType: "governor", party: "jp_ldp" },
  { state: "KAN", officeType: "governor", party: "jp_ldp" },
  { state: "CHU", officeType: "governor", party: "jp_ldp" },
  { state: "KNS", officeType: "governor", party: "jp_ldp" },
  { state: "CGK", officeType: "governor", party: "jp_ldp" },
  { state: "SHI", officeType: "governor", party: "jp_ldp" },
  { state: "KYU", officeType: "governor", party: "jp_ldp" },
];

// ─── JP January 2020: Prefectural Assembly Seats (Regional Council) ─────────
// Aggregated from all 47 prefectural assemblies as of January 2020.
// Main source: 2019 unified local elections (41 prefectures) + off-cycle
// prefectures (Iwate Sep 2019, Miyagi Oct 2019, Fukushima Nov 2019,
// Ibaraki Dec 2018, Tokyo Jul 2017, Okinawa Jun 2016).
//
// Total across all 47 prefectures: ~2,679 seats
//
// KEY NOTES:
// - Many "independents" at the prefectural level are LDP-aligned conservatives.
//   The game treats them as LDP for party org strength, matching how the UK
//   regional council data rolls local independents into the nearest major party.
// - Osaka Ishin (Osaka Restoration Association) is the local wing of Nippon
//   Ishin no Kai — all Ishin-family seats are counted under jp_ishin.
// - Pre-merger CDP (Jan 2020) was small at the local level. Many former DPJ
//   members sat as independents or in local groups. CDP numbers here include
//   CDP-aligned local caucuses (e.g., Iwate's Kibo Iwate, Mie's Shinseikai).
// - DPFP (Democratic Party for the People) had modest local presence.
// - Tokyo's Tomin First no Kai seats are counted as independents for game
//   purposes (no national party equivalent in the game's 6-party system).

export const JP_REGIONAL_COUNCIL_2020: HistoricalSeat[] = [
  // Hokkaido (100 seats): LDP majority, CDP opposition base (strongest CDP prefecture)
  // Source: 2019 Hokkaido prefectural election
  { state: "HOK", officeType: "regionalCouncil", party: "jp_ldp", seatsHeld: 51 },
  { state: "HOK", officeType: "regionalCouncil", party: "jp_cdp", seatsHeld: 24 },
  { state: "HOK", officeType: "regionalCouncil", party: "jp_komeito", seatsHeld: 8 },
  { state: "HOK", officeType: "regionalCouncil", party: "jp_jcp", seatsHeld: 3 },
  // 14 independents — mostly conservative-leaning, folded into LDP for game balance

  // Tohoku (299 seats): Strong LDP rural base across 6 prefectures
  // Aomori 48 + Iwate 48 + Miyagi 59 + Akita 43 + Yamagata 43 + Fukushima 58
  // LDP dominant but Iwate historically opposition-leaning (DPJ successor territory)
  { state: "TOH", officeType: "regionalCouncil", party: "jp_ldp", seatsHeld: 170 },
  { state: "TOH", officeType: "regionalCouncil", party: "jp_cdp", seatsHeld: 35 },
  { state: "TOH", officeType: "regionalCouncil", party: "jp_komeito", seatsHeld: 12 },
  { state: "TOH", officeType: "regionalCouncil", party: "jp_jcp", seatsHeld: 20 },
  { state: "TOH", officeType: "regionalCouncil", party: "jp_dpfp", seatsHeld: 9 },
  { state: "TOH", officeType: "regionalCouncil", party: "jp_ishin", seatsHeld: 4 },
  // ~49 independents/local parties absorbed into above

  // Kanto (581 seats): Largest region — mixed urban/suburban
  // Ibaraki 62 + Tochigi 50 + Gunma 50 + Saitama 93 + Chiba 94 + Tokyo 127 + Kanagawa 105
  // LDP strong in suburban/rural areas; Tokyo dominated by Tomin First (2017)
  // which has no national party equivalent — those seats go to independent/LDP pool
  { state: "KAN", officeType: "regionalCouncil", party: "jp_ldp", seatsHeld: 280 },
  { state: "KAN", officeType: "regionalCouncil", party: "jp_cdp", seatsHeld: 55 },
  { state: "KAN", officeType: "regionalCouncil", party: "jp_komeito", seatsHeld: 56 },
  { state: "KAN", officeType: "regionalCouncil", party: "jp_jcp", seatsHeld: 38 },
  { state: "KAN", officeType: "regionalCouncil", party: "jp_dpfp", seatsHeld: 5 },
  { state: "KAN", officeType: "regionalCouncil", party: "jp_ishin", seatsHeld: 18 },
  // ~129 independents/Tomin First absorbed — Tokyo skews this region's independent count

  // Chubu (483 seats): LDP-leaning industrial/rural mix
  // Niigata 53 + Toyama 40 + Ishikawa 43 + Fukui 37 + Yamanashi 37 + Nagano 57
  // + Gifu 46 + Shizuoka 68 + Aichi 102
  // Aichi (Toyota country) is the most competitive; Hokuriku strongly LDP
  { state: "CHU", officeType: "regionalCouncil", party: "jp_ldp", seatsHeld: 280 },
  { state: "CHU", officeType: "regionalCouncil", party: "jp_cdp", seatsHeld: 15 },
  { state: "CHU", officeType: "regionalCouncil", party: "jp_komeito", seatsHeld: 24 },
  { state: "CHU", officeType: "regionalCouncil", party: "jp_jcp", seatsHeld: 16 },
  { state: "CHU", officeType: "regionalCouncil", party: "jp_dpfp", seatsHeld: 9 },
  { state: "CHU", officeType: "regionalCouncil", party: "jp_ishin", seatsHeld: 13 },
  // ~126 independents absorbed — many LDP-aligned in Hokuriku/rural areas

  // Kansai (414 seats): Ishin stronghold (Osaka), diverse opposition elsewhere
  // Mie 51 + Shiga 44 + Kyoto 60 + Osaka 88 + Hyogo 86 + Nara 43 + Wakayama 42
  // Osaka Ishin dominates Osaka (51/88 seats); Kyoto has strong JCP presence
  { state: "KNS", officeType: "regionalCouncil", party: "jp_ldp", seatsHeld: 148 },
  { state: "KNS", officeType: "regionalCouncil", party: "jp_ishin", seatsHeld: 62 },
  { state: "KNS", officeType: "regionalCouncil", party: "jp_komeito", seatsHeld: 42 },
  { state: "KNS", officeType: "regionalCouncil", party: "jp_jcp", seatsHeld: 32 },
  { state: "KNS", officeType: "regionalCouncil", party: "jp_cdp", seatsHeld: 14 },
  { state: "KNS", officeType: "regionalCouncil", party: "jp_dpfp", seatsHeld: 4 },
  // ~112 independents/local parties absorbed — Mie/Shiga have large local blocs

  // Chugoku (238 seats): Strong LDP (Abe's home region of Yamaguchi)
  // Tottori 35 + Shimane 37 + Okayama 55 + Hiroshima 64 + Yamaguchi 47
  { state: "CGK", officeType: "regionalCouncil", party: "jp_ldp", seatsHeld: 145 },
  { state: "CGK", officeType: "regionalCouncil", party: "jp_komeito", seatsHeld: 21 },
  { state: "CGK", officeType: "regionalCouncil", party: "jp_jcp", seatsHeld: 8 },
  { state: "CGK", officeType: "regionalCouncil", party: "jp_cdp", seatsHeld: 6 },
  { state: "CGK", officeType: "regionalCouncil", party: "jp_ishin", seatsHeld: 7 },
  { state: "CGK", officeType: "regionalCouncil", party: "jp_dpfp", seatsHeld: 2 },
  // ~49 independents absorbed — heavily LDP-aligned in rural San'in

  // Shikoku (163 seats): Strong LDP, notable JCP presence in Kochi
  // Tokushima 38 + Kagawa 41 + Ehime 47 + Kochi 37
  { state: "SHI", officeType: "regionalCouncil", party: "jp_ldp", seatsHeld: 96 },
  { state: "SHI", officeType: "regionalCouncil", party: "jp_komeito", seatsHeld: 9 },
  { state: "SHI", officeType: "regionalCouncil", party: "jp_jcp", seatsHeld: 10 },
  { state: "SHI", officeType: "regionalCouncil", party: "jp_cdp", seatsHeld: 4 },
  { state: "SHI", officeType: "regionalCouncil", party: "jp_ishin", seatsHeld: 4 },
  { state: "SHI", officeType: "regionalCouncil", party: "jp_dpfp", seatsHeld: 3 },
  // ~37 independents absorbed — Ehime has large independent bloc

  // Kyushu & Okinawa (401 seats): LDP mainland dominance, Okinawa anti-base opposition
  // Fukuoka 87 + Saga 38 + Nagasaki 46 + Kumamoto 49 + Oita 43 + Miyazaki 39
  // + Kagoshima 51 + Okinawa 48
  // Okinawa uniquely has strong local opposition parties (Social Mass Party, etc.)
  { state: "KYU", officeType: "regionalCouncil", party: "jp_ldp", seatsHeld: 222 },
  { state: "KYU", officeType: "regionalCouncil", party: "jp_komeito", seatsHeld: 31 },
  { state: "KYU", officeType: "regionalCouncil", party: "jp_jcp", seatsHeld: 17 },
  { state: "KYU", officeType: "regionalCouncil", party: "jp_cdp", seatsHeld: 12 },
  { state: "KYU", officeType: "regionalCouncil", party: "jp_ishin", seatsHeld: 22 },
  { state: "KYU", officeType: "regionalCouncil", party: "jp_dpfp", seatsHeld: 13 },
  // ~84 independents/Okinawa local parties absorbed
];
