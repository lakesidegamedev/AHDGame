import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

export const REAL_ESTATE_STRATEGIES: SectorStrategy[] = [
  {
    id: "autonomous_districts",
    requiresTechUnlock: true,
    minDecade: "2049",
    researchThreshold: 5000,
    requiresLaneResearch: [
      { lane: "technology", threshold: 3000 },
      { lane: "energy", threshold: 3000 },
    ],
    name: "Autonomous Districts",
    description:
      "Whole neighborhoods run by agents, storage and sensors. More service per building, paid for with software, electronics, power and constant network traffic.",
    supply: { real_estate_services: 0.6 },
    demand: {
      software: 0.14,
      electronics: 0.1,
      energy: 0.1,
      network_services: 0.06,
      construction_services: 0.06,
    },
  },
  {
    id: "proptech",
    requiresTechUnlock: true,
    minDecade: "2019",
    name: "PropTech Platforms",
    description:
      "Smart-building and digital-leasing operations: higher service output at lower overhead via software.",
    supply: { real_estate_services: 0.55 },
    demand: { software: 0.15, electronics: 0.08, energy: 0.06 },
  },
  {
    id: "standard",
    name: "Standard",
    description: "Mixed residential and commercial property ownership, leasing, and development.",
    // Reduced financial_services 0.15→0.10 to match SECTOR_DEMAND update.
    supply: { real_estate_services: 0.45 },
    demand: {
      construction_services: 0.2,
      building_materials: 0.12,
      steel: 0.08,
      energy: 0.08,
      financial_services: 0.1,
    },
  },
  {
    id: "commercial",
    name: "Commercial Development",
    description:
      "Office towers and retail complexes. Higher leasing output with heavier construction and financing needs.",
    // Reduced financial_services 0.20→0.13 proportionally.
    supply: { real_estate_services: 0.5 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: {
      construction_services: 0.23,
      steel: 0.138,
      financial_services: 0.12,
      consulting_services: 0.092,
    },
  },
  {
    id: "green_building",
    name: "Green Building",
    description:
      "Efficient buildings and smart property operations. Lower leasing output, more technology-heavy inputs.",
    supply: { real_estate_services: 0.38 },
    demand: {
      construction_services: 0.18,
      electronics: 0.15,
      software: 0.1,
      building_materials: 0.12,
    },
  },
];
