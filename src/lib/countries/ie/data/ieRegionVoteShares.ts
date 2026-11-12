/**
 * Estimated IE regional vote share (%) by NUTS-III region and party slug,
 * one table per starting year. Seeds `statePartyOrg.organization` via
 * `calculateIEStatePartyOrgs`; slugs must match `ieStatePartyOrgCalculations.ts`
 * and the seeded `politicalParties` rows.
 *
 * Calibration estimates from tally coverage, not exact results: NUTS-III
 * regions aggregate multiple constituencies. Small drift inside the 5-70
 * org band is overwritten by the registration-lane step.
 */
export const IE_REGION_VOTE_SHARES_2024: Record<string, Record<string, number>> = {
  DUB: { ff: 19, fg: 18, sf: 21, lab: 7, green: 6 },
  KIL: { ff: 23, fg: 21, sf: 18, lab: 5, green: 4 },
  MID: { ff: 26, fg: 23, sf: 17, lab: 4, green: 3 },
  WEX: { ff: 22, fg: 19, sf: 17, lab: 5, green: 3 },
  LIM: { ff: 25, fg: 22, sf: 17, lab: 4, green: 4 },
  COR: { ff: 22, fg: 23, sf: 17, lab: 5, green: 4 },
  GAL: { ff: 24, fg: 22, sf: 17, lab: 4, green: 3 },
  DON: { ff: 24, fg: 19, sf: 22, lab: 4, green: 3 },
};

export const IE_REGION_VOTE_SHARES_1989: Record<string, Record<string, number>> = {
  DUB: { ff: 38, fg: 28, lab: 12, wp: 7, pd: 7 },
  KIL: { ff: 44, fg: 30, lab: 9, wp: 2, pd: 7 },
  MID: { ff: 50, fg: 33, lab: 8, wp: 1, pd: 3 },
  WEX: { ff: 46, fg: 30, lab: 11, wp: 2, pd: 4 },
  LIM: { ff: 46, fg: 32, lab: 8, wp: 1, pd: 6 },
  COR: { ff: 41, fg: 32, lab: 11, wp: 2, pd: 7 },
  GAL: { ff: 49, fg: 34, lab: 7, wp: 1, pd: 4 },
  DON: { ff: 50, fg: 32, lab: 7, wp: 2, pd: 4 },
};

/**
 * 1954 baseline: the 18 May 1954 general election, which seated the 15th Dáil
 * that `ieRegions1953.ts` models (147 seats) and that the `ieDail: 1954` cycle
 * anchor points at.
 *
 * National result: FF 43.4, FG 32.0, Labour 12.1. Clann na Poblachta (3.8),
 * Clann na Talmhan (3.1) and the Independent bloc (~5.6) have no seed in
 * `ieParties.ts` and are deliberately NOT folded in; their share stays
 * unallocated, matching the BR and JP 1953 tables.
 *
 * Regional shape: FF weakest in Dublin and strongest in the west and border;
 * Labour concentrated in the "Labour belt" (Dublin, Kildare/Mid-East,
 * Carlow-Kilkenny-Wexford, Munster) and near-absent in Connacht/Ulster.
 *
 * Dublin is the one region where FF's organisation trails FG: FG's real base
 * was Dublin's southside middle-class suburbs, going back to Cumann na
 * nGaedheal wins in the 1920s-30s, while FF's dominance was rural- and
 * border-anchored. Every other region keeps FF ahead, so the national aggregate
 * stays FF-led (~43/32) and the org seed is no longer single-party across all 8.
 */
export const IE_REGION_VOTE_SHARES_1953: Record<string, Record<string, number>> = {
  DUB: { ff: 32, fg: 37, lab: 18 },
  KIL: { ff: 42, fg: 32, lab: 15 },
  MID: { ff: 46, fg: 33, lab: 9 },
  WEX: { ff: 41, fg: 31, lab: 18 },
  LIM: { ff: 44, fg: 30, lab: 14 },
  COR: { ff: 43, fg: 32, lab: 13 },
  GAL: { ff: 46, fg: 36, lab: 5 },
  DON: { ff: 45, fg: 33, lab: 4 },
};
