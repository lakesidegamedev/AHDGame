import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

export const MEDIA_STRATEGIES: SectorStrategy[] = [
  {
    id: "personalised_media",
    requiresTechUnlock: true,
    minDecade: "2039",
    name: "Personalised Media",
    description:
      "Every reader and viewer gets a feed assembled for them. Strong ad output, paid for with heavy software, energy and network demand.",
    supply: { advertising: 0.62 },
    demand: { software: 0.18, energy: 0.13, network_services: 0.1, electronics: 0.04 },
  },
  {
    id: "streaming_media",
    requiresTechUnlock: true,
    minDecade: "2009",
    name: "Streaming Media",
    description:
      "Direct-to-consumer streaming: strong ad output that runs on software, networks and energy.",
    supply: { advertising: 0.6 },
    demand: { software: 0.15, network_services: 0.12, energy: 0.08 },
  },
  {
    id: "standard",
    name: "Standard",
    description: "Mixed traditional and digital media operations.",
    supply: { advertising: 0.5 },
    demand: {
      software: 0.15,
      electronics: 0.1,
      consulting_services: 0.06,
      real_estate_services: 0.03,
    },
  },
  {
    id: "digital_first",
    minDecade: "1999",
    name: "Digital-First",
    description:
      "Streaming and online-first media. Co-produces software platforms alongside advertising.",
    supply: { advertising: 0.4, software: 0.15 },
    demand: { software: 0.2, electronics: 0.15 },
  },
  {
    id: "legacy_broadcast",
    name: "Legacy Broadcast",
    description:
      "Television and radio infrastructure. Higher advertising output but aging infrastructure costs.",
    supply: { advertising: 0.55 },
    demand: { electronics: 0.15, energy: 0.1 },
  },
];
