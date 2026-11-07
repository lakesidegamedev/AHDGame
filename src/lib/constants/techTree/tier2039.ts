/**
 * Tier "2039" (2039 to 2048) content for slots 1-9 of both lanes.
 *
 * Corporate lane theme: agentic operations, autonomous compliance and resilient
 * supply networks. Sector lanes carry the unlock nodes for the 2039 production
 * methods (see sectorStrategyDefinitions.ts, `minDecade: "2039"`). Slots follow
 * the fixed fork in ./selectors (SLOT_PARENT): 1 is the root, 2-4-6-8 and
 * 3-5-7-9 are the two branches. Slots 10-15 live in ./v3 under the same key.
 */
import type { OperatingSectorType } from "../corporations";
import type { NodeSpec } from "./nodes";

export const TIER_2039_CORPORATE: NodeSpec[] = [
  {
    name: "Agentic Operations Layer",
    description: "Agent teams run routine operations across every unit.",
    effects: [
      { kind: "plantOutput", pct: 0.03 },
      { kind: "growthCostReduction", pct: 0.07 },
    ],
  },
  {
    name: "Autonomous Compliance",
    description: "Agents file and audit regulatory work as it happens.",
    effects: [{ kind: "growthCostReduction", pct: 0.09 }],
  },
  {
    name: "Synthetic Customer Panels",
    description: "Simulated buyers test offers before launch.",
    effects: [{ kind: "marketingStrength", flat: 95 }],
  },
  {
    name: "Digital Twin of the Firm",
    description: "A live model of the company tests decisions first.",
    effects: [{ kind: "plantOutput", pct: 0.03 }],
  },
  {
    name: "Resilient Supply Networks",
    description: "Mapped, multi-sourced supply survives any single failure.",
    effects: [
      { kind: "logisticsStrength", flat: 38 },
      { kind: "growthCostReduction", pct: 0.04 },
    ],
  },
  {
    name: "Supplier Risk Mapping",
    description: "Live maps of every supplier tier flag trouble early.",
    effects: [{ kind: "logisticsStrength", flat: 32 }],
  },
  {
    name: "Agentic Procurement",
    description: "Buying agents source, contract and reorder alone.",
    effects: [{ kind: "growthCostReduction", pct: 0.09 }],
  },
  {
    name: "Regional Buffer Stocks",
    description: "Shared stock held near demand rides out shocks.",
    effects: [{ kind: "logisticsStrength", flat: 32 }],
  },
  {
    name: "Autonomous Contracting",
    description: "Agents negotiate and enforce routine contracts.",
    effects: [{ kind: "growthCostReduction", pct: 0.09 }],
  },
];

export const TIER_2039_SECTOR: Record<OperatingSectorType, NodeSpec[]> = {
  financial: [
    {
      name: "Agentic Wealth Managers",
      description: "Agents manage portfolios for every client tier.",
      effects: [
        { kind: "laborCostReduction", pct: 0.16 },
        { kind: "growthCostReduction", pct: 0.085 },
      ],
    },
    {
      name: "Tokenized Real Assets",
      description: "Fractional property and credit trade around the clock.",
      effects: [{ kind: "laborCostReduction", pct: 0.13 }],
    },
    {
      name: "Instant Cross-Border Settlement",
      description: "Linked ledgers settle payments in seconds.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Continuous Credit Scoring",
      description: "Live cash data prices loans as conditions change.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
    {
      name: "Embedded Finance",
      description: "Credit and insurance sold inside other firms' apps.",
      effects: [{ kind: "marketingStrength", flat: 95 }],
    },
    {
      name: "Autonomous Market Making",
      description: "Agents quote and hedge across every venue.",
      effects: [{ kind: "laborCostReduction", pct: 0.13 }],
    },
    {
      name: "Parametric Insurance",
      description: "Policies pay out automatically when data triggers.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
    {
      name: "Agentic Fraud Defense",
      description: "Agents catch and freeze fraud in flight.",
      effects: [{ kind: "laborCostReduction", pct: 0.13 }],
    },
    {
      name: "Climate Risk Underwriting",
      description: "Hazard models price physical risk precisely.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
  ],
  media: [
    {
      name: "Personalized Feeds",
      description: "Feeds assembled per reader unlock the Personalized Media method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "personalised_media" },
        { kind: "laborCostReduction", pct: 0.13 },
        { kind: "growthCostReduction", pct: 0.1 },
      ],
    },
    {
      name: "Audience Agents",
      description: "Agents learn each reader and pitch the right story.",
      effects: [{ kind: "marketingStrength", flat: 95 }],
    },
    {
      name: "Live Translation",
      description: "Every story publishes in every language at once.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
    {
      name: "Synthetic Presenters",
      description: "Generated anchors read the news on demand.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
    {
      name: "Agentic Reporting Desks",
      description: "Agents gather and draft routine stories.",
      effects: [{ kind: "laborCostReduction", pct: 0.085 }],
    },
    {
      name: "Provenance Watermarks",
      description: "Signed media proves its origin to readers.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
    {
      name: "Interactive Documentaries",
      description: "Viewers steer the story and stay longer.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
    {
      name: "Ambient Media",
      description: "Content follows the reader across every screen.",
      effects: [{ kind: "marketingStrength", flat: 95 }],
    },
    {
      name: "Generated Archives",
      description: "Back catalogs are recut into new formats cheaply.",
      effects: [{ kind: "growthCostReduction", pct: 0.1 }],
    },
  ],
  manufacturing: [
    {
      name: "General-Purpose Robots",
      description: "Humanoid robots unlock the Humanoid Robotics method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "humanoid_robotics" },
        { kind: "inputEfficiency", pct: 0.095 },
        { kind: "growthCostReduction", pct: 0.12 },
      ],
    },
    {
      name: "Robot Skill Libraries",
      description: "Shared skills teach every robot a new task.",
      effects: [{ kind: "inputEfficiency", pct: 0.095 }],
    },
    {
      name: "Recycled Magnets",
      description: "Magnet recovery cuts critical mineral buys.",
      effects: [{ kind: "inputEfficiency", pct: 0.08 }],
    },
    {
      name: "Agentic Production Planning",
      description: "Agents replan the floor as orders change.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Autonomous Material Flow",
      description: "Robots move stock without forklifts or drivers.",
      effects: [{ kind: "logisticsStrength", flat: 38 }],
    },
    {
      name: "Reconfigurable Cells",
      description: "Robot cells switch products within a shift.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Remanufacturing Lines",
      description: "Returned products are rebuilt at a fraction of new cost.",
      effects: [{ kind: "inputEfficiency", pct: 0.065 }],
    },
    {
      name: "Self-Calibrating Tools",
      description: "Tools measure and correct their own wear.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Defect-Free Forming",
      description: "Process control keeps scrap close to zero.",
      effects: [{ kind: "inputEfficiency", pct: 0.08 }],
    },
  ],
  chemical_industries: [
    {
      name: "Direct Air Capture",
      description: "Sorbent plants unlock the Direct Air Capture method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "direct_air_capture" },
        { kind: "inputEfficiency", pct: 0.11 },
        { kind: "growthCostReduction", pct: 0.1 },
      ],
    },
    {
      name: "Engineered Enzymes",
      description: "Designed enzymes run reactions at low heat.",
      effects: [{ kind: "inputEfficiency", pct: 0.095 }],
    },
    {
      name: "Electrified Crackers",
      description: "Electric heating replaces gas-fired furnaces.",
      effects: [{ kind: "inputEfficiency", pct: 0.08 }],
    },
    {
      name: "Autonomous Reactor Control",
      description: "Agents tune every reactor around the clock.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Biodegradable Polymers",
      description: "Plastics that break down win regulated markets.",
      effects: [{ kind: "inputEfficiency", pct: 0.08 }],
    },
    {
      name: "Carbon Mineralization",
      description: "Captured carbon is locked into stable solids.",
      effects: [{ kind: "inputEfficiency", pct: 0.08 }],
    },
    {
      name: "Agentic Route Discovery",
      description: "Agents search reaction routes overnight.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Solvent-Free Processing",
      description: "Dry processes cut solvent and energy use.",
      effects: [{ kind: "inputEfficiency", pct: 0.095 }],
    },
    {
      name: "Captured Carbon Feedstock",
      description: "Air-captured carbon replaces bought chemicals.",
      effects: [{ kind: "inputCost", commodity: "chemicals", pct: 0.2 }],
    },
  ],
  healthcare: [
    {
      name: "Biofoundries",
      description: "Automated design and test labs unlock the Biofoundry Biologics method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "biofoundry" },
        { kind: "laborCostReduction", pct: 0.16 },
        { kind: "growthCostReduction", pct: 0.085 },
      ],
    },
    {
      name: "Personalized Vaccines",
      description: "Tumor-matched vaccines open a premium market.",
      effects: [{ kind: "laborCostReduction", pct: 0.13 }],
    },
    {
      name: "Agentic Triage",
      description: "Agents route patients to the right care first time.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
    {
      name: "Hospital at Home",
      description: "Remote monitoring replaces many ward beds.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
    {
      name: "Preventive Genomics",
      description: "Whole-genome screening sells lifelong care plans.",
      effects: [{ kind: "marketingStrength", flat: 95 }],
    },
    {
      name: "In-Silico Trials",
      description: "Simulated patients shorten clinical trials.",
      effects: [{ kind: "laborCostReduction", pct: 0.13 }],
    },
    {
      name: "Robotic Nursing Aides",
      description: "Robots lift, fetch and monitor on every ward.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
    {
      name: "Off-the-Shelf Cell Therapies",
      description: "Donor cell therapies scale to many patients.",
      effects: [{ kind: "laborCostReduction", pct: 0.13 }],
    },
    {
      name: "Continuous Care Sensors",
      description: "Wearables catch decline before admission.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
  ],
  retail: [
    {
      name: "Agentic Shopping Assistants",
      description: "Customers' agents order direct from the store's agents.",
      effects: [
        { kind: "laborCostReduction", pct: 0.13 },
        { kind: "growthCostReduction", pct: 0.105 },
      ],
    },
    {
      name: "Autonomous Microstores",
      description: "Small unstaffed stores open in any building.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
    {
      name: "Robotic Micro-Fulfillment",
      description: "Back-of-store robots pick orders in minutes.",
      effects: [{ kind: "logisticsStrength", flat: 38 }],
    },
    {
      name: "Live Demand Forecasting",
      description: "Agents reprice and restock every hour.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
    {
      name: "Robot-Fed Delivery Lockers",
      description: "Automated lockers end missed deliveries.",
      effects: [{ kind: "logisticsStrength", flat: 32 }],
    },
    {
      name: "Circular Resale",
      description: "Returns and trade-ins are resold at a margin.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Waste-Free Inventory",
      description: "Perishables sell before they spoil.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
    {
      name: "Pre-Positioned Stock",
      description: "Inventory sits where agents predict the orders.",
      effects: [{ kind: "logisticsStrength", flat: 38 }],
    },
    {
      name: "Agent Loyalty Programs",
      description: "Rewards that customers' agents can read and use.",
      effects: [{ kind: "marketingStrength", flat: 95 }],
    },
  ],
  manufacturing_vehicles: [
    {
      name: "Solid-State Battery Lines",
      description: "Mass solid-state cells raise range and margin.",
      effects: [
        { kind: "inputEfficiency", pct: 0.12 },
        { kind: "growthCostReduction", pct: 0.085 },
      ],
    },
    {
      name: "Sodium-Ion Packs",
      description: "Cheap cells cut dependence on scarce metals.",
      effects: [{ kind: "inputEfficiency", pct: 0.095 }],
    },
    {
      name: "Fleet Software Subscriptions",
      description: "Owners pay monthly for driving features.",
      effects: [{ kind: "marketingStrength", flat: 75 }],
    },
    {
      name: "Gigacast Platforms",
      description: "Whole underbodies are cast in a single piece.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Bidirectional Charging",
      description: "Parked cars sell power back to the grid.",
      effects: [{ kind: "inputEfficiency", pct: 0.08 }],
    },
    {
      name: "Autonomy Data Engines",
      description: "Fleet data trains driving software faster.",
      effects: [{ kind: "inputEfficiency", pct: 0.095 }],
    },
    {
      name: "Robotic Final Assembly",
      description: "Robots fit interiors and wiring.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Magnet-Free Motors",
      description: "Motors that need no rare earth magnets.",
      effects: [{ kind: "inputEfficiency", pct: 0.095 }],
    },
    {
      name: "Battery Second Life",
      description: "Used packs are resold as grid storage.",
      effects: [{ kind: "logisticsStrength", flat: 32 }],
    },
  ],
  technology: [
    {
      name: "Agent Platforms",
      description: "Business-grade agents unlock the Agentic Services method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "agentic_services" },
        { kind: "plantOutput", pct: 0.033 },
        { kind: "growthCostReduction", pct: 0.105 },
      ],
    },
    {
      name: "Inference Chips",
      description: "Purpose-built chips cut the cost of every answer.",
      effects: [{ kind: "plantOutput", pct: 0.03 }],
    },
    {
      name: "Fault-Tolerant Quantum Systems",
      description: "Error-corrected machines solve useful problems.",
      effects: [{ kind: "plantOutput", pct: 0.033 }],
    },
    {
      name: "Agentic Software Factories",
      description: "Agents write, test and ship most code.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Personal Agents",
      description: "Assistants that act for each user.",
      effects: [{ kind: "marketingStrength", flat: 95 }],
    },
    {
      name: "Optical Interconnects",
      description: "Light links chips with less power.",
      effects: [{ kind: "plantOutput", pct: 0.03 }],
    },
    {
      name: "Verified Code Generation",
      description: "Proven-correct code cuts defect costs.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "On-Device Models",
      description: "Local models cut cloud and energy bills.",
      effects: [{ kind: "plantOutput", pct: 0.03 }],
    },
    {
      name: "Self-Repairing Infrastructure",
      description: "Systems detect and fix their own faults.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
  ],
  energy: [
    {
      name: "Long-Duration Storage Plants",
      description: "Multi-day storage unlocks the Grid-Scale Storage Utility method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "grid_storage_utility" },
        { kind: "inputEfficiency", pct: 0.065 },
      ],
    },
    {
      name: "Iron-Air Batteries",
      description: "Cheap rust-cycle cells store power for days.",
      effects: [{ kind: "inputEfficiency", pct: 0.095 }],
    },
    {
      name: "Grid Balancing Markets",
      description: "Selling firming power earns a premium.",
      effects: [
        { kind: "inputEfficiency", pct: 0.08 },
        { kind: "growthCostReduction", pct: 0.06 },
      ],
    },
    {
      name: "Thermal Storage Bricks",
      description: "Hot bricks store surplus power as industrial heat.",
      effects: [{ kind: "inputEfficiency", pct: 0.065 }],
    },
    {
      name: "Autonomous Dispatch",
      description: "Agents schedule every plant against live prices.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
    {
      name: "Small Modular Reactor Fleets",
      description: "Factory-built reactors unlock the Advanced Fission method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "advanced_fission" },
        { kind: "inputEfficiency", pct: 0.08 },
      ],
    },
    {
      name: "Dynamic Line Rating",
      description: "Sensors let lines carry more on cool, windy days.",
      effects: [{ kind: "growthCostReduction", pct: 0.065 }],
    },
    {
      name: "Fuel Recycling",
      description: "Reprocessed fuel stretches scarce reactor inputs.",
      effects: [{ kind: "inputEfficiency", pct: 0.095 }],
    },
    {
      name: "Interregional Transmission",
      description: "High-voltage links move surplus power to shortage.",
      effects: [{ kind: "growthCostReduction", pct: 0.065 }],
    },
  ],
  agriculture: [
    {
      name: "Cultivated Protein",
      description: "Bioreactor-grown food unlocks the Cellular Agriculture method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "cellular_agriculture" },
        { kind: "inputEfficiency", pct: 0.095 },
        { kind: "growthCostReduction", pct: 0.105 },
      ],
    },
    {
      name: "Drought-Tolerant Edits",
      description: "Edited crops hold yield through dry years.",
      effects: [{ kind: "inputEfficiency", pct: 0.095 }],
    },
    {
      name: "Nitrogen-Fixing Cereals",
      description: "Grains that feed themselves cut fertilizer buys.",
      effects: [{ kind: "inputEfficiency", pct: 0.08 }],
    },
    {
      name: "Heat-Resilient Livestock",
      description: "Bred herds stay productive in hotter summers.",
      effects: [{ kind: "inputEfficiency", pct: 0.065 }],
    },
    {
      name: "Autonomous Field Fleets",
      description: "Robot tractors and sprayers run day and night.",
      effects: [{ kind: "logisticsStrength", flat: 38 }],
    },
    {
      name: "Low-Cost Growth Media",
      description: "Cheaper feed for cultures cuts bioreactor costs.",
      effects: [{ kind: "inputEfficiency", pct: 0.08 }],
    },
    {
      name: "Soil Carbon Farming",
      description: "Paid soil carbon adds a second income.",
      effects: [{ kind: "inputEfficiency", pct: 0.08 }],
    },
    {
      name: "Agentic Farm Management",
      description: "Agents plan planting, spraying and sales.",
      effects: [{ kind: "logisticsStrength", flat: 36 }],
    },
    {
      name: "Microbial Fertilizers",
      description: "Soil microbes replace part of bought fertilizer.",
      effects: [{ kind: "inputEfficiency", pct: 0.08 }],
    },
  ],
  real_estate: [
    {
      name: "Agentic Property Management",
      description: "Agents run leasing, repairs and billing.",
      effects: [
        { kind: "laborCostReduction", pct: 0.15 },
        { kind: "growthCostReduction", pct: 0.085 },
      ],
    },
    {
      name: "Adaptive Floor Plates",
      description: "Movable interiors re-let space by the hour.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Factory-Built Housing",
      description: "Volumetric homes cut development cost.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
    {
      name: "Climate-Proofed Assets",
      description: "Hardened buildings keep insurers and tenants.",
      effects: [{ kind: "laborCostReduction", pct: 0.085 }],
    },
    {
      name: "Building Digital Twins",
      description: "Live models optimize every building.",
      effects: [{ kind: "marketingStrength", flat: 65 }],
    },
    {
      name: "Robotic Building Services",
      description: "Robots clean, inspect and repair.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
    {
      name: "Office-to-Home Conversion",
      description: "Empty offices become housing at a margin.",
      effects: [{ kind: "laborCostReduction", pct: 0.085 }],
    },
    {
      name: "Energy-Positive Buildings",
      description: "Buildings sell surplus power back to the grid.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
    {
      name: "Mass Timber Towers",
      description: "Timber high-rises win low-carbon tenants.",
      effects: [{ kind: "laborCostReduction", pct: 0.085 }],
    },
  ],
  construction: [
    {
      name: "Printed Mass Timber",
      description: "Machine-cut timber panels unlock the Printed Mass Timber method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "printed_mass_timber" },
        { kind: "laborCostReduction", pct: 0.12 },
        { kind: "growthCostReduction", pct: 0.12 },
      ],
    },
    {
      name: "Robotic Site Crews",
      description: "Robots lay, weld and finish around the clock.",
      effects: [{ kind: "logisticsStrength", flat: 38 }],
    },
    {
      name: "Low-Carbon Cement",
      description: "New binders cut cement emissions and cost.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
    {
      name: "Agentic Project Controls",
      description: "Agents schedule trades and order materials.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Reused Structural Steel",
      description: "Salvaged beams are recertified for new builds.",
      effects: [{ kind: "laborCostReduction", pct: 0.085 }],
    },
    {
      name: "Autonomous Heavy Equipment",
      description: "Driverless machines grade and haul.",
      effects: [{ kind: "logisticsStrength", flat: 32 }],
    },
    {
      name: "Self-Healing Asphalt",
      description: "Roads seal their own cracks.",
      effects: [{ kind: "laborCostReduction", pct: 0.085 }],
    },
    {
      name: "Printed Foundations",
      description: "Printed footings cut labor and concrete.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Kit-of-Parts Buildings",
      description: "Standard parts assemble into any building.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
  ],
  defense: [
    {
      name: "Drone Swarm Doctrine",
      description: "Mass-produced autonomous drones unlock the Drone Swarms method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "drone_swarm" },
        { kind: "inputEfficiency", pct: 0.12 },
        { kind: "growthCostReduction", pct: 0.085 },
      ],
    },
    {
      name: "Counter-Drone Lasers",
      description: "Directed-energy defenses answer cheap swarms.",
      effects: [{ kind: "inputEfficiency", pct: 0.095 }],
    },
    {
      name: "Hypersonic Propulsion",
      description: "Scramjet engines open a premium market.",
      effects: [{ kind: "inputEfficiency", pct: 0.08 }],
    },
    {
      name: "Agentic Battle Management",
      description: "Agents fuse sensors and assign targets.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Space Domain Awareness",
      description: "Tracking networks watch every satellite.",
      effects: [{ kind: "inputEfficiency", pct: 0.08 }],
    },
    {
      name: "Autonomous Undersea Vehicles",
      description: "Uncrewed submarines patrol for months.",
      effects: [{ kind: "inputEfficiency", pct: 0.08 }],
    },
    {
      name: "Attritable Aircraft",
      description: "Cheap uncrewed jets accept combat losses.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
    {
      name: "Resilient Navigation",
      description: "Positioning that works when satellites are jammed.",
      effects: [{ kind: "inputEfficiency", pct: 0.095 }],
    },
    {
      name: "Digital Engineering",
      description: "Weapons are designed and tested as models first.",
      effects: [{ kind: "inputEfficiency", pct: 0.08 }],
    },
  ],
  telecommunications: [
    {
      name: "Mega-Constellations",
      description: "Large satellite fleets unlock the Orbital Constellations method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "orbital_logistics" },
        { kind: "laborCostReduction", pct: 0.15 },
        { kind: "growthCostReduction", pct: 0.085 },
      ],
    },
    {
      name: "Direct-to-Phone Satellites",
      description: "Ordinary phones connect straight to orbit.",
      effects: [{ kind: "laborCostReduction", pct: 0.13 }],
    },
    {
      name: "Agentic Network Operations",
      description: "Agents plan, fix and tune the network.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Sensing Networks",
      description: "Radios that also sense sell location data.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
    {
      name: "Optical Inter-Satellite Links",
      description: "Laser links route traffic across orbit.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
    {
      name: "Open Radio Networks",
      description: "Mix-and-match radio gear cuts vendor cost.",
      effects: [{ kind: "laborCostReduction", pct: 0.13 }],
    },
    {
      name: "Energy-Harvesting Sites",
      description: "Towers power themselves from sun and wind.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
    {
      name: "Space Debris Tracking",
      description: "Collision avoidance protects the constellation.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
    {
      name: "Network Slicing Markets",
      description: "Guaranteed network slices sell to industry.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
  ],
  media_entertainment: [
    {
      name: "Personalized Storytelling",
      description: "Stories assembled per viewer unlock the Personalized Entertainment method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "personalised_media" },
        { kind: "laborCostReduction", pct: 0.13 },
        { kind: "growthCostReduction", pct: 0.1 },
      ],
    },
    {
      name: "Generated Game Worlds",
      description: "Agents build whole worlds to order.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
    {
      name: "Live Synthetic Performers",
      description: "Licensed digital performers work any venue.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
    {
      name: "Mixed Reality Venues",
      description: "Physical venues are layered with digital shows.",
      effects: [{ kind: "marketingStrength", flat: 95 }],
    },
    {
      name: "Creator Content Markets",
      description: "Creators sell content inside the platform.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
    {
      name: "Agentic Characters",
      description: "Characters remember and respond to each fan.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
    {
      name: "Instant Localization",
      description: "Every release ships in every language.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
    {
      name: "Adaptive Soundtracks",
      description: "Music is scored live to each scene and viewer.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
    {
      name: "Full-Body Haptics",
      description: "Feedback suits sell premium sessions.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
  ],
  logistics: [
    {
      name: "Orbital Tracking Networks",
      description: "Satellite relays unlock the Orbital Logistics method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "orbital_logistics" },
        { kind: "logisticsStrength", flat: 32 },
      ],
    },
    {
      name: "Autonomous Cargo Drones",
      description: "Heavy-lift drones fly regional freight.",
      effects: [{ kind: "logisticsStrength", flat: 38 }],
    },
    {
      name: "Agentic Freight Brokerage",
      description: "Agents match loads and price lanes.",
      effects: [{ kind: "marketingStrength", flat: 65 }],
    },
    {
      name: "Resilient Routing",
      description: "Agents reroute around disruption in minutes.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Electric Long-Haul",
      description: "Electric trucks run on charged corridors.",
      effects: [{ kind: "laborCostReduction", pct: 0.11 }],
    },
    {
      name: "Robotic Cross-Docks",
      description: "Robots sort and load without staff.",
      effects: [{ kind: "logisticsStrength", flat: 38 }],
    },
    {
      name: "Autonomous Coastal Shipping",
      description: "Uncrewed vessels run short-sea routes.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Multi-Modal Agents",
      description: "Agents book rail, road, sea and air in one plan.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
    {
      name: "Underground Freight Tunnels",
      description: "Automated tunnels move parcels under cities.",
      effects: [{ kind: "logisticsStrength", flat: 38 }],
    },
  ],
  extraction: [
    {
      name: "Autonomous Mine Fleets",
      description: "Driverless haulers and drills run nonstop.",
      effects: [
        { kind: "plantOutput", pct: 0.033 },
        { kind: "growthCostReduction", pct: 0.105 },
      ],
    },
    {
      name: "Critical Mineral Recycling",
      description: "Urban mining recovers metals from scrap.",
      effects: [{ kind: "plantOutput", pct: 0.028 }],
    },
    {
      name: "Geothermal Brine Mining",
      description: "Metals are drawn from hot underground brines.",
      effects: [{ kind: "plantOutput", pct: 0.028 }],
    },
    {
      name: "Agentic Exploration",
      description: "Agents read survey data to find new deposits.",
      effects: [{ kind: "growthCostReduction", pct: 0.085 }],
    },
    {
      name: "Electric Mining Equipment",
      description: "Battery machines cut fuel and ventilation.",
      effects: [{ kind: "logisticsStrength", flat: 38 }],
    },
    {
      name: "Ore Sorting Sensors",
      description: "Sensors reject waste rock before milling.",
      effects: [{ kind: "plantOutput", pct: 0.028 }],
    },
    {
      name: "Autonomous Drilling",
      description: "Rigs drill and change bits on their own.",
      effects: [{ kind: "logisticsStrength", flat: 36 }],
    },
    {
      name: "Tailings Reprocessing",
      description: "Old waste piles are mined for missed metal.",
      effects: [{ kind: "plantOutput", pct: 0.028 }],
    },
    {
      name: "Remote Operations Centers",
      description: "One control room runs mines on several continents.",
      effects: [{ kind: "logisticsStrength", flat: 36 }],
    },
  ],
};
