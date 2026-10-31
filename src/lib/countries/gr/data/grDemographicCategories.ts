import type { DemographicCategory } from "@/lib/db/types";

export const grDemographicCategories: DemographicCategory[] = [
  {
    _id: "gr_voterGroups",
    name: "Greece Voter Groups",
    defaultWeight: 100,
    groups: [
      {
        id: "conservative_right",
        name: "Conservative Right",
        defaultEconomicLean: 2,
        defaultSocialLean: 3,
        defaultTurnout: 82,
      },
      {
        id: "centrist_liberal",
        name: "Centrist Liberal",
        defaultEconomicLean: 0,
        defaultSocialLean: 0,
        defaultTurnout: 80,
      },
      {
        id: "socialist_left",
        name: "Socialist Left",
        defaultEconomicLean: -3,
        defaultSocialLean: -2,
        defaultTurnout: 82,
      },
      {
        id: "communist_left",
        name: "Communist Left",
        defaultEconomicLean: -5,
        defaultSocialLean: -2,
        defaultTurnout: 80,
      },
      {
        id: "rural_farmer",
        name: "Rural Farmer",
        defaultEconomicLean: 0,
        defaultSocialLean: 2,
        defaultTurnout: 78,
      },
      {
        id: "urban_worker",
        name: "Urban Worker",
        defaultEconomicLean: -3,
        defaultSocialLean: -1,
        defaultTurnout: 80,
      },
      {
        id: "shipping_business",
        name: "Shipping & Business",
        defaultEconomicLean: 4,
        defaultSocialLean: 1,
        defaultTurnout: 84,
      },
    ],
  },
];

export default grDemographicCategories;
