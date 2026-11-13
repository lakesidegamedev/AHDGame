import type { PartySeed } from "@/lib/seeds/reference/politicalParties";
import type { MajorDefaultParty } from "@/lib/seeds/defaultPartyTiers";

/**
 * Canada's default parties for the 2027 world, all fictional analogues.
 * Positions sit on the -5 to +5 scale (negative is economically left and
 * socially liberal). The opening board follows the April 2025 federal result:
 * a centrist governing party ahead of a right-of-centre opposition, a
 * Quebec-only sovereigntist party, a shrunken left party and one Green seat.
 *
 * The Laurentian Alliance runs only in Quebec; the regional party machinery
 * enforces that, not this seed.
 */
export const CA_PARTY_SLUGS = {
  federalUnity: "ca_federal_unity",
  nationalProsperity: "ca_national_prosperity",
  labourCommons: "ca_labour_commons",
  laurentian: "ca_laurentian",
  greenHorizon: "ca_green_horizon",
} as const;

export const CA_PARTY_REGIONAL_RESTRICTIONS: Readonly<Record<string, readonly string[]>> = {
  [CA_PARTY_SLUGS.laurentian]: ["CA_QC"],
};

/** Default party abbreviation to stable slug, for rules keyed by slug. */
export const CA_PARTY_SLUG_BY_ABBREVIATION: Readonly<Record<string, string>> = {
  FUP: CA_PARTY_SLUGS.federalUnity,
  NPA: CA_PARTY_SLUGS.nationalProsperity,
  LCP: CA_PARTY_SLUGS.labourCommons,
  AL: CA_PARTY_SLUGS.laurentian,
  GHP: CA_PARTY_SLUGS.greenHorizon,
};

function caParty(
  seedOrder: number,
  name: string,
  abbreviation: string,
  color: string,
  economicPosition: number,
  socialPosition: number,
  treasury: number
): PartySeed {
  return {
    seedOrder,
    countryId: "CA",
    name,
    abbreviation,
    color,
    economicPosition,
    socialPosition,
    memberCount: 0,
    isDefault: true,
    treasury,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
    validForPresets: ["2027-default"],
  };
}

export const caParties: PartySeed[] = [
  caParty(1, "Federal Unity Party", "FUP", "#C8312B", -1, -2, 1_200_000),
  caParty(2, "National Prosperity Alliance", "NPA", "#1F4E9C", 3, 1, 1_200_000),
  caParty(3, "Labour Commons Party", "LCP", "#E8801A", -3, -3, 700_000),
  caParty(4, "Laurentian Alliance", "AL", "#2FA3D8", -1, -2, 600_000),
  caParty(5, "Green Horizon Party", "GHP", "#3F9B49", -3, -4, 400_000),
];

/** Party slug to the seeded display name, for polling and organisation lookups. */
export const CA_PARTY_SLUG_TO_NAME: Readonly<Record<string, string>> = {
  [CA_PARTY_SLUGS.federalUnity]: "Federal Unity Party",
  [CA_PARTY_SLUGS.nationalProsperity]: "National Prosperity Alliance",
  [CA_PARTY_SLUGS.labourCommons]: "Labour Commons Party",
  [CA_PARTY_SLUGS.laurentian]: "Laurentian Alliance",
  [CA_PARTY_SLUGS.greenHorizon]: "Green Horizon Party",
};

/**
 * Opening regional vote shares (percent) after the April 2025 federal general
 * election, from Elections Canada official results rounded and mapped onto the
 * fictional analogues above. Shares need not sum to 100: independents and
 * minor parties stay unallocated rather than being folded into a named party.
 */
export const CA_REGION_POLLING_2025: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  CA_ON: {
    ca_federal_unity: 49,
    ca_national_prosperity: 42,
    ca_labour_commons: 6,
    ca_laurentian: 0,
    ca_green_horizon: 1,
  },
  CA_QC: {
    ca_federal_unity: 44,
    ca_national_prosperity: 22,
    ca_labour_commons: 3,
    ca_laurentian: 28,
    ca_green_horizon: 1,
  },
  CA_BC: {
    ca_federal_unity: 46,
    ca_national_prosperity: 40,
    ca_labour_commons: 9,
    ca_laurentian: 0,
    ca_green_horizon: 2,
  },
  CA_AB: {
    ca_federal_unity: 29,
    ca_national_prosperity: 63,
    ca_labour_commons: 5,
    ca_laurentian: 0,
    ca_green_horizon: 1,
  },
  CA_MB: {
    ca_federal_unity: 43,
    ca_national_prosperity: 43,
    ca_labour_commons: 9,
    ca_laurentian: 0,
    ca_green_horizon: 1,
  },
  CA_SK: {
    ca_federal_unity: 29,
    ca_national_prosperity: 57,
    ca_labour_commons: 11,
    ca_laurentian: 0,
    ca_green_horizon: 1,
  },
  CA_NS: {
    ca_federal_unity: 51,
    ca_national_prosperity: 40,
    ca_labour_commons: 6,
    ca_laurentian: 0,
    ca_green_horizon: 1,
  },
  CA_NB: {
    ca_federal_unity: 49,
    ca_national_prosperity: 43,
    ca_labour_commons: 3,
    ca_laurentian: 0,
    ca_green_horizon: 2,
  },
  CA_NL: {
    ca_federal_unity: 54,
    ca_national_prosperity: 40,
    ca_labour_commons: 4,
    ca_laurentian: 0,
    ca_green_horizon: 0,
  },
  CA_PE: {
    ca_federal_unity: 47,
    ca_national_prosperity: 41,
    ca_labour_commons: 4,
    ca_laurentian: 0,
    ca_green_horizon: 7,
  },
  CA_YT: {
    ca_federal_unity: 49,
    ca_national_prosperity: 38,
    ca_labour_commons: 8,
    ca_laurentian: 0,
    ca_green_horizon: 3,
  },
  CA_NT: {
    ca_federal_unity: 48,
    ca_national_prosperity: 36,
    ca_labour_commons: 12,
    ca_laurentian: 0,
    ca_green_horizon: 2,
  },
  CA_NU: {
    ca_federal_unity: 50,
    ca_national_prosperity: 26,
    ca_labour_commons: 22,
    ca_laurentian: 0,
    ca_green_horizon: 1,
  },
};

/** Default parties that seed as Major; every other default party seeds Minor. */
export const CA_MAJOR_DEFAULT_PARTIES: MajorDefaultParty[] = [{ abbr: "FUP" }, { abbr: "NPA" }];
