import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

export const TECHNOLOGY_STRATEGIES: SectorStrategy[] = [
  {
    id: "neural_interfaces",
    requiresTechUnlock: true,
    minDecade: "2049",
    researchThreshold: 7000,
    name: "Neural Interfaces",
    description:
      "Brain-computer interfaces for work and medicine. High-value devices and software, with rare earths, power and a large compliance and safety bill.",
    supply: { software: 0.48, electronics: 0.22 },
    demand: { rare_earth: 0.08, energy: 0.14, consulting_services: 0.12, chemicals: 0.04 },
  },
  {
    id: "agentic_services",
    requiresTechUnlock: true,
    minDecade: "2039",
    name: "Agentic Services",
    description:
      "Software agents sold as a service that run whole business processes for clients. Top software output, with the heaviest energy draw in the sector.",
    supply: { software: 0.66 },
    demand: { energy: 0.22, electronics: 0.08, rare_earth: 0.03, consulting_services: 0.03 },
  },
  {
    id: "quantum_computing",
    requiresTechUnlock: true,
    minDecade: "2029",
    name: "Quantum Computing",
    description:
      "Frontier quantum services: premium software output backed by exotic hardware, hungry for rare earths and energy.",
    supply: { software: 0.5, electronics: 0.18 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: { rare_earth: 0.117, energy: 0.195, consulting_services: 0.078 },
  },
  {
    id: "ai_platforms",
    requiresTechUnlock: true,
    minDecade: "2029",
    name: "AI Platforms",
    description:
      "Frontier-AI products and services. Software-dominant output with heavy computing power and energy draw.",
    supply: { software: 0.6 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: { energy: 0.175, electronics: 0.096, consulting_services: 0.08, rare_earth: 0.04 },
  },
  {
    id: "standard",
    name: "Standard",
    description: "Balanced hardware and software development.",
    supply: { electronics: 0.35, software: 0.35 },
    demand: {
      energy: 0.15,
      rare_earth: 0.08,
      steel: 0.05,
      consulting_services: 0.08,
      real_estate_services: 0.03,
    },
  },
  {
    id: "hardware",
    name: "Hardware Focus",
    description:
      "Semiconductor fabs and chip manufacturing. High electronics output but heavy raw material needs.",
    supply: { electronics: 0.55, software: 0.15 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: { energy: 0.15, rare_earth: 0.113, steel: 0.075, chemicals: 0.075 },
  },
  {
    id: "software",
    name: "Software Focus",
    description:
      "Cloud platforms and enterprise software. Lighter on raw materials, heavier on consulting.",
    supply: { software: 0.55, electronics: 0.15 },
    demand: { consulting_services: 0.15, energy: 0.1 },
  },
];
