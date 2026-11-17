import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

export const ENERGY_STRATEGIES: SectorStrategy[] = [
  {
    id: "fusion_commercial",
    requiresTechUnlock: true,
    minDecade: "2049",
    researchThreshold: 6000,
    name: "Commercial Fusion",
    description:
      "Fleet-scale fusion plants that follow the pilots. The highest clean output, bought with the heaviest rare earth, electronics, steel and licensing bill of any power method.",
    supply: { energy: 0.92 },
    demand: {
      rare_earth: 0.14,
      electronics: 0.16,
      steel: 0.16,
      chemicals: 0.1,
      consulting_services: 0.12,
    },
  },
  {
    id: "grid_storage_utility",
    requiresTechUnlock: true,
    minDecade: "2039",
    name: "Grid-Scale Storage Utility",
    description:
      "Long-duration storage plants that firm intermittent supply and sell balancing power. Heavy chemical, steel and electronics inputs for the storage medium and its housings.",
    supply: { energy: 0.72 },
    demand: {
      chemicals: 0.18,
      steel: 0.15,
      electronics: 0.1,
      rare_earth: 0.05,
      construction_services: 0.08,
    },
  },
  {
    id: "advanced_fission",
    requiresTechUnlock: true,
    minDecade: "2039",
    name: "Advanced Fission",
    description:
      "Factory-built small modular reactors with high firm output. Rare earths stand in for enriched fuel, and licensing and safety work add a heavy consulting and steel bill.",
    // rare_earth is the critical-minerals and nuclear fuel proxy (no uranium commodity, #4579).
    supply: { energy: 0.8 },
    demand: {
      steel: 0.17,
      rare_earth: 0.1,
      chemicals: 0.08,
      consulting_services: 0.13,
      construction_services: 0.1,
    },
  },
  {
    id: "fracking",
    requiresTechUnlock: true,
    minDecade: "2009",
    name: "Hydraulic Fracturing",
    description:
      "Maximal hydrocarbon output: energy, oil and gas all flow, at the cost of heavy steel, chemical, water-handling and sand inputs.",
    supply: { energy: 0.6, oil: 0.14, natural_gas: 0.14 },
    demand: {
      steel: 0.2,
      chemicals: 0.18,
      iron: 0.08,
      freight: 0.1,
      construction_services: 0.1,
    },
  },
  {
    id: "standard",
    name: "Conventional",
    description: "Traditional fossil-fuel energy generation with established infrastructure.",
    // Coal-heavy conventional power retires with the 2039 tier: closed to new
    // plants, rising running costs for old ones, discounted conversion.
    sunsetDecade: "2039",
    successorIds: ["advanced_fission", "wind", "solar", "gas_fired", "hydroelectric"],
    // Matches SECTOR_SUPPLY/SECTOR_DEMAND in commodities.ts (energy output 0.65, oil 0.07, rare_earth 0.04; rare_earth covers copper).
    supply: { energy: 0.65 },
    demand: {
      steel: 0.22,
      coal: 0.15,
      oil: 0.07,
      vehicles: 0.03,
      construction_services: 0.05,
      rare_earth: 0.04,
      natural_gas: 0.12,
    },
  },
  {
    id: "wind",
    requiresTechUnlock: true,
    minDecade: "1999",
    name: "Wind Power",
    description:
      "Onshore and offshore turbine farms. Zero emissions, but output comes and goes with the weather, and towers and generators need steel and rare earth magnets.",
    supply: { energy: 0.56 },
    demand: {
      steel: 0.18,
      rare_earth: 0.09,
      electronics: 0.08,
      building_materials: 0.1,
      construction_services: 0.08,
    },
  },
  {
    id: "solar",
    requiresTechUnlock: true,
    minDecade: "2009",
    name: "Solar Power",
    description:
      "Utility-scale solar farms. Zero emissions and intermittent like wind, with a heavy electronics bill for panels and inverters.",
    supply: { energy: 0.54 },
    demand: {
      electronics: 0.22,
      rare_earth: 0.06,
      building_materials: 0.12,
      steel: 0.06,
      construction_services: 0.06,
    },
  },
  {
    id: "hydroelectric",
    name: "Hydroelectric",
    description:
      "Dams and run-of-river stations. Zero emissions, near-firm output and cheap to run, but output per site is modest and the civil works need building materials and steel.",
    supply: { energy: 0.52 },
    demand: {
      building_materials: 0.16,
      steel: 0.12,
      construction_services: 0.1,
      freight: 0.04,
    },
  },
  {
    id: "gas_fired",
    name: "Gas-Fired",
    description:
      "Gas turbine and combined-cycle plants. Firm on-demand power with about half the emissions of coal, but the fuel bill tracks the natural gas price.",
    supply: { energy: 0.62 },
    demand: {
      natural_gas: 0.3,
      steel: 0.14,
      construction_services: 0.06,
      rare_earth: 0.03,
    },
  },
  {
    id: "nuclear",
    requiresTechUnlock: true,
    name: "Nuclear Expansion",
    description:
      "High energy output from nuclear reactors. Heavy steel and chemical requirements, plus strict regulation.",
    // Reduced steel 0.30→0.20 (nuclear is a dominant steel consumer at 125/202 sectors);
    // added iron 0.08 for structural fabrication as a more targeted input.
    supply: { energy: 0.7 },
    demand: {
      steel: 0.2,
      iron: 0.08,
      chemicals: 0.15,
      consulting_services: 0.1,
      construction_services: 0.1,
    },
  },
  {
    id: "smart_grid",
    requiresTechUnlock: true,
    minDecade: "2009",
    name: "Smart Grid",
    description:
      "Sensor-rich, demand-responsive generation. High electronics and software draw, strong steady output.",
    supply: { energy: 0.62 },
    demand: {
      electronics: 0.2,
      software: 0.12,
      rare_earth: 0.06,
      steel: 0.08,
      construction_services: 0.06,
    },
  },
  {
    id: "fusion",
    requiresTechUnlock: true,
    minDecade: "2029",
    name: "Fusion Generation",
    description:
      "Pilot fusion reactors deliver the highest clean output, demanding rare earths, electronics, and steel.",
    supply: { energy: 0.85 },
    demand: {
      rare_earth: 0.12,
      electronics: 0.15,
      steel: 0.15,
      chemicals: 0.1,
      consulting_services: 0.1,
    },
  },
];
