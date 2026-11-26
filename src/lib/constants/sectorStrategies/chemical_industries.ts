import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

export const CHEMICAL_INDUSTRIES_STRATEGIES: SectorStrategy[] = [
  {
    id: "direct_air_capture",
    requiresTechUnlock: true,
    minDecade: "2039",
    name: "Direct Air Capture",
    description:
      "Pulls carbon dioxide from the air and turns it into chemical feedstock. Output is modest and the plants burn a very large amount of energy.",
    supply: { chemicals: 0.48 },
    demand: {
      energy: 0.28,
      steel: 0.08,
      electronics: 0.06,
      chemicals: 0.04,
      consulting_services: 0.06,
    },
  },
  {
    id: "specialty_chemicals",
    requiresTechUnlock: true,
    minDecade: "1989",
    name: "Specialty Chemicals",
    description:
      "High-value fine and specialty chemicals plus drug ingredients: richer output mix for more electronics and energy.",
    supply: { chemicals: 0.42, pharmaceuticals: 0.12 },
    demand: { chemicals: 0.12, energy: 0.12, electronics: 0.08, oil: 0.1 },
  },
  {
    id: "standard",
    name: "Industrial Chemicals",
    description: "Balanced production of industrial chemical feedstocks and process materials.",
    // Added plastics co-production 0.15. Polymer synthesis is integral to large chemical plants.
    supply: { chemicals: 0.5, plastics: 0.15 },
    demand: {
      energy: 0.18,
      oil: 0.15,
      freight: 0.08,
      real_estate_services: 0.02,
      vehicles: 0.1,
    },
  },
  {
    id: "fertilizers",
    name: "Fertilizer Production",
    description:
      "Nitrogen, phosphate, and potash processing tuned for agricultural demand with some chemical byproducts.",
    supply: { fertilizers: 0.5, chemicals: 0.1 },
    demand: { chemicals: 0.1, energy: 0.15, oil: 0.08, freight: 0.08, vehicles: 0.1 },
  },
  {
    id: "pharmaceuticals",
    minDecade: "1950",
    name: "Pharmaceuticals",
    description:
      "High-value drug manufacturing with regulated lab processes and higher technical inputs.",
    supply: { pharmaceuticals: 0.45, chemicals: 0.1 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: {
      chemicals: 0.154,
      electronics: 0.093,
      software: 0.077,
      vehicles: 0.077,
      energy: 0.062,
      freight: 0.039,
    },
  },
  {
    id: "plastics",
    minDecade: "1940",
    name: "Plastics & Polymers",
    description:
      "Petroleum-derived resin and polymer production for automotive, packaging, and construction industries. Heavy oil feedstock consumption.",
    supply: { plastics: 0.45, chemicals: 0.1 },
    demand: { oil: 0.206, energy: 0.123, chemicals: 0.066, freight: 0.066, vehicles: 0.041 },
  },
];
