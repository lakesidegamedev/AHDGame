/*
 * 1992 UK regional Westminster vote shares, derived from 1992 General Election
 * per-region results (UK Parliament Library research briefings).
 * Used by calculateUKStatePartyOrgs under the 1991-default preset. Parties not
 * seeded at 1991-default (e.g. Reform, SDLP, Alliance) resolve to no DB row and
 * are skipped; their seats fall back to independent via the historical-seat resolver.
 */

export const UK_REGION_POLLING_1992: Record<string, Record<string, number>> = {
  LON: {
    uk_labour: 37,
    uk_conservative: 45,
    uk_libdem: 15,
    uk_green: 1,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  SEE: {
    uk_labour: 21,
    uk_conservative: 55,
    uk_libdem: 22,
    uk_green: 1,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  SWE: {
    uk_labour: 19,
    uk_conservative: 48,
    uk_libdem: 30,
    uk_green: 1,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  EAE: {
    uk_labour: 27,
    uk_conservative: 51,
    uk_libdem: 19,
    uk_green: 1,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  EMI: {
    uk_labour: 37,
    uk_conservative: 47,
    uk_libdem: 15,
    uk_green: 1,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  WMI: {
    uk_labour: 38,
    uk_conservative: 45,
    uk_libdem: 15,
    uk_green: 1,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  YHU: {
    uk_labour: 44,
    uk_conservative: 38,
    uk_libdem: 16,
    uk_green: 1,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  NWE: {
    uk_labour: 51,
    uk_conservative: 38,
    uk_libdem: 8,
    uk_green: 1,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  NEE: {
    uk_labour: 60,
    uk_conservative: 33,
    uk_libdem: 6,
    uk_green: 1,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  SCO: {
    uk_labour: 39,
    uk_conservative: 25,
    uk_libdem: 13,
    uk_green: 1,
    uk_snp: 22,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  WAL: {
    uk_labour: 50,
    uk_conservative: 28,
    uk_libdem: 12,
    uk_green: 1,
    uk_snp: 0,
    uk_plaid: 9,
    uk_dup: 0,
    uk_sf: 0,
  },
  NIR: {
    // Northern Ireland 1992: UUP dominant (~35%), DUP ~13%, SF ~10%.
    // SDLP (~24%) and Alliance (~9%) aren't seeded as default parties,
    // so their would-be Org rows skip via DB-lookup. The Labour /
    // Conservative / LibDem zero entries are kept to mirror the 2020
    // file's shape (no NI-mainland-party presence).
    uk_labour: 0,
    uk_conservative: 0,
    uk_libdem: 0,
    uk_green: 0,
    uk_snp: 0,
    uk_plaid: 0,
    uk_uup: 35,
    uk_dup: 13,
    uk_sf: 10,
  },
};

export default UK_REGION_POLLING_1992;
