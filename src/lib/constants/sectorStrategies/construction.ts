import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

export const CONSTRUCTION_STRATEGIES: SectorStrategy[] = [
  {
    id: "printed_mass_timber",
    requiresTechUnlock: true,
    minDecade: "2039",
    name: "Printed Mass Timber",
    description:
      "Engineered timber panels cut and printed by machine and assembled fast on site. Leans on timber and software instead of steel and concrete.",
    supply: { construction_services: 0.52, building_materials: 0.1 },
    demand: {
      timber: 0.16,
      software: 0.08,
      electronics: 0.05,
      energy: 0.08,
      steel: 0.04,
      plastics: 0.05,
    },
  },
  {
    id: "modular_construction",
    requiresTechUnlock: true,
    minDecade: "2019",
    name: "Factory-built Modular Construction",
    description:
      "Factory-built room modules: faster, higher output that shifts cost to freight and steel.",
    supply: { construction_services: 0.5, building_materials: 0.15 },
    demand: { steel: 0.15, freight: 0.12, energy: 0.1 },
  },
  {
    id: "standard",
    name: "General Contracting",
    description: "Balanced residential, commercial, and civil construction services.",
    // Reduced building_materials 0.20 to 0.15, rare_earth (covers copper) 0.06 to 0.04, natural_gas 0.03 to 0.02,
    // timber 0.10 to 0.08.
    supply: { construction_services: 0.45 },
    demand: {
      building_materials: 0.13,
      steel: 0.13,
      energy: 0.12,
      vehicles: 0.08,
      financial_services: 0.05,
      rare_earth: 0.04,
      natural_gas: 0.02,
      timber: 0.07,
      plastics: 0.06,
    },
  },
  {
    id: "infrastructure",
    name: "Infrastructure Buildout",
    description:
      "Roads, utilities, transit, and heavy civil work. Higher output with heavier materials demand.",
    // Added building_materials co-production 0.08 (prefab elements, road aggregate).
    // Reduced building_materials demand 0.30→0.22 and vehicles 0.12→0.10 to ease stacking.
    supply: { construction_services: 0.55, building_materials: 0.08 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: {
      building_materials: 0.18,
      steel: 0.105,
      energy: 0.081,
      vehicles: 0.05,
      consulting_services: 0.05,
      plastics: 0.06,
    },
  },
  {
    id: "modular",
    name: "Modular Construction",
    description:
      "Prefabricated and software-assisted construction. Lower raw-material intensity with more tech inputs.",
    supply: { construction_services: 0.4 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: {
      building_materials: 0.18,
      steel: 0.058,
      electronics: 0.07,
      software: 0.046,
      energy: 0.058,
      plastics: 0.09,
    },
  },
];
