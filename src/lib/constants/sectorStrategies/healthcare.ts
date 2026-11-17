import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

export const HEALTHCARE_STRATEGIES: SectorStrategy[] = [
  {
    id: "gene_therapy_scale",
    requiresTechUnlock: true,
    minDecade: "2049",
    researchThreshold: 5000,
    name: "Gene Therapy at Scale",
    description:
      "Curative gene therapies made in volume. Strong care output with a medicine co-product, held back by lab chemicals, compute and a heavy regulatory bill.",
    supply: { healthcare_services: 0.56, pharmaceuticals: 0.12 },
    demand: {
      chemicals: 0.12,
      electronics: 0.1,
      software: 0.12,
      energy: 0.06,
      consulting_services: 0.08,
    },
  },
  {
    id: "biofoundry",
    requiresTechUnlock: true,
    minDecade: "2039",
    name: "Biofoundry Biologics",
    description:
      "Automated labs that design and grow engineered biologics. Strong output with a pharmaceutical co-product, paid for with heavy software, electronics and lab chemical inputs.",
    supply: { healthcare_services: 0.52, pharmaceuticals: 0.1 },
    demand: { software: 0.14, electronics: 0.12, chemicals: 0.08, energy: 0.05, plastics: 0.04 },
  },
  {
    id: "telehealth",
    requiresTechUnlock: true,
    minDecade: "2009",
    name: "Telehealth Network",
    description:
      "Remote, software-driven care: high service output at low facility cost, leaning on software and electronics.",
    supply: { healthcare_services: 0.55 },
    demand: { software: 0.18, electronics: 0.12, pharmaceuticals: 0.08, energy: 0.05 },
  },
  {
    id: "standard",
    name: "Standard",
    description: "General patient care delivery across clinics, hospitals, and care networks.",
    // Reduced pharma 0.15→0.11 and electronics 0.15→0.11 to match SECTOR_DEMAND update.
    supply: { healthcare_services: 0.5 },
    demand: {
      pharmaceuticals: 0.11,
      electronics: 0.11,
      software: 0.12,
      energy: 0.05,
      real_estate_services: 0.04,
      food: 0.05,
      vehicles: 0.025,
      plastics: 0.06,
    },
  },
  {
    id: "biotech",
    name: "Hospital Networks",
    description:
      "Large integrated hospital systems with more capacity and heavier staffing, technology, and facility needs.",
    supply: { healthcare_services: 0.6 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: {
      pharmaceuticals: 0.15,
      electronics: 0.104,
      software: 0.084,
      energy: 0.052,
      real_estate_services: 0.039,
      food: 0.039,
      vehicles: 0.019,
      plastics: 0.06,
    },
  },
  {
    id: "pharma_mass",
    name: "Outpatient & Preventive",
    description:
      "Lower-cost outpatient, urgent care, and preventive medicine delivery with lighter facility overhead.",
    supply: { healthcare_services: 0.45 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: {
      pharmaceuticals: 0.12,
      software: 0.124,
      consulting_services: 0.062,
      electronics: 0.077,
      real_estate_services: 0.023,
      food: 0.023,
      vehicles: 0.015,
      plastics: 0.04,
    },
  },
];
