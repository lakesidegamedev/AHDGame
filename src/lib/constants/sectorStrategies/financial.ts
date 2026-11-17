import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

export const FINANCIAL_STRATEGIES: SectorStrategy[] = [
  {
    id: "algorithmic_trading",
    requiresTechUnlock: true,
    minDecade: "2009",
    name: "Algorithmic Trading",
    description:
      "Automated markets: peak financial-services output powered by software and computing power instead of staff.",
    supply: { financial_services: 0.6 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: { software: 0.177, electronics: 0.089, consulting_services: 0.071, energy: 0.053 },
  },
  {
    id: "standard",
    name: "Standard",
    description: "Traditional banking and financial services.",
    supply: { financial_services: 0.5 },
    demand: {
      software: 0.2,
      electronics: 0.05,
      consulting_services: 0.05,
      real_estate_services: 0.04,
    },
  },
  {
    id: "fintech",
    requiresTechUnlock: true,
    minDecade: "1999",
    name: "Fintech",
    description:
      "Digital-first financial services. Produces software alongside financial products.",
    supply: { financial_services: 0.45, software: 0.15 },
    demand: { software: 0.25, electronics: 0.15 },
  },
  {
    id: "traditional_banking",
    name: "Traditional Banking",
    description:
      "Branch-heavy retail banking with personal advisory services. High consulting overhead.",
    supply: { financial_services: 0.55 },
    demand: { consulting_services: 0.15, real_estate_services: 0.08 },
  },
];
