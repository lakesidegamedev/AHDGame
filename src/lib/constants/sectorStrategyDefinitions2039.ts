import type { SectorStrategy } from "./sectorStrategyTypes";

/** Production methods that open with the 2039 research tier, appended to each sector's list. */
export const TIER_2039_STRATEGIES: Record<string, SectorStrategy[]> = {
  financial: [
    {
      id: "agent_asset_management",
      requiresTechUnlock: true,
      minDecade: "2039",
      name: "Agent Asset Management",
      description:
        "Agents run portfolios and advice for every client tier. High financial output paid for with software, computing power and network traffic instead of staff.",
      buildTurns: 96,
      downside:
        "A single model error spreads across every client book at once, so losses arrive together.",
      supply: { financial_services: 0.62 },
      demand: {
        software: 0.17,
        electronics: 0.07,
        consulting_services: 0.06,
        energy: 0.04,
        network_services: 0.04,
      },
    },
  ],
  retail: [
    {
      id: "agentic_storefronts",
      requiresTechUnlock: true,
      minDecade: "2039",
      name: "Agentic Storefronts",
      description:
        "Shoppers' agents order straight from the store's agents. High retail output that leans on freight, software and electronics.",
      buildTurns: 72,
      downside:
        "Stores run on software and data feeds, and shoppers drift away when a platform goes down.",
      supply: { retail: 0.6 },
      demand: {
        freight: 0.14,
        software: 0.1,
        electronics: 0.06,
        energy: 0.05,
        advertising: 0.03,
      },
    },
  ],
  manufacturing_vehicles: [
    {
      id: "solid_state_vehicles",
      requiresTechUnlock: true,
      minDecade: "2039",
      name: "Solid-State Vehicles",
      description:
        "Solid-state battery vehicles built on mass cell lines. Heavy electronics, rare earth and software demand with little steel.",
      buildTurns: 144,
      downside:
        "Three-year retooling and scarce battery minerals keep input costs high and volatile.",
      supply: { vehicles: 0.5 },
      demand: {
        electronics: 0.16,
        rare_earth: 0.1,
        energy: 0.1,
        software: 0.1,
        steel: 0.08,
        plastics: 0.05,
      },
    },
  ],
  real_estate: [
    {
      id: "agentic_property_operations",
      requiresTechUnlock: true,
      minDecade: "2039",
      name: "Agentic Property Operations",
      description:
        "Agents run leasing, repairs and billing across whole portfolios. More service per building, paid for with software, electronics and power.",
      buildTurns: 96,
      downside:
        "Buildings depend on sensors and network links; an outage leaves tenants without service.",
      supply: { real_estate_services: 0.55 },
      demand: {
        construction_services: 0.1,
        software: 0.1,
        electronics: 0.08,
        energy: 0.08,
        building_materials: 0.05,
      },
    },
  ],
  extraction: [
    {
      id: "autonomous_deep_mining",
      requiresTechUnlock: true,
      minDecade: "2039",
      name: "Autonomous Deep Mining",
      description:
        "Driverless fleets work deep and remote deposits around the clock. High rare earth output that needs power, chemicals and electronics.",
      buildTurns: 192,
      downside:
        "Four-year sinking of deep shafts and a heavy energy bill before the first ore comes up.",
      supply: { rare_earth: 0.7 },
      demand: {
        energy: 0.2,
        chemicals: 0.12,
        electronics: 0.1,
        vehicles: 0.08,
        freight: 0.08,
      },
    },
  ],
};
