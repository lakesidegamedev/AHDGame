import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

export const TELECOMMUNICATIONS_STRATEGIES: SectorStrategy[] = [
  {
    id: "orbital_logistics",
    requiresTechUnlock: true,
    minDecade: "2039",
    name: "Orbital Constellations",
    description:
      "Large satellite constellations that carry network service to anywhere on the map. Very heavy electronics and launch costs, and rare earths for the payloads.",
    supply: { network_services: 0.58, software: 0.1 },
    demand: {
      electronics: 0.2,
      energy: 0.08,
      rare_earth: 0.07,
      consulting_services: 0.06,
      steel: 0.04,
    },
  },
  {
    id: "mobile_5g",
    requiresTechUnlock: true,
    minDecade: "2029",
    name: "5G / 6G Networks",
    description:
      "Dense next-gen wireless with computing power. Network-services output with strong electronics and software draw.",
    supply: { network_services: 0.55, software: 0.15 },
    demand: { electronics: 0.18, energy: 0.12, rare_earth: 0.05, consulting_services: 0.08 },
  },
  {
    id: "standard",
    name: "Standard",
    description: "Traditional telecom infrastructure and services.",
    // Added network_services supply 0.40 — unique output for telecom differentiation.
    // Reduced electronics 0.25 to 0.18 and rare_earth (covers copper) 0.12 to 0.09 to match SECTOR_DEMAND update.
    supply: { software: 0.2, network_services: 0.4 },
    demand: {
      electronics: 0.18,
      energy: 0.1,
      building_materials: 0.06,
      construction_services: 0.08,
      real_estate_services: 0.03,
      rare_earth: 0.09,
    },
  },
  {
    id: "wireline",
    name: "Wireline Network",
    description:
      "Copper-wire telephony and exchanges. Lower scarce-component intensity: less electronics, rare earth and construction per unit of network output, substituting toward abundant building materials and steel. Smaller output than Standard, but cheaper to run when components are dear. Available in every era.",
    // Demand audit step 5: the optional cheaper telecom recipe. Cuts the
    // dearest inputs hardest (rare_earth 0.09→0.04, electronics 0.18→0.10,
    // construction_services 0.08→0.04, energy 0.10→0.08) while holding
    // output composition, so margin survives component shortages that sink
    // Standard. Opt-in only: foundings still land on Standard, and NPP
    // retool adopts it solely on price advantage like any other recipe.
    supply: { software: 0.1, network_services: 0.35 },
    demand: {
      electronics: 0.1,
      energy: 0.08,
      building_materials: 0.07,
      construction_services: 0.04,
      steel: 0.05,
      real_estate_services: 0.03,
      rare_earth: 0.04,
    },
  },
  {
    id: "infrastructure",
    name: "5G/Infrastructure",
    description:
      "Next-gen network buildout. High network service output with heavier infrastructure investment.",
    // Network-services specialist: 0.55 network_services (up from 0.35) and 0.10 software.
    // Demand reflects physical infrastructure capex (construction, steel) rather than
    // ongoing component consumption - electronics lowered to 0.12, rare_earth (covers copper) to 0.06.
    supply: { software: 0.1, network_services: 0.55 },
    demand: {
      construction_services: 0.116,
      electronics: 0.092,
      energy: 0.092,
      steel: 0.062,
      rare_earth: 0.046,
      building_materials: 0.039,
    },
  },
  {
    id: "cloud",
    requiresTechUnlock: true,
    minDecade: "2009",
    name: "Cloud Services",
    description: "Data centers and cloud computing. High software output, energy-intensive.",
    // Added network_services supply 0.30. Reduced energy 0.20→0.18 (efficiency gains).
    supply: { software: 0.35, network_services: 0.3 },
    demand: { energy: 0.18, electronics: 0.15, real_estate_services: 0.04 },
  },
];
