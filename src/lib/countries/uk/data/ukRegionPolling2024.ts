/**
 * 2024 UK regional vote shares from the 4 July 2024 general election (fought
 * on 2023 Periodic Review boundaries). Used by calculateUKStatePartyOrgs when
 * the active preset is 2027-default.
 *
 * Source: House of Commons Library briefing CBP-10009.
 *
 * Alliance and SDLP are not seeded as default parties, so their shares stay
 * unallocated rather than being folded into a party that did not win them.
 * Mainland parties are zero in NI except small LD and Green entries.
 */

export const UK_REGION_POLLING_2024: Record<string, Record<string, number>> = {
  LON: {
    uk_labour: 43,
    uk_conservative: 21,
    uk_libdem: 11,
    uk_green: 10,
    uk_reform: 9,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  SEE: {
    uk_labour: 25,
    uk_conservative: 31,
    uk_libdem: 22,
    uk_green: 7,
    uk_reform: 14,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  SWE: {
    uk_labour: 25,
    uk_conservative: 28,
    uk_libdem: 25,
    uk_green: 7,
    uk_reform: 14,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  EAE: {
    uk_labour: 29,
    uk_conservative: 31,
    uk_libdem: 13,
    uk_green: 7,
    uk_reform: 17,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  EMI: {
    uk_labour: 35,
    uk_conservative: 29,
    uk_libdem: 6,
    uk_green: 6,
    uk_reform: 19,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  WMI: {
    uk_labour: 34,
    uk_conservative: 28,
    uk_libdem: 9,
    uk_green: 6,
    uk_reform: 18,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  YHU: {
    uk_labour: 41,
    uk_conservative: 23,
    uk_libdem: 7,
    uk_green: 7,
    uk_reform: 17,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  NWE: {
    uk_labour: 44,
    uk_conservative: 19,
    uk_libdem: 8,
    uk_green: 7,
    uk_reform: 17,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  NEE: {
    uk_labour: 45,
    uk_conservative: 20,
    uk_libdem: 6,
    uk_green: 6,
    uk_reform: 20,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  SCO: {
    uk_labour: 35,
    uk_conservative: 13,
    uk_libdem: 10,
    uk_green: 4,
    uk_reform: 7,
    uk_snp: 30,
    uk_plaid: 0,
    uk_dup: 0,
    uk_sf: 0,
  },
  WAL: {
    uk_labour: 37,
    uk_conservative: 18,
    uk_libdem: 7,
    uk_green: 5,
    uk_reform: 17,
    uk_snp: 0,
    uk_plaid: 15,
    uk_dup: 0,
    uk_sf: 0,
  },
  NIR: {
    // Northern Ireland 2024: SF 27.0 first past the DUP 22.1; UUP 12.2
    // holds one seat. Alliance 15.0 and SDLP 11.1 are not seeded as
    // default parties, so their shares go unallocated.
    uk_labour: 0,
    uk_conservative: 0,
    uk_libdem: 1,
    uk_green: 1,
    uk_reform: 0,
    uk_snp: 0,
    uk_plaid: 0,
    uk_dup: 22,
    uk_sf: 27,
    // 1991-only default, only added when the active preset is 1991. Kept
    // at its actual 2024 share so the key exists in every era table.
    uk_uup: 12,
  },
};

export default UK_REGION_POLLING_2024;
