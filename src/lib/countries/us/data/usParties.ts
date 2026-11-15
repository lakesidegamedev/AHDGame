import type { PartySeed } from "@/lib/seeds/reference/politicalParties";

/**
 * United States default political parties.
 * NOTE: seedOrder determines the sequentialId assignment order within the US.
 */
export const usParties: PartySeed[] = [
  {
    seedOrder: 1,
    countryId: "US",
    name: "Democratic Party",
    abbreviation: "DEM",
    color: "#3B82F6", // Blue
    economicPosition: -2, // Center-left
    socialPosition: -2, // Center-left
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    treasury: 1000000,
    nationalTaxRate: 0,
    politicalStrength: 0,
    memberCount: 0,
    isDefault: true,
    createdBy: null,
  },
  {
    seedOrder: 2,
    countryId: "US",
    name: "Republican Party",
    abbreviation: "REP",
    color: "#EF4444", // Red
    economicPosition: 2, // Center-right
    socialPosition: 2, // Center-right
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    treasury: 1000000,
    nationalTaxRate: 0,
    politicalStrength: 0,
    memberCount: 0,
    isDefault: true,
    createdBy: null,
  },
  {
    seedOrder: 3,
    countryId: "US",
    name: "Green Party",
    abbreviation: "GRN",
    tier: "minor",
    color: "#17AA5C",
    economicPosition: -4,
    socialPosition: -4,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    treasury: 1_000_000,
    nationalTaxRate: 0,
    politicalStrength: 0,
    memberCount: 0,
    isDefault: true,
    createdBy: null,
    validForPresets: ["2007-default", "2019-default", "2023-default", "2027-default"],
  },
  {
    seedOrder: 4,
    countryId: "US",
    name: "Libertarian Party",
    abbreviation: "LIB",
    tier: "minor",
    color: "#E5B72F",
    economicPosition: 4,
    socialPosition: -4,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    treasury: 1_000_000,
    nationalTaxRate: 0,
    politicalStrength: 0,
    memberCount: 0,
    isDefault: true,
    createdBy: null,
    validForPresets: [
      "1979-default",
      "1991-default",
      "1999-default",
      "2007-default",
      "2019-default",
      "2023-default",
      "2027-default",
    ],
  },
];
