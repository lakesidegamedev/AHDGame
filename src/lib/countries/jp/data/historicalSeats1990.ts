import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// ─── JP February 1990: 39th General Election ─────────────────────────────────
// Shugiin: 512 seats
// LDP 275, JSP 136, Komeito 45, JCP 16, DSP 14, SDF 1, Ind 25
// Party slugs: jp_ldp (LDP), jp_jsp (JSP — 1991-only default), jp_komeito,
// jp_jcp, jp_dsp (DSP — 1991-only default), jp_independent (SDF + independents).
// CDP / DPFP / Ishin are 2019-era parties and don't appear here.
//
// ⚠️ THE REGIONAL SPLIT WAS RE-AGGREGATED; the national totals above are
// unchanged and are the real result. The previous split was authored against a
// different regional taxonomy than `jpRegions1991`: it put 85 seats in Kyushu
// against that bundle's 62 and 78 in Kansai against its 92, inverting the real
// ordering of the two — Kansai was the more populous by some margin. Seven of
// the eight regions disagreed. Each region now sums to its `houseDistricts`,
// which `JP_SHUGIIN_SEATS_1991` also mirrors, so the chamber config, the
// districts, this roster and the election allocator finally agree.
//
// Within that constraint the distribution follows the real 1990 pattern: the
// LDP's share is lowest in urban Kanto and Kansai and highest in Chugoku,
// Shikoku and Kyushu; Komeito concentrates in Kansai and Tokyo; the JCP is
// almost entirely urban; the DSP sits in Kansai and industrial Aichi. It is
// not a claim of per-prefecture precision.

export const JP_SHUGIIN_1990: HistoricalSeat[] = [
  // HOK (23 seats): Hokkaido: LDP rural seats alongside JSP labour-union strongholds.
  // LDP 11, JSP 6, Komeito 1, JCP 1, Ind 4 = 23.
  { state: "HOK", officeType: "shugiin", party: "jp_ldp", seatsHeld: 11 },
  { state: "HOK", officeType: "shugiin", party: "jp_jsp", seatsHeld: 6 },
  { state: "HOK", officeType: "shugiin", party: "jp_komeito", seatsHeld: 1 },
  { state: "HOK", officeType: "shugiin", party: "jp_jcp", seatsHeld: 1 },
  { state: "HOK", officeType: "shugiin", party: "jp_independent", seatsHeld: 4 },

  // TOH (50 seats): Tohoku: rural LDP heartland, with the JSP holding industrial Niigata
  // and Miyagi.
  // LDP 30, JSP 14, Komeito 3, Ind 3 = 50.
  { state: "TOH", officeType: "shugiin", party: "jp_ldp", seatsHeld: 30 },
  { state: "TOH", officeType: "shugiin", party: "jp_jsp", seatsHeld: 14 },
  { state: "TOH", officeType: "shugiin", party: "jp_komeito", seatsHeld: 3 },
  { state: "TOH", officeType: "shugiin", party: "jp_independent", seatsHeld: 3 },

  // KAN (145 seats): Kanto: proportionally the LDP's weakest region. Komeito's Tokyo
  // organisation, the JCP's best result and the DSP's Rengo-aligned seats all
  // sit here. This region also carries the seat that brings the chamber to 512.
  // LDP 70, JSP 44, Komeito 15, JCP 7, DSP 6, Ind 3 = 145.
  { state: "KAN", officeType: "shugiin", party: "jp_ldp", seatsHeld: 70 },
  { state: "KAN", officeType: "shugiin", party: "jp_jsp", seatsHeld: 44 },
  { state: "KAN", officeType: "shugiin", party: "jp_komeito", seatsHeld: 15 },
  { state: "KAN", officeType: "shugiin", party: "jp_jcp", seatsHeld: 7 },
  { state: "KAN", officeType: "shugiin", party: "jp_dsp", seatsHeld: 6 },
  { state: "KAN", officeType: "shugiin", party: "jp_independent", seatsHeld: 3 },

  // CHU (86 seats): Chubu: LDP-dominant, and home to the DSP's Aichi manufacturing base.
  // LDP 52, JSP 20, Komeito 6, JCP 2, DSP 2, Ind 4 = 86.
  { state: "CHU", officeType: "shugiin", party: "jp_ldp", seatsHeld: 52 },
  { state: "CHU", officeType: "shugiin", party: "jp_jsp", seatsHeld: 20 },
  { state: "CHU", officeType: "shugiin", party: "jp_komeito", seatsHeld: 6 },
  { state: "CHU", officeType: "shugiin", party: "jp_jcp", seatsHeld: 2 },
  { state: "CHU", officeType: "shugiin", party: "jp_dsp", seatsHeld: 2 },
  { state: "CHU", officeType: "shugiin", party: "jp_independent", seatsHeld: 4 },

  // KNS (92 seats): Kansai: Komeito's founding base in Osaka, strong JCP and DSP showings,
  // and the LDP below its national share.
  // LDP 41, JSP 22, Komeito 14, JCP 5, DSP 6, Ind 4 = 92.
  { state: "KNS", officeType: "shugiin", party: "jp_ldp", seatsHeld: 41 },
  { state: "KNS", officeType: "shugiin", party: "jp_jsp", seatsHeld: 22 },
  { state: "KNS", officeType: "shugiin", party: "jp_komeito", seatsHeld: 14 },
  { state: "KNS", officeType: "shugiin", party: "jp_jcp", seatsHeld: 5 },
  { state: "KNS", officeType: "shugiin", party: "jp_dsp", seatsHeld: 6 },
  { state: "KNS", officeType: "shugiin", party: "jp_independent", seatsHeld: 4 },

  // CGK (34 seats): Chugoku: rural and conservative, the LDP's strongest regional share.
  // LDP 22, JSP 8, Komeito 2, Ind 2 = 34.
  { state: "CGK", officeType: "shugiin", party: "jp_ldp", seatsHeld: 22 },
  { state: "CGK", officeType: "shugiin", party: "jp_jsp", seatsHeld: 8 },
  { state: "CGK", officeType: "shugiin", party: "jp_komeito", seatsHeld: 2 },
  { state: "CGK", officeType: "shugiin", party: "jp_independent", seatsHeld: 2 },

  // SHI (20 seats): Shikoku: the smallest region, and solidly LDP.
  // LDP 12, JSP 5, Ind 3 = 20.
  { state: "SHI", officeType: "shugiin", party: "jp_ldp", seatsHeld: 12 },
  { state: "SHI", officeType: "shugiin", party: "jp_jsp", seatsHeld: 5 },
  { state: "SHI", officeType: "shugiin", party: "jp_independent", seatsHeld: 3 },

  // KYU (62 seats): Kyushu and Okinawa: LDP-dominant, with JSP strength in the old Fukuoka
  // coalfield. Okinawa's anti-base parties fold into `jp_independent`.
  // LDP 37, JSP 17, Komeito 4, JCP 1, Ind 3 = 62.
  { state: "KYU", officeType: "shugiin", party: "jp_ldp", seatsHeld: 37 },
  { state: "KYU", officeType: "shugiin", party: "jp_jsp", seatsHeld: 17 },
  { state: "KYU", officeType: "shugiin", party: "jp_komeito", seatsHeld: 4 },
  { state: "KYU", officeType: "shugiin", party: "jp_jcp", seatsHeld: 1 },
  { state: "KYU", officeType: "shugiin", party: "jp_independent", seatsHeld: 3 },
];
