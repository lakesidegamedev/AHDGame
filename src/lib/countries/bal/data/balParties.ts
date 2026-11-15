import type { PartySeed } from "@/lib/seeds/reference/politicalParties";

/**
 * Baltic ruling party (Cold-War presets), gated to 1953/1979.
 *
 * One party. The Estonian, Latvian and Lithuanian Communist Parties were
 * republican branches of the CPSU under democratic centralism, not separate
 * organisations; seeding three would imply a federal party system that did not
 * exist. The republican split lives in regions and census instead. This is
 * union republics inside the USSR, not a satellite state, so the treasury is
 * the smallest of the bloc set.
 */
export const balParties: PartySeed[] = [
  {
    seedOrder: 1,
    countryId: "BAL",
    name: "Communist Party of the Soviet Union (Baltic Republican Organisations)",
    abbreviation: "CPSU",
    color: "#C00000",
    economicPosition: -4,
    socialPosition: 1,
    memberCount: 0,
    isDefault: true,
    validForPresets: ["1953-default", "1979-default"],
    regimeStatus: "ruling",
    treasury: 500_000,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
  },
];
export default balParties;
