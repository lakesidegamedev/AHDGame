import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

export const AGRICULTURE_STRATEGIES: SectorStrategy[] = [
  {
    id: "cellular_agriculture",
    requiresTechUnlock: true,
    minDecade: "2039",
    name: "Cellular Agriculture",
    description:
      "Food grown from cell cultures in bioreactors. Needs almost no land or fertilizer, but runs on large amounts of energy and growth media chemicals.",
    supply: { food: 0.55 },
    demand: { energy: 0.26, chemicals: 0.12, electronics: 0.05, software: 0.05 },
  },
  {
    id: "vertical_farming",
    requiresTechUnlock: true,
    minDecade: "2019",
    name: "Vertical Farming",
    description:
      "Stacked indoor production: high food yield with almost no fertilizer, but a heavy appetite for energy, electronics and software.",
    supply: { food: 0.5 },
    demand: { energy: 0.28, electronics: 0.12, software: 0.1, construction_services: 0.08 },
  },
  {
    id: "precision_ag",
    requiresTechUnlock: true,
    minDecade: "2029",
    name: "Precision Agriculture",
    description:
      "Autonomous, sensor-driven farming. High food output with software and electronics inputs, lighter on fertilizer.",
    supply: { food: 0.56 },
    demand: { fertilizers: 0.08, energy: 0.12, software: 0.1, electronics: 0.08 },
  },
  {
    id: "standard",
    name: "Traditional",
    description: "Conventional farming with standard fertilizer and machinery inputs.",
    // Reduced food output 0.55→0.50: food moved to oversupply (D/S ~0.85×) after the
    // prior supply boost. Lower rate rebalances toward target D/S.
    supply: { food: 0.5 },
    demand: { fertilizers: 0.15, vehicles: 0.1, energy: 0.1, freight: 0.08, plastics: 0.05 },
  },
  {
    id: "industrial",
    minDecade: "1940",
    name: "Industrial",
    description:
      "Large-scale industrial agriculture. Higher yields through intensive fertilizer use and energy.",
    // Reduced food output 0.60→0.54 proportionally.
    supply: { food: 0.54 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: { fertilizers: 0.218, energy: 0.131, oil: 0.087, vehicles: 0.087, plastics: 0.09 },
  },
  {
    id: "sustainable",
    minDecade: "1960",
    name: "Sustainable",
    description:
      "Organic and regenerative farming. Lower output but reduced fertilizer dependency.",
    // Reduced food output 0.40→0.36 proportionally.
    supply: { food: 0.36 },
    demand: { fertilizers: 0.05, vehicles: 0.05, freight: 0.1, software: 0.08, plastics: 0.03 },
  },
];
