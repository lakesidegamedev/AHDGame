import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// Regional council totals: LDP 1392, Komeito 203, JCP 144, CDP 165, Ishin 130, DPFP 45 = 2079
// (remaining ~600 seats are independents/local parties folded into above allocations)

// ─── JP April 1991: Prefectural Assembly Compositions ───────────────────────
// The April 1991 unified local elections — the first big test for the LDP
// after the Recruit scandal — landed during the wave of "anti-political"
// independent candidacies. Result: LDP still dominant but with a large
// conservative-independent bloc, JSP holding its post-1989 peak, smaller
// Komeito/JCP/DSP presences.
//
// Composed from prefectural assembly compositions post-April 1991, with
// 1991-era parties only (jp_ldp, jp_jsp, jp_komeito, jp_jcp, jp_dsp,
// jp_independent). CDP / DPFP / Ishin are 2019-era parties and do not
// appear here. JSP is a 1991-only default party (`validForPresets` in
// `jpParties.ts`); DSP likewise.
//
// Unlike `JP_REGIONAL_COUNCIL_2020` (which under-counts and rolls
// independents into commentary), totals here match each region's
// configured `stateSenateSeats` in `src/lib/countries/jp/data/jpRegions.ts` so the
// chamber size and seat allocation line up — matching the US/UK pattern
// used in this file.
//
// Each entry = ONE NPP holding all that party's seats in that region.

export const JP_REGIONAL_COUNCIL_1991: HistoricalSeat[] = [
  // Hokkaido (100 seats): LDP rural + JSP industrial / labor-union base.
  { state: "HOK", officeType: "regionalCouncil", party: "jp_ldp", seatsHeld: 50 },
  { state: "HOK", officeType: "regionalCouncil", party: "jp_jsp", seatsHeld: 20 },
  { state: "HOK", officeType: "regionalCouncil", party: "jp_komeito", seatsHeld: 6 },
  { state: "HOK", officeType: "regionalCouncil", party: "jp_jcp", seatsHeld: 4 },
  { state: "HOK", officeType: "regionalCouncil", party: "jp_dsp", seatsHeld: 2 },
  { state: "HOK", officeType: "regionalCouncil", party: "jp_independent", seatsHeld: 18 },

  // Tohoku (299 seats): Strong LDP rural plurality; JSP holds industrial
  // Niigata / Miyagi / Iwate. Big conservative-independent bloc.
  { state: "TOH", officeType: "regionalCouncil", party: "jp_ldp", seatsHeld: 175 },
  { state: "TOH", officeType: "regionalCouncil", party: "jp_jsp", seatsHeld: 55 },
  { state: "TOH", officeType: "regionalCouncil", party: "jp_komeito", seatsHeld: 12 },
  { state: "TOH", officeType: "regionalCouncil", party: "jp_jcp", seatsHeld: 8 },
  { state: "TOH", officeType: "regionalCouncil", party: "jp_dsp", seatsHeld: 4 },
  { state: "TOH", officeType: "regionalCouncil", party: "jp_independent", seatsHeld: 45 },

  // Kanto (581 seats): Largest region — Tokyo / Kanagawa / Saitama / Chiba +
  // surrounding prefectures. Most diverse opposition presence, urban
  // Komeito + JCP strength.
  { state: "KAN", officeType: "regionalCouncil", party: "jp_ldp", seatsHeld: 240 },
  { state: "KAN", officeType: "regionalCouncil", party: "jp_jsp", seatsHeld: 90 },
  { state: "KAN", officeType: "regionalCouncil", party: "jp_komeito", seatsHeld: 60 },
  { state: "KAN", officeType: "regionalCouncil", party: "jp_jcp", seatsHeld: 35 },
  { state: "KAN", officeType: "regionalCouncil", party: "jp_dsp", seatsHeld: 16 },
  { state: "KAN", officeType: "regionalCouncil", party: "jp_independent", seatsHeld: 140 },

  // Chubu (483 seats): LDP-leaning industrial (Aichi) + rural (Hokuriku).
  { state: "CHU", officeType: "regionalCouncil", party: "jp_ldp", seatsHeld: 245 },
  { state: "CHU", officeType: "regionalCouncil", party: "jp_jsp", seatsHeld: 65 },
  { state: "CHU", officeType: "regionalCouncil", party: "jp_komeito", seatsHeld: 28 },
  { state: "CHU", officeType: "regionalCouncil", party: "jp_jcp", seatsHeld: 12 },
  { state: "CHU", officeType: "regionalCouncil", party: "jp_dsp", seatsHeld: 8 },
  { state: "CHU", officeType: "regionalCouncil", party: "jp_independent", seatsHeld: 125 },

  // Kansai (414 seats): Osaka / Kyoto / Hyogo. Stronger DSP + Komeito base
  // in Osaka labor districts; Kyoto's notable JCP presence.
  { state: "KNS", officeType: "regionalCouncil", party: "jp_ldp", seatsHeld: 165 },
  { state: "KNS", officeType: "regionalCouncil", party: "jp_jsp", seatsHeld: 50 },
  { state: "KNS", officeType: "regionalCouncil", party: "jp_komeito", seatsHeld: 50 },
  { state: "KNS", officeType: "regionalCouncil", party: "jp_jcp", seatsHeld: 30 },
  { state: "KNS", officeType: "regionalCouncil", party: "jp_dsp", seatsHeld: 22 },
  { state: "KNS", officeType: "regionalCouncil", party: "jp_independent", seatsHeld: 97 },

  // Chugoku (238 seats): Strong LDP across Yamaguchi / Hiroshima.
  { state: "CGK", officeType: "regionalCouncil", party: "jp_ldp", seatsHeld: 130 },
  { state: "CGK", officeType: "regionalCouncil", party: "jp_jsp", seatsHeld: 32 },
  { state: "CGK", officeType: "regionalCouncil", party: "jp_komeito", seatsHeld: 18 },
  { state: "CGK", officeType: "regionalCouncil", party: "jp_jcp", seatsHeld: 5 },
  { state: "CGK", officeType: "regionalCouncil", party: "jp_dsp", seatsHeld: 3 },
  { state: "CGK", officeType: "regionalCouncil", party: "jp_independent", seatsHeld: 50 },

  // Shikoku (163 seats): Strong LDP. Kochi has a small but persistent JCP base.
  { state: "SHI", officeType: "regionalCouncil", party: "jp_ldp", seatsHeld: 90 },
  { state: "SHI", officeType: "regionalCouncil", party: "jp_jsp", seatsHeld: 22 },
  { state: "SHI", officeType: "regionalCouncil", party: "jp_komeito", seatsHeld: 10 },
  { state: "SHI", officeType: "regionalCouncil", party: "jp_jcp", seatsHeld: 6 },
  { state: "SHI", officeType: "regionalCouncil", party: "jp_dsp", seatsHeld: 2 },
  { state: "SHI", officeType: "regionalCouncil", party: "jp_independent", seatsHeld: 33 },

  // Kyushu & Okinawa (401 seats): LDP mainland dominance + JSP industrial
  // base in Fukuoka. Okinawa skews more opposition-friendly but the local
  // anti-base parties (Social Mass Party etc.) fold into `jp_independent`.
  { state: "KYU", officeType: "regionalCouncil", party: "jp_ldp", seatsHeld: 220 },
  { state: "KYU", officeType: "regionalCouncil", party: "jp_jsp", seatsHeld: 50 },
  { state: "KYU", officeType: "regionalCouncil", party: "jp_komeito", seatsHeld: 25 },
  { state: "KYU", officeType: "regionalCouncil", party: "jp_jcp", seatsHeld: 15 },
  { state: "KYU", officeType: "regionalCouncil", party: "jp_dsp", seatsHeld: 6 },
  { state: "KYU", officeType: "regionalCouncil", party: "jp_independent", seatsHeld: 85 },
];

// Source data is the 1990 prefectural baseline (all eight macro-regions held
// by LDP-aligned governors). Identifier suffixed `_1991` to match the
// `1991-default` reset preset id; the underlying composition is unchanged.
export const JP_GOVERNORS_1991: HistoricalSeat[] = [
  { state: "HOK", officeType: "governor", party: "jp_ldp" },
  { state: "TOH", officeType: "governor", party: "jp_ldp" },
  { state: "KAN", officeType: "governor", party: "jp_ldp" },
  { state: "CHU", officeType: "governor", party: "jp_ldp" },
  { state: "KNS", officeType: "governor", party: "jp_ldp" },
  { state: "CGK", officeType: "governor", party: "jp_ldp" },
  { state: "SHI", officeType: "governor", party: "jp_ldp" },
  { state: "KYU", officeType: "governor", party: "jp_ldp" },
];
