import type { DemographicCategory } from "@/lib/db/types";

export const seDemographicCategories: DemographicCategory[] = [
  {
    _id: "se_voterGroups",
    name: "Sweden Voter Groups",
    defaultWeight: 100,
    groups: [
      {
        id: "blue_collar_sap",
        name: "Blue-Collar (LO/SAP)",
        defaultEconomicLean: -3,
        defaultSocialLean: -1,
        defaultTurnout: 92,
      },
      {
        id: "public_sector_left",
        name: "Public-Sector Left",
        defaultEconomicLean: -2,
        defaultSocialLean: -2,
        defaultTurnout: 92,
      },
      {
        id: "business_conservative",
        name: "Business Conservative",
        defaultEconomicLean: 3,
        defaultSocialLean: 1,
        defaultTurnout: 93,
      },
      {
        id: "agrarian_centrist",
        name: "Agrarian Centrist",
        defaultEconomicLean: 0,
        defaultSocialLean: 0,
        defaultTurnout: 90,
      },
      {
        id: "liberal_urban",
        name: "Urban Liberal",
        defaultEconomicLean: 1,
        defaultSocialLean: -2,
        defaultTurnout: 92,
      },
      {
        id: "radical_left",
        name: "Radical Left",
        defaultEconomicLean: -4,
        defaultSocialLean: -2,
        defaultTurnout: 88,
      },
      {
        id: "rural_north",
        name: "Rural North",
        defaultEconomicLean: -1,
        defaultSocialLean: 0,
        defaultTurnout: 90,
      },
    ],
  },
];

export default seDemographicCategories;
