/**
 * SEED INDEPENDENCE: authored for 1953 directly; never derive from another era.
 *
 * 1953 German Bundestag Zweitstimmen per Land, from the 6 September 1953 election,
 * the chamber deRegions1953.ts seats. Used by calculateDEStatePartyOrgs when the
 * active preset is 1953-default. National result the table is calibrated against:
 * CDU 36.4 + CSU 8.8 = 45.2, SPD 28.8, FDP 9.5, GB/BHE 5.9, DP 3.3.
 *
 * Parties outside the seeded 1953 roster (Bayernpartei, Zentrum, KPD, DRP) have no
 * party seed, so their share goes unallocated rather than folded into another
 * party. This is the only table carrying dp and gbbhe, the two 1953-only parties;
 * without them those parties get no statePartyOrg row and cannot field candidates.
 * Only the 11 FRG Laender appear; the DDR's own org rows use the same ids and must
 * not collide. CSU contests only BY and CDU is absent from BY.
 *
 * Two Laender had NO 1953 Bundestag vote and are explicitly MODELED, not copied:
 * - SL (Saarland) was a French protectorate until 1957. Seeded from the era's Saar
 *   landscape (CVP maps to CDU, SPS to SPD, DPS to FDP); DP and GB/BHE did not
 *   organize there and are omitted.
 * - BE (West Berlin) sent non-voting observer deputies under Four-Power status.
 *   Seeded from the Berlin Abgeordnetenhaus balance of the period, with no
 *   DP/GB-BHE organization.
 *
 * Values rounded for gameplay calibration from Bundeswahlleiter 1953 tables.
 */

export const DE_LAND_VOTE_SHARES_1953: Record<string, Record<string, number>> = {
  BW: { cdu: 42, spd: 25, fdp: 17, gbbhe: 6, dp: 1 },
  BY: { csu: 47, spd: 23, fdp: 5, gbbhe: 6, dp: 1 }, // Bayernpartei ~9% unmodeled
  NW: { cdu: 43, spd: 31, fdp: 10, gbbhe: 3, dp: 2 },
  HE: { cdu: 35, spd: 35, fdp: 13, gbbhe: 8, dp: 2 },
  RP: { cdu: 46, spd: 27, fdp: 13, gbbhe: 6, dp: 1 },
  SL: { cdu: 30, spd: 25, fdp: 20 }, // MODELED — French protectorate, no Bundestag vote
  NI: { cdu: 35, spd: 29, fdp: 8, gbbhe: 11, dp: 11 }, // DP heartland
  SH: { cdu: 47, spd: 27, fdp: 7, gbbhe: 12, dp: 5 }, // heaviest expellee resettlement
  HH: { cdu: 39, spd: 38, fdp: 9, gbbhe: 5, dp: 4 },
  BRE: { cdu: 29, spd: 38, fdp: 13, gbbhe: 6, dp: 5 },
  BE: { cdu: 30, spd: 44, fdp: 13 }, // MODELED — observer deputies only, no direct vote
};

export default DE_LAND_VOTE_SHARES_1953;
