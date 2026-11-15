import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// ─── China: 13th NPC (2018-2023) + Regional Governors ────────────────────
// NPC: 2980 seats. CPC dominates (~95%), minor parties hold token seats.
// Each entry = ONE NPP holding all that party's seats in that region.

export const CN_NPC_2020: HistoricalSeat[] = [
  // Dongbei (Northeast): 238 seats — CPC 225, CDL 8, CNDCA 5
  { state: "DB", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 225 },
  { state: "DB", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 8 },
  { state: "DB", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 5 },

  // Huabei (North): 323 seats — CPC 306, CDL 11, CNDCA 6
  { state: "HB", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 306 },
  { state: "HB", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 11 },
  { state: "HB", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 6 },

  // Huadong (East): 922 seats — CPC 874, CDL 32, CNDCA 16
  { state: "HD", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 874 },
  { state: "HD", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 32 },
  { state: "HD", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 16 },

  // Huazhong (Central): 395 seats — CPC 374, CDL 14, CNDCA 7
  { state: "HZ", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 374 },
  { state: "HZ", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 14 },
  { state: "HZ", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 7 },

  // Huanan (South): 316 seats — CPC 299, CDL 12, CNDCA 5
  { state: "HN", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 299 },
  { state: "HN", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 12 },
  { state: "HN", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 5 },

  // Xinan (Southwest): 466 seats — CPC 441, CDL 17, CNDCA 8
  { state: "XN", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 441 },
  { state: "XN", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 17 },
  { state: "XN", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 8 },

  // Xibei (Northwest): 320 seats — CPC 303, CDL 11, CNDCA 6
  { state: "XB", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 303 },
  { state: "XB", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 11 },
  { state: "XB", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 6 },
];

// CPC-affiliated regional governors (all 7 regions)
export const CN_GOVERNORS_2020: HistoricalSeat[] = [
  { state: "DB", officeType: "governor", party: "cn_ccp" },
  { state: "HB", officeType: "governor", party: "cn_ccp" },
  { state: "HD", officeType: "governor", party: "cn_ccp" },
  { state: "HZ", officeType: "governor", party: "cn_ccp" },
  { state: "HN", officeType: "governor", party: "cn_ccp" },
  { state: "XN", officeType: "governor", party: "cn_ccp" },
  { state: "XB", officeType: "governor", party: "cn_ccp" },
];

// ─── China: Provincial People's Congress (sub-national legislature) ───────
// Approximate per-region seat totals scaled from real-world provincial PPC
// sizes (Sichuan/Henan/Shandong ~860-890 delegates each; per-macro-region
// sums scaled down for game playability). Party split mirrors NPC's ~94.5%
// CCP / 3.5% CDL / 2% CNDCA pattern. Each entry is one row = one NPP
// before splitCNNPCDelegates redistributes CCP rows across 7 NPPs.

export const CN_PEOPLES_CONGRESS_2020: HistoricalSeat[] = [
  // Dongbei (Northeast): 321 — CPC 303, CDL 11, CNDCA 7
  { state: "DB", officeType: "peoplesCongress", party: "cn_ccp", seatsHeld: 303 },
  { state: "DB", officeType: "peoplesCongress", party: "cn_cdl", seatsHeld: 11 },
  { state: "DB", officeType: "peoplesCongress", party: "cn_cndca", seatsHeld: 7 },

  // Huabei (North): 433 — CPC 409, CDL 15, CNDCA 9
  { state: "HB", officeType: "peoplesCongress", party: "cn_ccp", seatsHeld: 409 },
  { state: "HB", officeType: "peoplesCongress", party: "cn_cdl", seatsHeld: 15 },
  { state: "HB", officeType: "peoplesCongress", party: "cn_cndca", seatsHeld: 9 },

  // Huadong (East): 1240 — CPC 1172, CDL 43, CNDCA 25
  { state: "HD", officeType: "peoplesCongress", party: "cn_ccp", seatsHeld: 1172 },
  { state: "HD", officeType: "peoplesCongress", party: "cn_cdl", seatsHeld: 43 },
  { state: "HD", officeType: "peoplesCongress", party: "cn_cndca", seatsHeld: 25 },

  // Huazhong (Central): 533 — CPC 504, CDL 19, CNDCA 10
  { state: "HZ", officeType: "peoplesCongress", party: "cn_ccp", seatsHeld: 504 },
  { state: "HZ", officeType: "peoplesCongress", party: "cn_cdl", seatsHeld: 19 },
  { state: "HZ", officeType: "peoplesCongress", party: "cn_cndca", seatsHeld: 10 },

  // Huanan (South): 425 — CPC 402, CDL 15, CNDCA 8
  { state: "HN", officeType: "peoplesCongress", party: "cn_ccp", seatsHeld: 402 },
  { state: "HN", officeType: "peoplesCongress", party: "cn_cdl", seatsHeld: 15 },
  { state: "HN", officeType: "peoplesCongress", party: "cn_cndca", seatsHeld: 8 },

  // Xinan (Southwest): 625 — CPC 591, CDL 22, CNDCA 12
  { state: "XN", officeType: "peoplesCongress", party: "cn_ccp", seatsHeld: 591 },
  { state: "XN", officeType: "peoplesCongress", party: "cn_cdl", seatsHeld: 22 },
  { state: "XN", officeType: "peoplesCongress", party: "cn_cndca", seatsHeld: 12 },

  // Xibei (Northwest): 423 — CPC 400, CDL 14, CNDCA 9
  { state: "XB", officeType: "peoplesCongress", party: "cn_ccp", seatsHeld: 400 },
  { state: "XB", officeType: "peoplesCongress", party: "cn_cdl", seatsHeld: 14 },
  { state: "XB", officeType: "peoplesCongress", party: "cn_cndca", seatsHeld: 9 },
];
