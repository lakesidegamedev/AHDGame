import type { DemographicCategory } from "@/lib/db/types";

export const huDemographicCategories: DemographicCategory[] = [
  {
    _id: "hu_voterGroups",
    name: "Hungary Voter Groups",
    defaultWeight: 100,
    groups: [
      {
        id: "national_conservative",
        name: "National Conservative",
        defaultEconomicLean: 1,
        defaultSocialLean: 4,
        defaultTurnout: 74,
      },
      {
        id: "christian_rural",
        name: "Christian Rural",
        defaultEconomicLean: 0,
        defaultSocialLean: 5,
        defaultTurnout: 72,
      },
      {
        id: "urban_liberal",
        name: "Urban Liberal",
        defaultEconomicLean: 1,
        defaultSocialLean: -3,
        defaultTurnout: 70,
      },
      {
        id: "socialist_left",
        name: "Socialist Left",
        defaultEconomicLean: -3,
        defaultSocialLean: -1,
        defaultTurnout: 68,
      },
      {
        id: "green_youth",
        name: "Green Youth",
        defaultEconomicLean: -1,
        defaultSocialLean: -4,
        defaultTurnout: 64,
      },
      {
        id: "roma_minority",
        name: "Roma Minority",
        defaultEconomicLean: -2,
        defaultSocialLean: 1,
        defaultTurnout: 52,
      },
    ],
  },
];

export default huDemographicCategories;
