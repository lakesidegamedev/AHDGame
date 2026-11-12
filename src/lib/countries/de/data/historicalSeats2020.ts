import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// Bundestag totals: SPD 56, CDU 42, CSU 12, Greens 32, FDP 25, AfD 23, Linke 11 = 201

// Ministerpräsidenten as of February 2020 (before the 2021 NRW+SH+MV shuffles).
// 7 SPD, 6 CDU, 1 CSU, 1 Greens, 1 Linke.
export const DE_MINISTERPRAESIDENTEN_2020: HistoricalSeat[] = [
  { state: "BW", officeType: "ministerPresident", party: "de_greens" }, // Kretschmann
  { state: "BY", officeType: "ministerPresident", party: "de_csu" }, // Söder
  { state: "BE", officeType: "ministerPresident", party: "de_spd" }, // Müller
  { state: "BB", officeType: "ministerPresident", party: "de_spd" }, // Woidke
  { state: "BRE", officeType: "ministerPresident", party: "de_spd" }, // Bovenschulte
  { state: "HH", officeType: "ministerPresident", party: "de_spd" }, // Tschentscher
  { state: "HE", officeType: "ministerPresident", party: "de_cdu" }, // Bouffier
  { state: "MV", officeType: "ministerPresident", party: "de_spd" }, // Schwesig
  { state: "NI", officeType: "ministerPresident", party: "de_spd" }, // Weil
  { state: "NW", officeType: "ministerPresident", party: "de_cdu" }, // Laschet
  { state: "RP", officeType: "ministerPresident", party: "de_spd" }, // Dreyer
  { state: "SL", officeType: "ministerPresident", party: "de_cdu" }, // Hans
  { state: "SN", officeType: "ministerPresident", party: "de_cdu" }, // Kretschmer
  { state: "ST", officeType: "ministerPresident", party: "de_cdu" }, // Haseloff
  { state: "SH", officeType: "ministerPresident", party: "de_cdu" }, // Günther
  { state: "TH", officeType: "ministerPresident", party: "de_linke" }, // Ramelow
];

// ─── DE 1990: Landtag Compositions ──────────────────────────────────────────
// Party splits reflect Landtag control entering 1991. Western Länder use
// their most recent pre-1991 election (1986 Bayern, 1988 BW, 1988 SH, 1990
// NRW, 1990 NI, 1990 SL, etc.); East German Länder use the October 1990
// post-reunification founding elections; Berlin uses the December 1990
// reunified Abgeordnetenhaus election; HE/HH/HB use early-1991 results
// (these elections fell within Q1 1991, before the game's 1991-default
// reset point).
//
// Totals match each Land's configured `stateSenateSeats` in
// `src/lib/seeds/de/deRegions.ts` (which DE uses as the Landtag seat count
// — there's no separate sub-national upper chamber). Where the chamber
// size changed since 1990 (most reform happened 1995-2010), 1990 partisan
// ratios are preserved while absolute counts are scaled to the modern
// configured size.
//
// Notable party slugs:
//   - de_pds: 1991-only default, present only in East German Länder + Berlin.
//   - Republikaner: surged in 1988 BW but stayed below threshold and won 0
//     seats; not represented here.
//   - SSW (Schleswig-Holstein) and STATT (Hamburg) are not seeded as
//     default DE parties — their seats fold into `de_independent` for
//     game purposes, matching how UK_REGIONAL_COUNCIL_1992 handles uk_sdlp.
//
// Each entry = ONE NPP holding all that party's seats in that Land.

// ─── DE 2020: Landtag Compositions ──────────────────────────────────────────
// Most recent Landtag election per Land as of February 2020. By Land:
//   BW 2016, BY 2018, NW 2017, HE 2018, RP 2016, SL 2017, NI 2017,
//   SH 2017, HH 2015, HB 2019, BE 2016, BB 2019, MV 2016, SN 2019,
//   ST 2016, TH 2019.
//
// Notable shifts vs DE_LANDTAG_1990: AfD enters every Land (post-2013
// founding), Linke retains former-GDR base, FDP returns to most
// chambers after the 2013 wipeout. Local lists (FW Bayern, SSW
// Schleswig-Holstein, BVB/FW Brandenburg) fold into `de_independent`
// matching the 1990 dataset's convention.
//
// Totals match each Land's configured `stateSenateSeats` in
// `src/lib/seeds/de/deRegions.ts`; where chamber sizes changed between
// the election year and current config (e.g. HH 121→123, NI 137→146,
// HB 84→87), the 2019/2020-era partisan ratios are preserved while
// absolute counts scale to current size.

export const DE_LANDTAG_2020: HistoricalSeat[] = [
  // Baden-Württemberg (154 seats): 2016 election. Grüne plurality under
  // Kretschmann; first AfD entry into a western Landtag.
  { state: "BW", officeType: "landtag", party: "de_greens", seatsHeld: 47 },
  { state: "BW", officeType: "landtag", party: "de_cdu", seatsHeld: 42 },
  { state: "BW", officeType: "landtag", party: "de_afd", seatsHeld: 23 },
  { state: "BW", officeType: "landtag", party: "de_spd", seatsHeld: 19 },
  { state: "BW", officeType: "landtag", party: "de_fdp", seatsHeld: 12 },
  { state: "BW", officeType: "landtag", party: "de_independent", seatsHeld: 11 },

  // Bayern (203 seats): 2018 election. CSU loses absolute majority for
  // first time since 1966; CSU-FW coalition under Söder. Freie Wähler
  // and minor lists fold into de_independent.
  { state: "BY", officeType: "landtag", party: "de_csu", seatsHeld: 84 },
  { state: "BY", officeType: "landtag", party: "de_greens", seatsHeld: 38 },
  { state: "BY", officeType: "landtag", party: "de_afd", seatsHeld: 22 },
  { state: "BY", officeType: "landtag", party: "de_spd", seatsHeld: 22 },
  { state: "BY", officeType: "landtag", party: "de_fdp", seatsHeld: 10 },
  { state: "BY", officeType: "landtag", party: "de_independent", seatsHeld: 27 },

  // Nordrhein-Westfalen (195 seats): 2017 election. CDU-FDP coalition
  // under Laschet ends the long SPD streak.
  { state: "NW", officeType: "landtag", party: "de_cdu", seatsHeld: 70 },
  { state: "NW", officeType: "landtag", party: "de_spd", seatsHeld: 67 },
  { state: "NW", officeType: "landtag", party: "de_fdp", seatsHeld: 27 },
  { state: "NW", officeType: "landtag", party: "de_afd", seatsHeld: 16 },
  { state: "NW", officeType: "landtag", party: "de_greens", seatsHeld: 14 },
  { state: "NW", officeType: "landtag", party: "de_independent", seatsHeld: 1 },

  // Hessen (137 seats): 2018 election. CDU-Grüne coalition under Bouffier
  // continues. Grüne tied with SPD for second place — rising green wave.
  { state: "HE", officeType: "landtag", party: "de_cdu", seatsHeld: 40 },
  { state: "HE", officeType: "landtag", party: "de_greens", seatsHeld: 29 },
  { state: "HE", officeType: "landtag", party: "de_spd", seatsHeld: 29 },
  { state: "HE", officeType: "landtag", party: "de_afd", seatsHeld: 19 },
  { state: "HE", officeType: "landtag", party: "de_fdp", seatsHeld: 11 },
  { state: "HE", officeType: "landtag", party: "de_linke", seatsHeld: 9 },

  // Rheinland-Pfalz (101 seats): 2016 election. SPD-FDP-Grüne "traffic
  // light" coalition under Dreyer.
  { state: "RP", officeType: "landtag", party: "de_spd", seatsHeld: 39 },
  { state: "RP", officeType: "landtag", party: "de_cdu", seatsHeld: 35 },
  { state: "RP", officeType: "landtag", party: "de_afd", seatsHeld: 14 },
  { state: "RP", officeType: "landtag", party: "de_fdp", seatsHeld: 7 },
  { state: "RP", officeType: "landtag", party: "de_greens", seatsHeld: 6 },

  // Saarland (51 seats): 2017 election. CDU-SPD grand coalition under
  // Annegret Kramp-Karrenbauer (later Hans).
  { state: "SL", officeType: "landtag", party: "de_cdu", seatsHeld: 24 },
  { state: "SL", officeType: "landtag", party: "de_spd", seatsHeld: 17 },
  { state: "SL", officeType: "landtag", party: "de_linke", seatsHeld: 7 },
  { state: "SL", officeType: "landtag", party: "de_afd", seatsHeld: 3 },

  // Niedersachsen (146 seats): 2017 election. SPD-CDU grand coalition
  // under Weil after SPD lost outright majority.
  { state: "NI", officeType: "landtag", party: "de_spd", seatsHeld: 58 },
  { state: "NI", officeType: "landtag", party: "de_cdu", seatsHeld: 53 },
  { state: "NI", officeType: "landtag", party: "de_greens", seatsHeld: 13 },
  { state: "NI", officeType: "landtag", party: "de_fdp", seatsHeld: 12 },
  { state: "NI", officeType: "landtag", party: "de_afd", seatsHeld: 10 },

  // Schleswig-Holstein (73 seats): 2017 election. CDU-Grüne-FDP
  // "Jamaica" coalition under Günther. SSW (Danish minority) holds 3
  // seats — folds into de_independent.
  { state: "SH", officeType: "landtag", party: "de_cdu", seatsHeld: 25 },
  { state: "SH", officeType: "landtag", party: "de_spd", seatsHeld: 21 },
  { state: "SH", officeType: "landtag", party: "de_greens", seatsHeld: 10 },
  { state: "SH", officeType: "landtag", party: "de_fdp", seatsHeld: 9 },
  { state: "SH", officeType: "landtag", party: "de_afd", seatsHeld: 5 },
  { state: "SH", officeType: "landtag", party: "de_independent", seatsHeld: 3 },

  // Hamburg (123 seats): 2015 election (the 2020 election was just after
  // our reset point in late February). SPD-Grüne coalition under Scholz.
  { state: "HH", officeType: "landtag", party: "de_spd", seatsHeld: 59 },
  { state: "HH", officeType: "landtag", party: "de_cdu", seatsHeld: 20 },
  { state: "HH", officeType: "landtag", party: "de_greens", seatsHeld: 15 },
  { state: "HH", officeType: "landtag", party: "de_linke", seatsHeld: 11 },
  { state: "HH", officeType: "landtag", party: "de_afd", seatsHeld: 9 },
  { state: "HH", officeType: "landtag", party: "de_fdp", seatsHeld: 9 },

  // Bremen (87 seats): May 2019 election. SPD-Grüne-Linke "red-red-green"
  // coalition — first such at the Land level — under Bovenschulte (later).
  { state: "BRE", officeType: "landtag", party: "de_greens", seatsHeld: 24 },
  { state: "BRE", officeType: "landtag", party: "de_spd", seatsHeld: 23 },
  { state: "BRE", officeType: "landtag", party: "de_cdu", seatsHeld: 23 },
  { state: "BRE", officeType: "landtag", party: "de_linke", seatsHeld: 10 },
  { state: "BRE", officeType: "landtag", party: "de_fdp", seatsHeld: 5 },
  { state: "BRE", officeType: "landtag", party: "de_afd", seatsHeld: 1 },
  { state: "BRE", officeType: "landtag", party: "de_independent", seatsHeld: 1 },

  // Berlin (159 seats): 2016 election. SPD-Linke-Grüne "red-red-green"
  // coalition under Müller (later Giffey).
  { state: "BE", officeType: "landtag", party: "de_spd", seatsHeld: 38 },
  { state: "BE", officeType: "landtag", party: "de_cdu", seatsHeld: 31 },
  { state: "BE", officeType: "landtag", party: "de_linke", seatsHeld: 27 },
  { state: "BE", officeType: "landtag", party: "de_greens", seatsHeld: 27 },
  { state: "BE", officeType: "landtag", party: "de_afd", seatsHeld: 24 },
  { state: "BE", officeType: "landtag", party: "de_fdp", seatsHeld: 12 },

  // Brandenburg (88 seats): September 2019 election. SPD-CDU-Grüne "Kenya"
  // coalition under Woidke after SPD lost to AfD by 1pt.
  { state: "BB", officeType: "landtag", party: "de_spd", seatsHeld: 25 },
  { state: "BB", officeType: "landtag", party: "de_afd", seatsHeld: 23 },
  { state: "BB", officeType: "landtag", party: "de_cdu", seatsHeld: 15 },
  { state: "BB", officeType: "landtag", party: "de_linke", seatsHeld: 10 },
  { state: "BB", officeType: "landtag", party: "de_greens", seatsHeld: 10 },
  { state: "BB", officeType: "landtag", party: "de_independent", seatsHeld: 5 },

  // Mecklenburg-Vorpommern (79 seats): 2016 election. SPD-CDU coalition
  // under Schwesig. Grüne fell below 5% threshold and won 0 seats.
  { state: "MV", officeType: "landtag", party: "de_spd", seatsHeld: 26 },
  { state: "MV", officeType: "landtag", party: "de_afd", seatsHeld: 18 },
  { state: "MV", officeType: "landtag", party: "de_cdu", seatsHeld: 18 },
  { state: "MV", officeType: "landtag", party: "de_linke", seatsHeld: 11 },
  { state: "MV", officeType: "landtag", party: "de_independent", seatsHeld: 6 },

  // Sachsen (120 seats): September 2019 election. CDU-Grüne-SPD "Kenya"
  // coalition under Kretschmer after AfD's near-second-place finish.
  { state: "SN", officeType: "landtag", party: "de_cdu", seatsHeld: 45 },
  { state: "SN", officeType: "landtag", party: "de_afd", seatsHeld: 38 },
  { state: "SN", officeType: "landtag", party: "de_linke", seatsHeld: 14 },
  { state: "SN", officeType: "landtag", party: "de_greens", seatsHeld: 12 },
  { state: "SN", officeType: "landtag", party: "de_spd", seatsHeld: 10 },
  { state: "SN", officeType: "landtag", party: "de_independent", seatsHeld: 1 },

  // Sachsen-Anhalt (97 seats): 2016 election. CDU-SPD-Grüne "Kenya"
  // coalition under Haseloff — first such, prefiguring Sachsen 2019.
  { state: "ST", officeType: "landtag", party: "de_cdu", seatsHeld: 30 },
  { state: "ST", officeType: "landtag", party: "de_afd", seatsHeld: 25 },
  { state: "ST", officeType: "landtag", party: "de_linke", seatsHeld: 16 },
  { state: "ST", officeType: "landtag", party: "de_spd", seatsHeld: 11 },
  { state: "ST", officeType: "landtag", party: "de_greens", seatsHeld: 5 },
  { state: "ST", officeType: "landtag", party: "de_independent", seatsHeld: 10 },

  // Thüringen (88 seats): October 2019 election. Linke plurality under
  // Ramelow — only Land where Linke leads the government.
  { state: "TH", officeType: "landtag", party: "de_linke", seatsHeld: 28 },
  { state: "TH", officeType: "landtag", party: "de_afd", seatsHeld: 22 },
  { state: "TH", officeType: "landtag", party: "de_cdu", seatsHeld: 21 },
  { state: "TH", officeType: "landtag", party: "de_spd", seatsHeld: 8 },
  { state: "TH", officeType: "landtag", party: "de_greens", seatsHeld: 5 },
  { state: "TH", officeType: "landtag", party: "de_fdp", seatsHeld: 4 },
];
