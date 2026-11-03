import type { DemographicCategory } from "@/lib/db/types";

export const itDemographicCategories: DemographicCategory[] = [
  {
    _id: "it_voterGroups",
    name: "Italy Voter Groups",
    defaultWeight: 100,
    groups: [
      {
        id: "catholic_dc",
        name: "Catholic / DC Base",
        defaultEconomicLean: 1,
        defaultSocialLean: 3,
        defaultTurnout: 90,
      },
      {
        id: "industrial_north",
        name: "Northern Industrialist",
        defaultEconomicLean: 3,
        defaultSocialLean: 1,
        defaultTurnout: 90,
      },
      {
        id: "communist_worker",
        name: "Communist Worker",
        defaultEconomicLean: -4,
        defaultSocialLean: -1,
        defaultTurnout: 90,
      },
      {
        id: "socialist",
        name: "Socialist",
        defaultEconomicLean: -2,
        defaultSocialLean: -1,
        defaultTurnout: 88,
      },
      {
        id: "southern_client",
        name: "Southern Clientelist",
        defaultEconomicLean: -1,
        defaultSocialLean: 2,
        defaultTurnout: 86,
      },
      {
        id: "secular_liberal",
        name: "Secular Liberal",
        defaultEconomicLean: 1,
        defaultSocialLean: -1,
        defaultTurnout: 90,
      },
      {
        id: "youth_radical",
        name: "Radical Youth",
        defaultEconomicLean: -2,
        defaultSocialLean: -3,
        defaultTurnout: 78,
      },
    ],
  },
];

export default itDemographicCategories;
