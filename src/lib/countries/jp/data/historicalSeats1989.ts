import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// Totals: LDP 275, JSP 136, Komeito 45, JCP 16, DSP 14, Ind 26 = 512 ✓
// (Independent total includes Social Democratic Federation's 4 seats + 22 true independents.)

// ─── JP July 1989: the Sangiin after the 15th ordinary election ──────────────
// Sangiin: 252 seats — the size the chamber held from 1983 until the 1998
// reduction. LDP 109, JSP 66, Komeito 21, JCP 14, DSP 10, others 32.
//
// ⚠️ THIS SEATED 206 OF 252, AND NOTHING SAID SO. The 46-seat hole was not
// declared through `vacantSeats` either, so it was indistinguishable from a
// roster someone had truncated — the exact ambiguity that field exists to
// resolve. The admin readiness diagnostic could not see it: `seatMin` was
// pinned to the 2019 Diet at 713, and 512 + 206 = 718 cleared it.
//
// ⚠️ THE OLD 206 WAS NOT A SCALED-DOWN 1989 RESULT, so it is not what the fill
// was built from. It ran Komeito at 13.6% against a real 8.3% and the JSP at
// 19.4% against a real 26.2%; scaling it would have preserved that distortion
// and buried the thing that makes 1989 worth modelling. The national totals
// above are the real ones, distributed regionally the same way the Shugiin is.
//
// LDP 109 is below the 127 needed for a majority. Losing control of the upper
// house for the first time is the defining fact of this Diet, and it is what
// makes a 1991 Japan interesting to play: the governing party cannot pass
// legislation on its own.
//
// ⚠️ THE TWO CLASSES ARE DELIBERATELY ASYMMETRIC. Half the Sangiin is elected
// every three years, so this chamber holds one cohort from 1986 — an LDP
// landslide — and one from 1989, its worst result to that point. Class 1 is
// LDP 72 / JSP 18; class 2 is LDP 37 / JSP 48. Splitting each region evenly
// between the classes would have erased the stagger that makes the next
// election (July 1992, when the 1986 cohort comes up) consequential.
export const JP_SANGIIN_1989: HistoricalSeat[] = [
  // HOK (8 seats, 4 per class): Hokkaido.
  // Class 1 (1986): LDP 2, JSP 1, Komeito 1 = 4.
  { state: "HOK", officeType: "sangiin", party: "jp_ldp", seatsHeld: 2, chamberClass: 1 },
  { state: "HOK", officeType: "sangiin", party: "jp_jsp", seatsHeld: 1, chamberClass: 1 },
  { state: "HOK", officeType: "sangiin", party: "jp_komeito", seatsHeld: 1, chamberClass: 1 },
  // Class 2 (1989): LDP 1, JSP 2, JCP 1 = 4.
  { state: "HOK", officeType: "sangiin", party: "jp_ldp", seatsHeld: 1, chamberClass: 2 },
  { state: "HOK", officeType: "sangiin", party: "jp_jsp", seatsHeld: 2, chamberClass: 2 },
  { state: "HOK", officeType: "sangiin", party: "jp_jcp", seatsHeld: 1, chamberClass: 2 },

  // TOH (22 seats, 11 per class): Tohoku: rural, and the clearest 1989 swing — the LDP's farm vote broke
  // over the beef and citrus liberalisation and the new consumption tax.
  // Class 1 (1986): LDP 7, JSP 2, Komeito 1, JCP 1 = 11.
  { state: "TOH", officeType: "sangiin", party: "jp_ldp", seatsHeld: 7, chamberClass: 1 },
  { state: "TOH", officeType: "sangiin", party: "jp_jsp", seatsHeld: 2, chamberClass: 1 },
  { state: "TOH", officeType: "sangiin", party: "jp_komeito", seatsHeld: 1, chamberClass: 1 },
  { state: "TOH", officeType: "sangiin", party: "jp_jcp", seatsHeld: 1, chamberClass: 1 },
  // Class 2 (1989): LDP 4, JSP 5, Komeito 1, Ind 1 = 11.
  { state: "TOH", officeType: "sangiin", party: "jp_ldp", seatsHeld: 4, chamberClass: 2 },
  { state: "TOH", officeType: "sangiin", party: "jp_jsp", seatsHeld: 5, chamberClass: 2 },
  { state: "TOH", officeType: "sangiin", party: "jp_komeito", seatsHeld: 1, chamberClass: 2 },
  { state: "TOH", officeType: "sangiin", party: "jp_independent", seatsHeld: 1, chamberClass: 2 },

  // KAN (78 seats, 39 per class): Kanto.
  // Class 1 (1986): LDP 20, JSP 7, Komeito 3, JCP 3, DSP 2, Ind 4 = 39.
  { state: "KAN", officeType: "sangiin", party: "jp_ldp", seatsHeld: 20, chamberClass: 1 },
  { state: "KAN", officeType: "sangiin", party: "jp_jsp", seatsHeld: 7, chamberClass: 1 },
  { state: "KAN", officeType: "sangiin", party: "jp_komeito", seatsHeld: 3, chamberClass: 1 },
  { state: "KAN", officeType: "sangiin", party: "jp_jcp", seatsHeld: 3, chamberClass: 1 },
  { state: "KAN", officeType: "sangiin", party: "jp_dsp", seatsHeld: 2, chamberClass: 1 },
  { state: "KAN", officeType: "sangiin", party: "jp_independent", seatsHeld: 4, chamberClass: 1 },
  // Class 2 (1989): LDP 11, JSP 15, Komeito 3, JCP 3, DSP 1, Ind 6 = 39.
  { state: "KAN", officeType: "sangiin", party: "jp_ldp", seatsHeld: 11, chamberClass: 2 },
  { state: "KAN", officeType: "sangiin", party: "jp_jsp", seatsHeld: 15, chamberClass: 2 },
  { state: "KAN", officeType: "sangiin", party: "jp_komeito", seatsHeld: 3, chamberClass: 2 },
  { state: "KAN", officeType: "sangiin", party: "jp_jcp", seatsHeld: 3, chamberClass: 2 },
  { state: "KAN", officeType: "sangiin", party: "jp_dsp", seatsHeld: 1, chamberClass: 2 },
  { state: "KAN", officeType: "sangiin", party: "jp_independent", seatsHeld: 6, chamberClass: 2 },

  // CHU (44 seats, 22 per class): Chubu.
  // Class 1 (1986): LDP 13, JSP 3, Komeito 2, JCP 1, DSP 1, Ind 2 = 22.
  { state: "CHU", officeType: "sangiin", party: "jp_ldp", seatsHeld: 13, chamberClass: 1 },
  { state: "CHU", officeType: "sangiin", party: "jp_jsp", seatsHeld: 3, chamberClass: 1 },
  { state: "CHU", officeType: "sangiin", party: "jp_komeito", seatsHeld: 2, chamberClass: 1 },
  { state: "CHU", officeType: "sangiin", party: "jp_jcp", seatsHeld: 1, chamberClass: 1 },
  { state: "CHU", officeType: "sangiin", party: "jp_dsp", seatsHeld: 1, chamberClass: 1 },
  { state: "CHU", officeType: "sangiin", party: "jp_independent", seatsHeld: 2, chamberClass: 1 },
  // Class 2 (1989): LDP 6, JSP 8, Komeito 2, JCP 1, DSP 1, Ind 4 = 22.
  { state: "CHU", officeType: "sangiin", party: "jp_ldp", seatsHeld: 6, chamberClass: 2 },
  { state: "CHU", officeType: "sangiin", party: "jp_jsp", seatsHeld: 8, chamberClass: 2 },
  { state: "CHU", officeType: "sangiin", party: "jp_komeito", seatsHeld: 2, chamberClass: 2 },
  { state: "CHU", officeType: "sangiin", party: "jp_jcp", seatsHeld: 1, chamberClass: 2 },
  { state: "CHU", officeType: "sangiin", party: "jp_dsp", seatsHeld: 1, chamberClass: 2 },
  { state: "CHU", officeType: "sangiin", party: "jp_independent", seatsHeld: 4, chamberClass: 2 },

  // KNS (46 seats, 23 per class): Kansai.
  // Class 1 (1986): LDP 12, JSP 3, Komeito 2, JCP 2, DSP 2, Ind 2 = 23.
  { state: "KNS", officeType: "sangiin", party: "jp_ldp", seatsHeld: 12, chamberClass: 1 },
  { state: "KNS", officeType: "sangiin", party: "jp_jsp", seatsHeld: 3, chamberClass: 1 },
  { state: "KNS", officeType: "sangiin", party: "jp_komeito", seatsHeld: 2, chamberClass: 1 },
  { state: "KNS", officeType: "sangiin", party: "jp_jcp", seatsHeld: 2, chamberClass: 1 },
  { state: "KNS", officeType: "sangiin", party: "jp_dsp", seatsHeld: 2, chamberClass: 1 },
  { state: "KNS", officeType: "sangiin", party: "jp_independent", seatsHeld: 2, chamberClass: 1 },
  // Class 2 (1989): LDP 6, JSP 9, Komeito 2, JCP 1, DSP 1, Ind 4 = 23.
  { state: "KNS", officeType: "sangiin", party: "jp_ldp", seatsHeld: 6, chamberClass: 2 },
  { state: "KNS", officeType: "sangiin", party: "jp_jsp", seatsHeld: 9, chamberClass: 2 },
  { state: "KNS", officeType: "sangiin", party: "jp_komeito", seatsHeld: 2, chamberClass: 2 },
  { state: "KNS", officeType: "sangiin", party: "jp_jcp", seatsHeld: 1, chamberClass: 2 },
  { state: "KNS", officeType: "sangiin", party: "jp_dsp", seatsHeld: 1, chamberClass: 2 },
  { state: "KNS", officeType: "sangiin", party: "jp_independent", seatsHeld: 4, chamberClass: 2 },

  // CGK (16 seats, 8 per class): Chugoku.
  // Class 1 (1986): LDP 5, JSP 1, Komeito 1, Ind 1 = 8.
  { state: "CGK", officeType: "sangiin", party: "jp_ldp", seatsHeld: 5, chamberClass: 1 },
  { state: "CGK", officeType: "sangiin", party: "jp_jsp", seatsHeld: 1, chamberClass: 1 },
  { state: "CGK", officeType: "sangiin", party: "jp_komeito", seatsHeld: 1, chamberClass: 1 },
  { state: "CGK", officeType: "sangiin", party: "jp_independent", seatsHeld: 1, chamberClass: 1 },
  // Class 2 (1989): LDP 3, JSP 3, JCP 1, Ind 1 = 8.
  { state: "CGK", officeType: "sangiin", party: "jp_ldp", seatsHeld: 3, chamberClass: 2 },
  { state: "CGK", officeType: "sangiin", party: "jp_jsp", seatsHeld: 3, chamberClass: 2 },
  { state: "CGK", officeType: "sangiin", party: "jp_jcp", seatsHeld: 1, chamberClass: 2 },
  { state: "CGK", officeType: "sangiin", party: "jp_independent", seatsHeld: 1, chamberClass: 2 },

  // SHI (10 seats, 5 per class): Shikoku.
  // Class 1 (1986): LDP 4, Ind 1 = 5.
  { state: "SHI", officeType: "sangiin", party: "jp_ldp", seatsHeld: 4, chamberClass: 1 },
  { state: "SHI", officeType: "sangiin", party: "jp_independent", seatsHeld: 1, chamberClass: 1 },
  // Class 2 (1989): LDP 1, JSP 2, Komeito 1, Ind 1 = 5.
  { state: "SHI", officeType: "sangiin", party: "jp_ldp", seatsHeld: 1, chamberClass: 2 },
  { state: "SHI", officeType: "sangiin", party: "jp_jsp", seatsHeld: 2, chamberClass: 2 },
  { state: "SHI", officeType: "sangiin", party: "jp_komeito", seatsHeld: 1, chamberClass: 2 },
  { state: "SHI", officeType: "sangiin", party: "jp_independent", seatsHeld: 1, chamberClass: 2 },

  // KYU (28 seats, 14 per class): Kyushu and Okinawa.
  // Class 1 (1986): LDP 9, JSP 1, Komeito 1, DSP 1, Ind 2 = 14.
  { state: "KYU", officeType: "sangiin", party: "jp_ldp", seatsHeld: 9, chamberClass: 1 },
  { state: "KYU", officeType: "sangiin", party: "jp_jsp", seatsHeld: 1, chamberClass: 1 },
  { state: "KYU", officeType: "sangiin", party: "jp_komeito", seatsHeld: 1, chamberClass: 1 },
  { state: "KYU", officeType: "sangiin", party: "jp_dsp", seatsHeld: 1, chamberClass: 1 },
  { state: "KYU", officeType: "sangiin", party: "jp_independent", seatsHeld: 2, chamberClass: 1 },
  // Class 2 (1989): LDP 5, JSP 4, Komeito 1, DSP 1, Ind 3 = 14.
  { state: "KYU", officeType: "sangiin", party: "jp_ldp", seatsHeld: 5, chamberClass: 2 },
  { state: "KYU", officeType: "sangiin", party: "jp_jsp", seatsHeld: 4, chamberClass: 2 },
  { state: "KYU", officeType: "sangiin", party: "jp_komeito", seatsHeld: 1, chamberClass: 2 },
  { state: "KYU", officeType: "sangiin", party: "jp_dsp", seatsHeld: 1, chamberClass: 2 },
  { state: "KYU", officeType: "sangiin", party: "jp_independent", seatsHeld: 3, chamberClass: 2 },
];
