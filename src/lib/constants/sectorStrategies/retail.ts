import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

export const RETAIL_STRATEGIES: SectorStrategy[] = [
  {
    id: "ecommerce_fulfillment",
    requiresTechUnlock: true,
    minDecade: "2009",
    name: "E-Commerce Fulfillment",
    description:
      "Online-first retail run from fulfillment centers: high retail output that leans hard on freight, software and electronics.",
    supply: { retail: 0.6 },
    demand: { freight: 0.2, software: 0.1, electronics: 0.05, real_estate_services: 0.03 },
  },
  {
    id: "standard",
    name: "Standard",
    description: "Mixed online and physical retail operations.",
    supply: { retail: 0.5 },
    demand: {
      // Broad-basket rates sum to 0.735, not 1.05: retail still creates the widest final-demand sink but no longer buys more than its entire nameplate before operating costs.
      food: 0.1,
      electronics: 0.06,
      energy: 0.05,
      vehicles: 0.04,
      freight: 0.06,
      advertising: 0.08,
      software: 0.05,
      chemicals: 0.025,
      pharmaceuticals: 0.025,
      financial_services: 0.04,
      consulting_services: 0.025,
      building_materials: 0.03,
      steel: 0.025,
      oil: 0.025,
      healthcare_services: 0.03,
      real_estate_services: 0.035,
      plastics: 0.035,
    },
  },
  {
    id: "ecommerce",
    minDecade: "1999",
    name: "E-Commerce",
    description:
      "Online-first retail. Higher freight and software needs, co-produces software platforms.",
    supply: { retail: 0.35, software: 0.1 },
    demand: { software: 0.1, freight: 0.12, electronics: 0.1, advertising: 0.08, plastics: 0.09 },
  },
  {
    id: "brick_mortar",
    name: "Brick & Mortar",
    description:
      "Physical storefronts and shopping centers. Higher retail output but infrastructure costs.",
    supply: { retail: 0.55 },
    demand: {
      real_estate_services: 0.12,
      energy: 0.12,
      advertising: 0.1,
      food: 0.1,
      freight: 0.08,
      healthcare_services: 0.03,
      plastics: 0.04,
    },
  },
];
