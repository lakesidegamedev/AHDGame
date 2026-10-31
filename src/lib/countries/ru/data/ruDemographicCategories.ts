import type { DemographicCategory } from "@/lib/db/types";

export const ruDemographicCategories: DemographicCategory[] = [
  {
    _id: "su_voterGroups",
    name: "USSR Voter Groups",
    defaultWeight: 100,
    groups: [
      {
        id: "party_nomenklatura",
        name: "Party Nomenklatura",
        defaultEconomicLean: -1,
        defaultSocialLean: 3,
        defaultTurnout: 95,
      },
      {
        id: "industrial_worker",
        name: "Industrial Worker",
        defaultEconomicLean: -2,
        defaultSocialLean: 1,
        defaultTurnout: 88,
      },
      {
        id: "collective_farmer",
        name: "Collective Farmer",
        defaultEconomicLean: -2,
        defaultSocialLean: 2,
        defaultTurnout: 86,
      },
      {
        id: "urban_professional",
        name: "Urban Professional",
        defaultEconomicLean: 0,
        defaultSocialLean: 0,
        defaultTurnout: 85,
      },
      {
        id: "intelligentsia",
        name: "Intelligentsia",
        defaultEconomicLean: 0,
        defaultSocialLean: -1,
        defaultTurnout: 88,
      },
      {
        id: "national_minority",
        name: "National Minority",
        defaultEconomicLean: -1,
        defaultSocialLean: 2,
        defaultTurnout: 82,
      },
      {
        id: "youth",
        name: "Youth",
        defaultEconomicLean: 0,
        defaultSocialLean: -1,
        defaultTurnout: 78,
      },
    ],
  },
];

export default ruDemographicCategories;
