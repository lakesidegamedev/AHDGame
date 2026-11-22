import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

// At 1991 base prices, 41.6% materials plus 19.8% labour and 3.6% overhead leave a 35% margin.
const STANDARD_INPUT_SCALE = 8 / 9;
const standardDemand = {
  energy: 0.159 * STANDARD_INPUT_SCALE,
  vehicles: 0.158 * STANDARD_INPUT_SCALE,
  software: 0.079 * STANDARD_INPUT_SCALE,
  food: 0.048 * STANDARD_INPUT_SCALE,
  real_estate_services: 0.024 * STANDARD_INPUT_SCALE,
};

export const LOGISTICS_STRATEGIES: SectorStrategy[] = [
  {
    id: "orbital_logistics",
    requiresTechUnlock: true,
    minDecade: "2039",
    name: "Orbital Logistics",
    description:
      "Satellite tracking and orbital relay networks that run freight and remote services anywhere. Heavy electronics, energy and vehicle inputs.",
    supply: { freight: 0.6, consulting_services: 0.12 },
    demand: { electronics: 0.14, energy: 0.13, vehicles: 0.12, software: 0.1 },
  },
  {
    id: "autonomous_freight",
    requiresTechUnlock: true,
    minDecade: "2029",
    name: "Autonomous Freight",
    description:
      "Driverless trucking and drones: top freight output powered by vehicles, energy and software instead of labor.",
    supply: { freight: 0.7 },
    demand: { vehicles: 0.15, energy: 0.15, software: 0.12, electronics: 0.08 },
  },
  {
    id: "standard",
    name: "Standard",
    description: "Traditional freight and consulting logistics services.",
    supply: { freight: 0.45, consulting_services: 0.25 },
    demand: { ...standardDemand },
  },
  {
    id: "freight_only",
    name: "Freight Only",
    description:
      "Pure haulage with no consulting arm: all output is freight, with the same fleet and running costs as Standard.",
    supply: { freight: 0.7 },
    demand: { ...standardDemand },
  },
  {
    id: "automated",
    requiresTechUnlock: true,
    minDecade: "1989",
    name: "Automated Logistics",
    description: "Warehouse robotics and autonomous fleet management. Higher freight output.",
    supply: { freight: 0.5, consulting_services: 0.15 },
    demand: { software: 0.2, electronics: 0.15, energy: 0.15, food: 0.05 },
  },
  {
    id: "full_service",
    name: "Full-Service",
    description:
      "End-to-end supply chain management with high-touch consulting. Consulting-heavy output.",
    supply: { freight: 0.4, consulting_services: 0.35 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: {
      vehicles: 0.166,
      energy: 0.134,
      software: 0.101,
      food: 0.047,
      real_estate_services: 0.02,
    },
  },
];
