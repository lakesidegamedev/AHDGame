import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

/** Purchased inputs per basket for Standard retail in the 2027 preset. */
export const STANDARD_RETAIL_INPUT_SCALE_2027 = 0.7;

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
      // Few, larger lines: tiny inputs are bought at a make-do premium, and the basket must leave room for labour and overhead.
      food: 0.081,
      electronics: 0.049,
      energy: 0.041,
      vehicles: 0.033,
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
    description:
      "Online-first retail. Higher freight and software needs, co-produces software platforms.",
    supply: { retail: 0.35, software: 0.1 },
    demand: {
      software: 0.071,
      freight: 0.087,
      electronics: 0.071,
      advertising: 0.057,
      plastics: 0.064,
    },
  },
  {
    id: "brick_mortar",
    name: "Brick & Mortar",
    description:
      "Physical storefronts and shopping centers. Higher retail output but infrastructure costs.",
    supply: { retail: 0.55 },
    demand: {
      real_estate_services: 0.086,
      energy: 0.086,
      advertising: 0.071,
      food: 0.071,
      freight: 0.057,
      plastics: 0.029,
    },
  },
];
