import type { DemographicCategory } from "@/lib/db/types";

export const esDemographicCategories: DemographicCategory[] = [
  {
    _id: "es_voterGroups",
    name: "Spain Voter Groups",
    defaultWeight: 100,
    groups: [
      {
        id: "conservative_catholic",
        name: "Conservative Catholic",
        defaultEconomicLean: 2,
        defaultSocialLean: 3,
        defaultTurnout: 70,
      },
      {
        id: "centrist",
        name: "Centrist",
        defaultEconomicLean: 1,
        defaultSocialLean: 1,
        defaultTurnout: 72,
      },
      {
        id: "socialist_worker",
        name: "Socialist Worker",
        defaultEconomicLean: -2,
        defaultSocialLean: -2,
        defaultTurnout: 72,
      },
      {
        id: "communist_worker",
        name: "Communist Worker",
        defaultEconomicLean: -4,
        defaultSocialLean: -2,
        defaultTurnout: 70,
      },
      {
        id: "regional_nationalist",
        name: "Regional Nationalist",
        defaultEconomicLean: 0,
        defaultSocialLean: -1,
        defaultTurnout: 72,
      },
      {
        id: "urban_professional",
        name: "Urban Professional",
        defaultEconomicLean: 1,
        defaultSocialLean: -1,
        defaultTurnout: 76,
      },
      {
        id: "youth_democratic",
        name: "Democratic Youth",
        defaultEconomicLean: -2,
        defaultSocialLean: -3,
        defaultTurnout: 62,
      },
    ],
  },
];

export default esDemographicCategories;
