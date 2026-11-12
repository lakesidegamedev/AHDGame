import type { PartySeed } from "@/lib/seeds/reference/politicalParties";

/**
 * Ukraine ruling party (Cold-War presets). The Communist Party of Ukraine was a
 * republican branch of the CPSU with no legal alternative in either authored
 * era, so the roster is a single entry gated to 1953/1979. Party record ids use
 * the `ua_kpu` prefix.
 *
 * Positions sit where a republican branch sits: economically at the planned
 * extreme, socially conservative, and more Moscow-aligned on foreign policy than
 * the satellite parties (BKP -3, PZPR -2) since the KPU had no foreign policy of
 * its own. Culture is slightly below the Byelorussian branch (tolerated
 * national-cultural assertion in the 1960s, and 1953 Ukraine remembered the
 * dissolved Uniate church). Treasury is set above Belarus, Bulgaria, and
 * Poland's PZPR: the KPU was the largest republican party organisation outside
 * the RSFSR.
 */
export const uaParties: PartySeed[] = [
  {
    seedOrder: 1,
    countryId: "UKR",
    name: "Communist Party of Ukraine",
    abbreviation: "KPU",
    color: "#C00000",
    economicPosition: -4,
    socialPosition: 2,
    memberCount: 0,
    isDefault: true,
    validForPresets: ["1953-default", "1979-default"],
    regimeStatus: "ruling",
    treasury: 900_000,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
  },
];
export default uaParties;
