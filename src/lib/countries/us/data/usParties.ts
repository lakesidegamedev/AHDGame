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
];
