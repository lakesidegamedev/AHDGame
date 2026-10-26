import type { DemographicCategory } from "@/lib/db/types";

export const frDemographicCategories: DemographicCategory[] = [
  {
    _id: "fr_voterGroups",
    name: "France Voter Groups",
    defaultWeight: 100,
    groups: [
      {
        id: "bourgeois_right",
        name: "Bourgeois Right",
        defaultEconomicLean: 3,
        defaultSocialLean: 2,
        defaultTurnout: 88,
      },
      {
        id: "catholic_conservative",
        name: "Catholic Conservative",
        defaultEconomicLean: 1,
        defaultSocialLean: 3,
        defaultTurnout: 86,
      },
      {
        id: "centrist_liberal",
        name: "Centrist Liberal",
        defaultEconomicLean: 1,
        defaultSocialLean: 0,
        defaultTurnout: 84,
      },
      {
        id: "social_democrat",
        name: "Social Democrat",
        defaultEconomicLean: -2,
        defaultSocialLean: -1,
        defaultTurnout: 84,
      },
      {
        id: "communist_worker",
        name: "Communist Worker",
        defaultEconomicLean: -4,
        defaultSocialLean: -1,
        defaultTurnout: 82,
      },
      {
        id: "rural_farmer",
        name: "Rural Farmer",
        defaultEconomicLean: 0,
        defaultSocialLean: 2,
        defaultTurnout: 86,
      },
      {
        id: "youth_student",
        name: "Youth & Students",
        defaultEconomicLean: -1,
        defaultSocialLean: -2,
        defaultTurnout: 72,
      },
    ],
  },
];

export default frDemographicCategories;
