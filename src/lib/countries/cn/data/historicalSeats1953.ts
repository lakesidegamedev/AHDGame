import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

// PRC — the national one-party chamber for the 1953 preset. Same shape as
// SU_SUPREME_SOVIET_1953 / DD_VOLKSKAMMER_1953 / BLOC_CHAMBERS_1953: the
// NATIONAL chamber only (no sub-national rows — DD seats no Landtage and the
// bloc seats no regional assemblies either).
//
// Era honesty. The National People's Congress did NOT exist in 1953: the 1st
// NPC convened in September 1954, and until then the CPPCC National Committee
// exercised the NPC's functions under the 1949 Common Program. The preset
// models that interim body on the `npcDelegate` office type, which is why the
// apportionment is the 1,226-deputy 1st-NPC allocation rather than the modern
// 2,980 — the same allocation `cnRegions1953.houseDistricts` already authors
// (88/129/379/215/118/219/78 = 1226) and that
// `COUNTRY_CONFIGS.CN.legislature.lowerChamber.seats` already declares for
// this preset. The game's own `cnNpcDelegate` cycle anchor for 1953-default is
// 1954, so cycle 1 resolves exactly when the 1st NPC really convened.
//
// Party split is MODELED, not copied from 1979/2020. The 1949-54 united front
// was materially broader than later decades: alongside the CPC, the CPPCC and
// the 1st NPC seated the recognised democratic parties (CDL / CNDCA here) and
// a large bloc of non-party "democratic personages" and mass-organisation
// delegates. Modeled as CPC ~55% / CDL ~6% / CNDCA ~4% / non-party ~35%, which
// is deliberately far from the CCP shares the later tables use (1991 ~96.7%,
// 2020 ~94.5%). Non-party rows use `cn_independent` (INDEPENDENT_SLUGS), the
// same convention SU_SUPREME_SOVIET_1953 uses for its non-party quarter.
// Per-region rows sum EXACTLY to that region's `houseDistricts`.
export const CN_NPC_1953: HistoricalSeat[] = [
  // Dongbei (Northeast): 88 — CPC 48, CDL 5, CNDCA 4, non-party 31
  { state: "DB", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 48 },
  { state: "DB", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 5 },
  { state: "DB", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 4 },
  { state: "DB", officeType: "npcDelegate", party: "cn_independent", seatsHeld: 31 },

  // Huabei (North): 129 — CPC 71, CDL 8, CNDCA 5, non-party 45
  { state: "HB", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 71 },
  { state: "HB", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 8 },
  { state: "HB", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 5 },
  { state: "HB", officeType: "npcDelegate", party: "cn_independent", seatsHeld: 45 },

  // Huadong (East): 379 — CPC 208, CDL 23, CNDCA 15, non-party 133
  { state: "HD", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 208 },
  { state: "HD", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 23 },
  { state: "HD", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 15 },
  { state: "HD", officeType: "npcDelegate", party: "cn_independent", seatsHeld: 133 },

  // Huazhong (Central): 215 — CPC 118, CDL 13, CNDCA 9, non-party 75
  { state: "HZ", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 118 },
  { state: "HZ", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 13 },
  { state: "HZ", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 9 },
  { state: "HZ", officeType: "npcDelegate", party: "cn_independent", seatsHeld: 75 },

  // Huanan (South): 118 — CPC 65, CDL 7, CNDCA 5, non-party 41
  { state: "HN", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 65 },
  { state: "HN", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 7 },
  { state: "HN", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 5 },
  { state: "HN", officeType: "npcDelegate", party: "cn_independent", seatsHeld: 41 },

  // Xinan (Southwest): 219 — CPC 120, CDL 13, CNDCA 9, non-party 77
  { state: "XN", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 120 },
  { state: "XN", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 13 },
  { state: "XN", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 9 },
  { state: "XN", officeType: "npcDelegate", party: "cn_independent", seatsHeld: 77 },

  // Xibei (Northwest): 78 — CPC 43, CDL 5, CNDCA 3, non-party 27
  { state: "XB", officeType: "npcDelegate", party: "cn_ccp", seatsHeld: 43 },
  { state: "XB", officeType: "npcDelegate", party: "cn_cdl", seatsHeld: 5 },
  { state: "XB", officeType: "npcDelegate", party: "cn_cndca", seatsHeld: 3 },
  { state: "XB", officeType: "npcDelegate", party: "cn_independent", seatsHeld: 27 },
];
