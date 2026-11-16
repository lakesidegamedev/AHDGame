import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

export const MANUFACTURING_STRATEGIES: SectorStrategy[] = [
  {
    id: "humanoid_robotics",
    requiresTechUnlock: true,
    minDecade: "2039",
    name: "Humanoid Robotics",
    description:
      "General-purpose robots built and deployed on the line. High electronics and steel output, with heavy rare earth, energy and software demand for actuators and control.",
    supply: { electronics: 0.3, steel: 0.25 },
    demand: { electronics: 0.12, rare_earth: 0.14, energy: 0.14, software: 0.1 },
  },
  {
    id: "additive_manufacturing",
    requiresTechUnlock: true,
    minDecade: "2009",
    name: "Additive Manufacturing",
    description:
      "3D-printed parts and electronics with minimal tooling: flexible electronics-heavy output, demanding rare earths, energy and polymers.",
    supply: { electronics: 0.22, steel: 0.22, building_materials: 0.1 },
    demand: { rare_earth: 0.12, energy: 0.2, software: 0.1, plastics: 0.12 },
  },
  {
    id: "autonomous_factory",
    requiresTechUnlock: true,
    minDecade: "2029",
    name: "Autonomous Factory",
    description:
      "Lights-out production with robotics and AI. Strong steel output at low labor, demanding electronics and software.",
    supply: { steel: 0.45, building_materials: 0.18 },
    demand: { energy: 0.18, electronics: 0.15, software: 0.1, iron: 0.1 },
  },
  {
    id: "standard",
    name: "Standard",
    description:
      "Balanced steel, building materials and vehicles production from iron and coal inputs.",
    supply: { steel: 0.4, building_materials: 0.2, vehicles: 0.5 },
    demand: {
      energy: 0.18,
      iron: 0.13,
      coal: 0.1,
      electronics: 0.08,
      freight: 0.08,
      real_estate_services: 0.03,
      plastics: 0.07,
    },
  },
  {
    id: "heavy_metals",
    name: "Heavy Metals",
    description:
      "Focused steel and metals production. Higher steel output, heavier iron and coal consumption.",
    // Reduced iron 0.25→0.20 and coal 0.20→0.16 to ease pressure on two of the worst
    // shortages (iron D/S ~3.4×, coal ~2.1×) without removing the heavy-metals flavor.
    supply: { steel: 0.55 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: { iron: 0.19, coal: 0.123, energy: 0.189, freight: 0.082, plastics: 0.03 },
  },
  {
    id: "electronics_manufacturing",
    minDecade: "1979",
    name: "Electronics Manufacturing",
    description:
      "Circuit boards, components, and consumer electronics. Produces electronics alongside steel, demands rare earth.",
    supply: { electronics: 0.3, steel: 0.2 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: { rare_earth: 0.138, iron: 0.1, energy: 0.184, chemicals: 0.092, plastics: 0.1 },
  },
  // Vehicle lines for manufacturing plants retooled to build cars and trucks.
  {
    id: "vehicle_assembly",
    name: "Vehicle Assembly",
    description:
      "Retool the plant to build cars. Produces vehicles from steel, iron and electronics.",
    supply: { vehicles: 0.5 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: {
      steel: 0.177,
      iron: 0.08,
      electronics: 0.11,
      energy: 0.084,
      freight: 0.067,
      real_estate_services: 0.017,
      plastics: 0.08,
    },
  },
  {
    id: "vehicle_heavy_machinery",
    name: "Trucks and Heavy Machinery",
    description:
      "Retool the plant to build trucks and construction equipment. Steel-intensive vehicle output.",
    supply: { vehicles: 0.55 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: {
      steel: 0.22,
      iron: 0.12,
      energy: 0.099,
      freight: 0.076,
      plastics: 0.05,
      advertising: 0.05,
    },
  },
];
