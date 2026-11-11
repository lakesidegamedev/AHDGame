import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// ─── China: 7th NPC (1988–1993) + Regional Governors ────────────────────────
// ~1991 session. CPC held ~97% of NPC seats; CDL and CNDCA held token seats.
// Seat counts match the game's 2,980-seat NPC model.

export const CN_NPC_1991: HistoricalSeat[] = [
  // Dongbei (Northeast): 238 seats — CPC 231, CDL 5, CNDCA 2
  { state: "DB", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 231 },
  { state: "DB", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 5 },
  { state: "DB", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 2 },

  // Huabei (North): 323 seats — CPC 313, CDL 7, CNDCA 3
  { state: "HB", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 313 },
  { state: "HB", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 7 },
  { state: "HB", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 3 },

  // Huadong (East): 922 seats — CPC 895, CDL 18, CNDCA 9
  { state: "HD", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 895 },
  { state: "HD", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 18 },
  { state: "HD", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 9 },

  // Huazhong (Central): 395 seats — CPC 383, CDL 8, CNDCA 4
  { state: "HZ", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 383 },
  { state: "HZ", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 8 },
  { state: "HZ", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 4 },

  // Huanan (South): 316 seats — CPC 307, CDL 6, CNDCA 3
  { state: "HN", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 307 },
  { state: "HN", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 6 },
  { state: "HN", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 3 },

  // Xinan (Southwest): 466 seats — CPC 452, CDL 9, CNDCA 5
  { state: "XN", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 452 },
  { state: "XN", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 9 },
  { state: "XN", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 5 },

  // Xibei (Northwest): 320 seats — CPC 311, CDL 6, CNDCA 3
  { state: "XB", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 311 },
  { state: "XB", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 6 },
  { state: "XB", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 3 },
];

// 1991-era Provincial People's Congresses — higher CCP share (~96.7%),
// minor parties markedly smaller, matching the 7th NPC era.
export const CN_PEOPLES_CONGRESS_1991: HistoricalSeat[] = [
  // Dongbei (Northeast): 321 — CPC 310, CDL 7, CNDCA 4
  { state: "DB", officeType: "peoplesCongress", party: "cn_ccp", seatsHeld: 310 },
  { state: "DB", officeType: "peoplesCongress", party: "cn_cdl", seatsHeld: 7 },
  { state: "DB", officeType: "peoplesCongress", party: "cn_cndca", seatsHeld: 4 },

  // Huabei (North): 433 — CPC 419, CDL 9, CNDCA 5
  { state: "HB", officeType: "peoplesCongress", party: "cn_ccp", seatsHeld: 419 },
  { state: "HB", officeType: "peoplesCongress", party: "cn_cdl", seatsHeld: 9 },
  { state: "HB", officeType: "peoplesCongress", party: "cn_cndca", seatsHeld: 5 },

  // Huadong (East): 1240 — CPC 1200, CDL 25, CNDCA 15
  { state: "HD", officeType: "peoplesCongress", party: "cn_ccp", seatsHeld: 1200 },
  { state: "HD", officeType: "peoplesCongress", party: "cn_cdl", seatsHeld: 25 },
  { state: "HD", officeType: "peoplesCongress", party: "cn_cndca", seatsHeld: 15 },

  // Huazhong (Central): 533 — CPC 515, CDL 12, CNDCA 6
  { state: "HZ", officeType: "peoplesCongress", party: "cn_ccp", seatsHeld: 515 },
  { state: "HZ", officeType: "peoplesCongress", party: "cn_cdl", seatsHeld: 12 },
  { state: "HZ", officeType: "peoplesCongress", party: "cn_cndca", seatsHeld: 6 },

  // Huanan (South): 425 — CPC 410, CDL 10, CNDCA 5
  { state: "HN", officeType: "peoplesCongress", party: "cn_ccp", seatsHeld: 410 },
  { state: "HN", officeType: "peoplesCongress", party: "cn_cdl", seatsHeld: 10 },
  { state: "HN", officeType: "peoplesCongress", party: "cn_cndca", seatsHeld: 5 },

  // Xinan (Southwest): 625 — CPC 605, CDL 14, CNDCA 6
  { state: "XN", officeType: "peoplesCongress", party: "cn_ccp", seatsHeld: 605 },
  { state: "XN", officeType: "peoplesCongress", party: "cn_cdl", seatsHeld: 14 },
  { state: "XN", officeType: "peoplesCongress", party: "cn_cndca", seatsHeld: 6 },

  // Xibei (Northwest): 423 — CPC 408, CDL 10, CNDCA 5
  { state: "XB", officeType: "peoplesCongress", party: "cn_ccp", seatsHeld: 408 },
  { state: "XB", officeType: "peoplesCongress", party: "cn_cdl", seatsHeld: 10 },
  { state: "XB", officeType: "peoplesCongress", party: "cn_cndca", seatsHeld: 5 },
];

// CPC-affiliated regional governors (all 7 regions, same as 2020)
export const CN_GOVERNORS_1991: HistoricalSeat[] = [
  { state: "DB", officeType: "governor", party: "cn_ccp" },
  { state: "HB", officeType: "governor", party: "cn_ccp" },
  { state: "HD", officeType: "governor", party: "cn_ccp" },
  { state: "HZ", officeType: "governor", party: "cn_ccp" },
  { state: "HN", officeType: "governor", party: "cn_ccp" },
  { state: "XN", officeType: "governor", party: "cn_ccp" },
  { state: "XB", officeType: "governor", party: "cn_ccp" },
];
