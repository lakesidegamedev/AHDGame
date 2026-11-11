import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// ─── Brazil: 49th Congress (post-October 1990 elections) ─────────────────────
// Chamber of Deputies: 503 seats (game models 513; historical 1990 total was 503).
// Senate: 81 seats (3 per state, mix of 1986 holdovers and 1990 elected).
// Party slugs use historical names; many parties later merged or dissolved.

export const BR_CHAMBER_1991: HistoricalSeat[] = [
  // Sudeste (SE — SP, RJ, MG, ES): ~196 seats
  { state: "SUDESTE", officeType: "chamber", party: "br_pmdb", seatsHeld: 41 },
  { state: "SUDESTE", officeType: "chamber", party: "br_pfl", seatsHeld: 27 },
  { state: "SUDESTE", officeType: "chamber", party: "br_pdt", seatsHeld: 21 },
  { state: "SUDESTE", officeType: "chamber", party: "br_pds", seatsHeld: 16 },
  { state: "SUDESTE", officeType: "chamber", party: "br_ptb", seatsHeld: 15 },
  { state: "SUDESTE", officeType: "chamber", party: "br_prn", seatsHeld: 16 },
  { state: "SUDESTE", officeType: "chamber", party: "br_pt", seatsHeld: 20 },
  { state: "SUDESTE", officeType: "chamber", party: "br_pl", seatsHeld: 7 },
  { state: "SUDESTE", officeType: "chamber", party: "br_psb", seatsHeld: 5 },
  { state: "SUDESTE", officeType: "chamber", party: "br_pcdob", seatsHeld: 2 },
  { state: "SUDESTE", officeType: "chamber", party: "br_psd", seatsHeld: 4 },
  { state: "SUDESTE", officeType: "chamber", party: "br_other", seatsHeld: 22 },

  // Nordeste (NE — BA, PE, CE, MA, PB, RN, AL, SE, PI): ~141 seats
  { state: "NORDESTE", officeType: "chamber", party: "br_pmdb", seatsHeld: 28 },
  { state: "NORDESTE", officeType: "chamber", party: "br_pfl", seatsHeld: 35 },
  { state: "NORDESTE", officeType: "chamber", party: "br_pdt", seatsHeld: 11 },
  { state: "NORDESTE", officeType: "chamber", party: "br_pds", seatsHeld: 12 },
  { state: "NORDESTE", officeType: "chamber", party: "br_ptb", seatsHeld: 11 },
  { state: "NORDESTE", officeType: "chamber", party: "br_prn", seatsHeld: 11 },
  { state: "NORDESTE", officeType: "chamber", party: "br_pt", seatsHeld: 5 },
  { state: "NORDESTE", officeType: "chamber", party: "br_pl", seatsHeld: 4 },
  { state: "NORDESTE", officeType: "chamber", party: "br_psb", seatsHeld: 3 },
  { state: "NORDESTE", officeType: "chamber", party: "br_pcdob", seatsHeld: 2 },
  { state: "NORDESTE", officeType: "chamber", party: "br_psd", seatsHeld: 5 },
  { state: "NORDESTE", officeType: "chamber", party: "br_other", seatsHeld: 14 },

  // Sul (S — RS, PR, SC): ~86 seats
  { state: "SUL", officeType: "chamber", party: "br_pmdb", seatsHeld: 21 },
  { state: "SUL", officeType: "chamber", party: "br_pfl", seatsHeld: 10 },
  { state: "SUL", officeType: "chamber", party: "br_pdt", seatsHeld: 9 },
  { state: "SUL", officeType: "chamber", party: "br_pds", seatsHeld: 10 },
  { state: "SUL", officeType: "chamber", party: "br_ptb", seatsHeld: 7 },
  { state: "SUL", officeType: "chamber", party: "br_prn", seatsHeld: 8 },
  { state: "SUL", officeType: "chamber", party: "br_pt", seatsHeld: 8 },
  { state: "SUL", officeType: "chamber", party: "br_pl", seatsHeld: 3 },
  { state: "SUL", officeType: "chamber", party: "br_psb", seatsHeld: 2 },
  { state: "SUL", officeType: "chamber", party: "br_pcdob", seatsHeld: 1 },
  { state: "SUL", officeType: "chamber", party: "br_psd", seatsHeld: 3 },
  { state: "SUL", officeType: "chamber", party: "br_other", seatsHeld: 4 },

  // Centro-Oeste (CW — GO, MT, MS, DF): ~35 seats
  { state: "CENTRO_OESTE", officeType: "chamber", party: "br_pmdb", seatsHeld: 10 },
  { state: "CENTRO_OESTE", officeType: "chamber", party: "br_pfl", seatsHeld: 5 },
  { state: "CENTRO_OESTE", officeType: "chamber", party: "br_pdt", seatsHeld: 3 },
  { state: "CENTRO_OESTE", officeType: "chamber", party: "br_pds", seatsHeld: 2 },
  { state: "CENTRO_OESTE", officeType: "chamber", party: "br_ptb", seatsHeld: 3 },
  { state: "CENTRO_OESTE", officeType: "chamber", party: "br_prn", seatsHeld: 3 },
  { state: "CENTRO_OESTE", officeType: "chamber", party: "br_pt", seatsHeld: 1 },
  { state: "CENTRO_OESTE", officeType: "chamber", party: "br_pl", seatsHeld: 1 },
  { state: "CENTRO_OESTE", officeType: "chamber", party: "br_psb", seatsHeld: 1 },
  { state: "CENTRO_OESTE", officeType: "chamber", party: "br_psd", seatsHeld: 1 },
  { state: "CENTRO_OESTE", officeType: "chamber", party: "br_other", seatsHeld: 5 },

  // Norte (N — PA, AM, AC, RO, RR, AP, TO): ~45 seats
  { state: "NORTE", officeType: "chamber", party: "br_pmdb", seatsHeld: 8 },
  { state: "NORTE", officeType: "chamber", party: "br_pfl", seatsHeld: 5 },
  { state: "NORTE", officeType: "chamber", party: "br_pdt", seatsHeld: 2 },
  { state: "NORTE", officeType: "chamber", party: "br_pds", seatsHeld: 2 },
  { state: "NORTE", officeType: "chamber", party: "br_ptb", seatsHeld: 2 },
  { state: "NORTE", officeType: "chamber", party: "br_prn", seatsHeld: 2 },
  { state: "NORTE", officeType: "chamber", party: "br_pt", seatsHeld: 1 },
  { state: "NORTE", officeType: "chamber", party: "br_pl", seatsHeld: 1 },
  { state: "NORTE", officeType: "chamber", party: "br_psd", seatsHeld: 1 },
  { state: "NORTE", officeType: "chamber", party: "br_other", seatsHeld: 21 },
];

export const BR_SENATE_1991: HistoricalSeat[] = [
  // Sudeste (12 senators — 4 states × 3)
  { state: "SUDESTE", officeType: "senate", party: "br_pmdb", seatsHeld: 4 },
  { state: "SUDESTE", officeType: "senate", party: "br_pfl", seatsHeld: 2 },
  { state: "SUDESTE", officeType: "senate", party: "br_pdt", seatsHeld: 2 },
  { state: "SUDESTE", officeType: "senate", party: "br_pt", seatsHeld: 1 },
  { state: "SUDESTE", officeType: "senate", party: "br_prn", seatsHeld: 1 },
  { state: "SUDESTE", officeType: "senate", party: "br_other", seatsHeld: 2 },

  // Nordeste (27 senators — 9 states × 3)
  { state: "NORDESTE", officeType: "senate", party: "br_pmdb", seatsHeld: 6 },
  { state: "NORDESTE", officeType: "senate", party: "br_pfl", seatsHeld: 8 },
  { state: "NORDESTE", officeType: "senate", party: "br_pds", seatsHeld: 5 },
  { state: "NORDESTE", officeType: "senate", party: "br_ptb", seatsHeld: 3 },
  { state: "NORDESTE", officeType: "senate", party: "br_pdt", seatsHeld: 1 },
  { state: "NORDESTE", officeType: "senate", party: "br_prn", seatsHeld: 2 },
  { state: "NORDESTE", officeType: "senate", party: "br_other", seatsHeld: 2 },

  // Sul (9 senators — 3 states × 3)
  { state: "SUL", officeType: "senate", party: "br_pmdb", seatsHeld: 4 },
  { state: "SUL", officeType: "senate", party: "br_pds", seatsHeld: 2 },
  { state: "SUL", officeType: "senate", party: "br_pdt", seatsHeld: 2 },
  { state: "SUL", officeType: "senate", party: "br_ptb", seatsHeld: 1 },

  // Centro-Oeste (12 senators — 4 states × 3)
  { state: "CENTRO_OESTE", officeType: "senate", party: "br_pmdb", seatsHeld: 5 },
  { state: "CENTRO_OESTE", officeType: "senate", party: "br_pfl", seatsHeld: 3 },
  { state: "CENTRO_OESTE", officeType: "senate", party: "br_pds", seatsHeld: 2 },
  { state: "CENTRO_OESTE", officeType: "senate", party: "br_prn", seatsHeld: 1 },
  { state: "CENTRO_OESTE", officeType: "senate", party: "br_other", seatsHeld: 1 },

  // Norte (21 senators — 7 states × 3)
  { state: "NORTE", officeType: "senate", party: "br_pmdb", seatsHeld: 7 },
  { state: "NORTE", officeType: "senate", party: "br_pfl", seatsHeld: 3 },
  { state: "NORTE", officeType: "senate", party: "br_pdt", seatsHeld: 2 },
  { state: "NORTE", officeType: "senate", party: "br_ptb", seatsHeld: 1 },
  { state: "NORTE", officeType: "senate", party: "br_other", seatsHeld: 8 },
];
