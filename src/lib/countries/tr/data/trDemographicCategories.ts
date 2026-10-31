import type { DemographicCategory } from "@/lib/db/types";

export const trDemographicCategories: DemographicCategory[] = [
  {
    _id: "tr_voterGroups",
    name: "Turkey Voter Groups",
    defaultWeight: 100,
    groups: [
      {
        id: "kemalist_secular",
        name: "Kemalist Secular",
        defaultEconomicLean: -1,
        defaultSocialLean: -3,
        defaultTurnout: 76,
      },
      {
        id: "conservative_religious",
        name: "Conservative Religious",
        defaultEconomicLean: 1,
        defaultSocialLean: 4,
        defaultTurnout: 74,
      },
      {
        id: "nationalist",
        name: "Nationalist",
        defaultEconomicLean: 1,
        defaultSocialLean: 3,
        defaultTurnout: 72,
      },
      {
        id: "urban_worker",
        name: "Urban Worker",
        defaultEconomicLean: -3,
        defaultSocialLean: -1,
        defaultTurnout: 74,
      },
      {
        id: "rural_peasant",
        name: "Rural Peasant",
        defaultEconomicLean: 0,
        defaultSocialLean: 3,
        defaultTurnout: 72,
      },
      {
        id: "kurdish_minority",
        name: "Kurdish Minority",
        defaultEconomicLean: -2,
        defaultSocialLean: 1,
        defaultTurnout: 65,
      },
      {
        id: "business_liberal",
        name: "Business Liberal",
        defaultEconomicLean: 3,
        defaultSocialLean: 0,
        defaultTurnout: 78,
      },
    ],
  },
];

export default trDemographicCategories;
