import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

/** Running inputs per unit of resale throughput for Standard stores in the 2027 preset. */
export const STANDARD_RETAIL_INPUT_SCALE_2027 = 0.7;

export const RETAIL_STRATEGIES: SectorStrategy[] = [
  {
    id: "ecommerce_fulfillment",
    requiresTechUnlock: true,
    minDecade: "2009",
    name: "E-Commerce Fulfillment",
    description:
      "Online-first stores run from fulfillment centers: more goods resold per site, leaning hard on freight and software.",
    supply: {},
    demand: { freight: 0.2, software: 0.1, real_estate_services: 0.03 },
  },
  {
    id: "standard",
    name: "Standard",
    description: "Mixed online and physical stores.",
    supply: {},
    demand: {
      // Stores resell finished goods bought at wholesale; these are only the inputs to keep a store running.
      energy: 0.041,
      freight: 0.049,
      advertising: 0.065,
      software: 0.041,
      financial_services: 0.033,
      real_estate_services: 0.029,
      plastics: 0.029,
    },
  },
  {
    id: "ecommerce",
    minDecade: "1999",
    name: "E-Commerce",
    description: "Online-first stores. Higher freight and software needs.",
    supply: {},
    demand: {
      software: 0.071,
      freight: 0.087,
      advertising: 0.057,
      plastics: 0.064,
    },
  },
  {
    id: "brick_mortar",
    name: "Brick & Mortar",
    description:
      "Physical storefronts and shopping centers. Higher goods resold per site but infrastructure costs.",
    supply: {},
    demand: {
      real_estate_services: 0.086,
      energy: 0.086,
      advertising: 0.071,
      freight: 0.057,
      plastics: 0.029,
    },
  },
];
