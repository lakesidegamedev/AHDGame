/**
 * Tier "2049" (2049 to 2058) content for slots 1-9 of both lanes.
 *
 * The speculative frontier tier. Corporate lane theme: autonomous enterprises,
 * post-scarcity logistics planning, synthetic workforce governance and
 * planetary-scale risk modelling. Sector lanes follow each sector's plausible
 * 2050s frontier and carry the unlock nodes for the 2049 production methods
 * (see sectorStrategyDefinitions.ts, `minDecade: "2049"`). Node and method
 * names are game design, not forecasts. Slots follow the fixed fork in
 * ./selectors (SLOT_PARENT): 1 is the root, 2-4-6-8 and 3-5-7-9 are the two
 * branches. Slots 10-15 live in ./v3 under the same key.
 */
import type { OperatingSectorType } from "../corporations";
import type { NodeSpec } from "./nodes";

export const TIER_2049_CORPORATE: NodeSpec[] = [
  {
    name: "Autonomous Enterprise Core",
    description: "The firm runs itself day to day, with people setting goals.",
    effects: [
      { kind: "plantOutput", pct: 0.032 },
      { kind: "growthCostReduction", pct: 0.075 },
    ],
  },
  {
    name: "Synthetic Workforce Charter",
    description: "Clear rules for agent and robot staff keep regulators onside.",
    effects: [{ kind: "growthCostReduction", pct: 0.095 }],
  },
  {
    name: "Whole-Market Simulation",
    description: "Simulated economies test every launch before it ships.",
    effects: [{ kind: "marketingStrength", flat: 100 }],
  },
  {
    name: "Planetary Risk Models",
    description: "Global climate, trade and conflict models steer every plan.",
    effects: [{ kind: "plantOutput", pct: 0.032 }],
  },
  {
    name: "Post-Scarcity Logistics Planning",
    description: "Supply is planned for abundance, so shortages rarely bite.",
    effects: [
      { kind: "logisticsStrength", flat: 40 },
      { kind: "growthCostReduction", pct: 0.045 },
    ],
  },
  {
    name: "Self-Healing Supply Webs",
    description: "Supply networks reroute around failures on their own.",
    effects: [{ kind: "logisticsStrength", flat: 34 }],
  },
  {
    name: "Machine Board Advisors",
    description: "Agents brief the board on every option and its odds.",
    effects: [{ kind: "growthCostReduction", pct: 0.095 }],
  },
  {
    name: "Orbital Inventory Tracking",
    description: "Every crate on Earth is tracked from orbit in real time.",
    effects: [{ kind: "logisticsStrength", flat: 34 }],
  },
  {
    name: "Self-Executing Agreements",
    description: "Contracts settle and enforce themselves without lawyers.",
    effects: [{ kind: "growthCostReduction", pct: 0.095 }],
  },
];

export const TIER_2049_SECTOR: Record<OperatingSectorType, NodeSpec[]> = {
  financial: [
    {
      name: "Autonomous Asset Houses",
      description: "Agent-run funds manage savings for whole nations.",
      effects: [
        { kind: "laborCostReduction", pct: 0.17 },
        { kind: "growthCostReduction", pct: 0.09 },
      ],
    },
    {
      name: "Programmable Currencies",
      description: "Money that carries its own rules settles any deal.",
      effects: [{ kind: "laborCostReduction", pct: 0.14 }],
    },
    {
      name: "Planetary Payment Rails",
      description: "One network clears payments across every bloc.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Lifetime Credit Models",
      description: "Models price credit over a whole working life.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
    {
      name: "Ambient Finance",
      description: "Credit and cover appear wherever money changes hands.",
      effects: [{ kind: "marketingStrength", flat: 100 }],
    },
    {
      name: "Machine-to-Machine Markets",
      description: "Agents trade with agents at almost zero cost.",
      effects: [{ kind: "laborCostReduction", pct: 0.14 }],
    },
    {
      name: "Catastrophe Bond Exchanges",
      description: "Disaster risk trades on open markets around the clock.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
    {
      name: "Predictive Fraud Shields",
      description: "Fraud is stopped before the first payment leaves.",
      effects: [{ kind: "laborCostReduction", pct: 0.14 }],
    },
    {
      name: "Planetary Risk Underwriting",
      description: "Earth-scale hazard models price cover anywhere.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
  ],
  media: [
    {
      name: "Living News Streams",
      description: "Stories update themselves as events unfold.",
      effects: [
        { kind: "laborCostReduction", pct: 0.14 },
        { kind: "growthCostReduction", pct: 0.105 },
      ],
    },
    {
      name: "Reader Twin Profiles",
      description: "Each reader's model picks the stories they will value.",
      effects: [{ kind: "marketingStrength", flat: 100 }],
    },
    {
      name: "Universal Voice Dubbing",
      description: "Every report speaks every language in the original voice.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
    {
      name: "Synthetic Correspondents",
      description: "Generated reporters cover every beat on demand.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
    {
      name: "Autonomous Bureaus",
      description: "Agent bureaus cover whole regions with no staff.",
      effects: [{ kind: "laborCostReduction", pct: 0.09 }],
    },
    {
      name: "Verified Reality Feeds",
      description: "Signed sensor feeds prove what really happened.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
    {
      name: "Immersive Journalism",
      description: "Readers step inside the story in mixed reality.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
    {
      name: "Neural News Briefings",
      description: "Briefings reach readers through wearable interfaces.",
      effects: [{ kind: "marketingStrength", flat: 100 }],
    },
    {
      name: "Infinite Archives",
      description: "Every past story is recut on request for any reader.",
      effects: [{ kind: "growthCostReduction", pct: 0.105 }],
    },
  ],
  manufacturing: [
    {
      name: "Self-Replicating Factories",
      description: "Robot plants build copies of their own production lines.",
      effects: [
        { kind: "inputEfficiency", pct: 0.1 },
        { kind: "growthCostReduction", pct: 0.12 },
      ],
    },
    {
      name: "Molecular Assembly",
      description: "Parts are built up atom by atom with no waste.",
      effects: [{ kind: "inputEfficiency", pct: 0.1 }],
    },
    {
      name: "Programmable Matter",
      description: "Materials change shape and stiffness on command.",
      effects: [{ kind: "inputEfficiency", pct: 0.085 }],
    },
    {
      name: "Autonomous Factory Networks",
      description: "Plants share orders and capacity without planners.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Orbital Microgravity Lines",
      description: "Orbital plants make crystals and alloys Earth cannot.",
      effects: [{ kind: "logisticsStrength", flat: 40 }],
    },
    {
      name: "Lights-Out Megaplants",
      description: "Vast plants run for years without a human shift.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Total Material Recovery",
      description: "Every returned product is stripped to raw inputs.",
      effects: [{ kind: "inputEfficiency", pct: 0.07 }],
    },
    {
      name: "Self-Designing Tooling",
      description: "Tools design and print their own replacements.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Zero-Tolerance Fabrication",
      description: "Atomic-scale control makes every part identical.",
      effects: [{ kind: "inputEfficiency", pct: 0.085 }],
    },
  ],
  chemical_industries: [
    {
      name: "Synthetic Biology Refineries",
      description: "Engineered microbes brew chemicals from sugar and air.",
      effects: [
        { kind: "inputEfficiency", pct: 0.115 },
        { kind: "growthCostReduction", pct: 0.105 },
      ],
    },
    {
      name: "Designer Catalysts",
      description: "Model-designed catalysts run reactions at room heat.",
      effects: [{ kind: "inputEfficiency", pct: 0.1 }],
    },
    {
      name: "Plasma Reforming",
      description: "Electric plasma splits waste into clean feedstock.",
      effects: [{ kind: "inputEfficiency", pct: 0.085 }],
    },
    {
      name: "Self-Driving Chemical Plants",
      description: "Plants plan, run and repair themselves.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Self-Erasing Materials",
      description: "Products break down on a signal at end of life.",
      effects: [{ kind: "inputEfficiency", pct: 0.085 }],
    },
    {
      name: "Atmospheric Carbon Mining",
      description: "Captured carbon becomes a cheap bulk feedstock.",
      effects: [{ kind: "inputEfficiency", pct: 0.085 }],
    },
    {
      name: "Autonomous Molecule Discovery",
      description: "Agents invent and test new molecules every night.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Waterless Processing",
      description: "Dry and solid-state processes need no water at all.",
      effects: [{ kind: "inputEfficiency", pct: 0.1 }],
    },
    {
      name: "Closed-Loop Feedstocks",
      description: "Recovered molecules replace nearly all bought chemicals.",
      effects: [{ kind: "inputCost", commodity: "chemicals", pct: 0.21 }],
    },
  ],
  healthcare: [
    {
      name: "In-Vivo Gene Editing",
      description: "One-dose edits inside the body unlock the Gene Therapy at Scale method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "gene_therapy_scale" },
        { kind: "laborCostReduction", pct: 0.17 },
        { kind: "growthCostReduction", pct: 0.09 },
      ],
    },
    {
      name: "Regenerative Organs",
      description: "Grown organs end transplant waiting lists.",
      effects: [{ kind: "laborCostReduction", pct: 0.14 }],
    },
    {
      name: "Autonomous Diagnostics",
      description: "Agents diagnose most cases without a doctor.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
    {
      name: "Clinic in Every Home",
      description: "Home sensors and robots replace most clinic visits.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
    {
      name: "Longevity Programs",
      description: "Healthy-aging plans sell decades of care up front.",
      effects: [{ kind: "marketingStrength", flat: 100 }],
    },
    {
      name: "Virtual Patient Cohorts",
      description: "Whole trials run on simulated patients first.",
      effects: [{ kind: "laborCostReduction", pct: 0.14 }],
    },
    {
      name: "Autonomous Surgery Suites",
      description: "Robots perform routine operations end to end.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
    {
      name: "Universal Cell Lines",
      description: "One donor line treats almost any patient.",
      effects: [{ kind: "laborCostReduction", pct: 0.14 }],
    },
    {
      name: "Molecular Health Monitors",
      description: "Implants catch disease before symptoms start.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
  ],
  retail: [
    {
      name: "Agent-to-Agent Commerce",
      description: "Household agents and store agents settle every order.",
      effects: [
        { kind: "laborCostReduction", pct: 0.14 },
        { kind: "growthCostReduction", pct: 0.11 },
      ],
    },
    {
      name: "Ambient Storefronts",
      description: "Any surface becomes a store with no staff at all.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
    {
      name: "Drone Swarm Fulfillment",
      description: "Swarms deliver orders within minutes of the click.",
      effects: [{ kind: "logisticsStrength", flat: 40 }],
    },
    {
      name: "Predictive Restocking",
      description: "Goods ship before the customer knows they need them.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
    {
      name: "Pneumatic Home Delivery",
      description: "Tube networks drop parcels straight into homes.",
      effects: [{ kind: "logisticsStrength", flat: 34 }],
    },
    {
      name: "Perpetual Product Loops",
      description: "Goods are leased, returned and resold for life.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Zero-Waste Grocery",
      description: "Demand models match food to buyers before it spoils.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
    {
      name: "Neighborhood Stock Hubs",
      description: "Robot hubs hold stock a few minutes from every door.",
      effects: [{ kind: "logisticsStrength", flat: 40 }],
    },
    {
      name: "Lifetime Household Contracts",
      description: "Households subscribe their agents to one store for life.",
      effects: [{ kind: "marketingStrength", flat: 100 }],
    },
  ],
  manufacturing_vehicles: [
    {
      name: "Structural Battery Bodies",
      description: "The car body itself stores the power.",
      effects: [
        { kind: "inputEfficiency", pct: 0.125 },
        { kind: "growthCostReduction", pct: 0.09 },
      ],
    },
    {
      name: "Lithium-Free Chemistries",
      description: "New cells run on common, cheap elements.",
      effects: [{ kind: "inputEfficiency", pct: 0.1 }],
    },
    {
      name: "Mobility Subscriptions",
      description: "Households pay for travel, not for cars.",
      effects: [{ kind: "marketingStrength", flat: 80 }],
    },
    {
      name: "Printed Vehicle Platforms",
      description: "Whole chassis are printed to order near the buyer.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Grid-Linked Fleets",
      description: "Parked fleets act as one giant battery.",
      effects: [{ kind: "inputEfficiency", pct: 0.085 }],
    },
    {
      name: "Full Autonomy Stacks",
      description: "Driving software needs no human backup anywhere.",
      effects: [{ kind: "inputEfficiency", pct: 0.1 }],
    },
    {
      name: "Lights-Out Assembly",
      description: "Cars are built start to finish without workers.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Superconducting Motors",
      description: "Motors with almost no losses stretch every charge.",
      effects: [{ kind: "inputEfficiency", pct: 0.1 }],
    },
    {
      name: "Closed-Loop Vehicle Recovery",
      description: "Old vehicles are broken down into new ones.",
      effects: [{ kind: "logisticsStrength", flat: 34 }],
    },
  ],
  technology: [
    {
      name: "Brain-Computer Links",
      description: "Wearable neural links unlock the Neural Interfaces method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "neural_interfaces" },
        { kind: "plantOutput", pct: 0.035 },
        { kind: "growthCostReduction", pct: 0.11 },
      ],
    },
    {
      name: "Neuromorphic Chips",
      description: "Brain-like chips think on a fraction of the power.",
      effects: [{ kind: "plantOutput", pct: 0.032 }],
    },
    {
      name: "Quantum Cloud Services",
      description: "Rented quantum machines solve industry problems.",
      effects: [{ kind: "plantOutput", pct: 0.035 }],
    },
    {
      name: "Self-Improving Software",
      description: "Systems rewrite and upgrade themselves safely.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Thought-Driven Interfaces",
      description: "Users control devices by intent alone.",
      effects: [{ kind: "marketingStrength", flat: 100 }],
    },
    {
      name: "Photonic Computing",
      description: "Light-based processors cut heat and cost.",
      effects: [{ kind: "plantOutput", pct: 0.032 }],
    },
    {
      name: "Provably Safe Agents",
      description: "Verified agents can be trusted with real money.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Ambient Computing Mesh",
      description: "Computing hides in every wall and object.",
      effects: [{ kind: "plantOutput", pct: 0.032 }],
    },
    {
      name: "Autonomous Data Centers",
      description: "Data centers build, cool and fix themselves.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
  ],
  energy: [
    {
      name: "Fusion Power Plants",
      description: "Grid-connected fusion plants unlock the Commercial Fusion method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "fusion_commercial" },
        { kind: "inputEfficiency", pct: 0.07 },
      ],
    },
    {
      name: "High-Temperature Superconductors",
      description: "Cheap superconducting magnets shrink fusion plants.",
      effects: [{ kind: "inputEfficiency", pct: 0.1 }],
    },
    {
      name: "Continental Supergrids",
      description: "Whole continents share power in one market.",
      effects: [
        { kind: "inputEfficiency", pct: 0.085 },
        { kind: "growthCostReduction", pct: 0.065 },
      ],
    },
    {
      name: "Tritium Breeding Blankets",
      description: "Reactors breed their own fuel as they run.",
      effects: [{ kind: "inputEfficiency", pct: 0.07 }],
    },
    {
      name: "Self-Balancing Grids",
      description: "The grid matches supply and demand by itself.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
    {
      name: "Space-Based Solar",
      description: "Orbital arrays beam power down day and night.",
      effects: [{ kind: "inputEfficiency", pct: 0.085 }],
    },
    {
      name: "Superconducting Cables",
      description: "Lossless cables carry power across borders.",
      effects: [{ kind: "growthCostReduction", pct: 0.07 }],
    },
    {
      name: "Deep Geothermal Wells",
      description: "Superhot rock wells give firm power anywhere.",
      effects: [{ kind: "inputEfficiency", pct: 0.1 }],
    },
    {
      name: "Planetary Power Exchange",
      description: "Surplus power trades between hemispheres.",
      effects: [{ kind: "growthCostReduction", pct: 0.07 }],
    },
  ],
  agriculture: [
    {
      name: "Precision Fermentation Farms",
      description: "Microbes brew proteins and fats in vast tanks.",
      effects: [
        { kind: "inputEfficiency", pct: 0.1 },
        { kind: "growthCostReduction", pct: 0.11 },
      ],
    },
    {
      name: "Perennial Grain Systems",
      description: "Grains that regrow each year skip replanting.",
      effects: [{ kind: "inputEfficiency", pct: 0.1 }],
    },
    {
      name: "Enhanced Photosynthesis",
      description: "Rewired crops turn more sunlight into yield.",
      effects: [{ kind: "inputEfficiency", pct: 0.085 }],
    },
    {
      name: "Climate-Proof Herds",
      description: "Edited livestock thrive in heat and drought.",
      effects: [{ kind: "inputEfficiency", pct: 0.07 }],
    },
    {
      name: "Robotic Farm Swarms",
      description: "Small robots tend every plant one by one.",
      effects: [{ kind: "logisticsStrength", flat: 40 }],
    },
    {
      name: "Cheap Cell Feed",
      description: "Feed for cultured food costs little more than grain.",
      effects: [{ kind: "inputEfficiency", pct: 0.085 }],
    },
    {
      name: "Regenerative Land Credits",
      description: "Restored land earns steady carbon and nature income.",
      effects: [{ kind: "inputEfficiency", pct: 0.085 }],
    },
    {
      name: "Autonomous Farm Estates",
      description: "Agents run whole estates from seed to sale.",
      effects: [{ kind: "logisticsStrength", flat: 38 }],
    },
    {
      name: "Self-Fertilizing Soils",
      description: "Engineered soil life feeds crops without bought fertilizer.",
      effects: [{ kind: "inputEfficiency", pct: 0.085 }],
    },
  ],
  real_estate: [
    {
      name: "Self-Running Districts",
      description: "Agent-run neighborhoods unlock the Autonomous Districts method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "autonomous_districts" },
        { kind: "laborCostReduction", pct: 0.16 },
        { kind: "growthCostReduction", pct: 0.09 },
      ],
    },
    {
      name: "Shape-Shifting Interiors",
      description: "Robotic walls rebuild floors for each tenant.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Printed Neighborhoods",
      description: "Whole streets of homes are printed in weeks.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
    {
      name: "Floating and Raised Districts",
      description: "Flood-proof districts hold value as seas rise.",
      effects: [{ kind: "laborCostReduction", pct: 0.09 }],
    },
    {
      name: "City Digital Twins",
      description: "Live models of whole districts guide every lease.",
      effects: [{ kind: "marketingStrength", flat: 70 }],
    },
    {
      name: "Robot Building Crews",
      description: "Robots run, clean and repair every building.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
    {
      name: "Vertical Village Conversions",
      description: "Old towers become mixed homes, farms and shops.",
      effects: [{ kind: "laborCostReduction", pct: 0.09 }],
    },
    {
      name: "Power-Trading Estates",
      description: "Estates trade surplus power with the grid all day.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
    {
      name: "Living Building Materials",
      description: "Grown materials repair themselves over time.",
      effects: [{ kind: "laborCostReduction", pct: 0.09 }],
    },
  ],
  construction: [
    {
      name: "Autonomous Build Sites",
      description: "Robot crews raise whole buildings with no site staff.",
      effects: [
        { kind: "laborCostReduction", pct: 0.13 },
        { kind: "growthCostReduction", pct: 0.12 },
      ],
    },
    {
      name: "Construction Robot Swarms",
      description: "Swarms of small robots build day and night.",
      effects: [{ kind: "logisticsStrength", flat: 40 }],
    },
    {
      name: "Carbon-Negative Concrete",
      description: "Concrete that stores more carbon than it emits.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
    {
      name: "Self-Managing Projects",
      description: "Agents run whole projects from bid to handover.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Disassembly-Ready Design",
      description: "Buildings come apart for parts at end of life.",
      effects: [{ kind: "laborCostReduction", pct: 0.09 }],
    },
    {
      name: "Tunnel Boring Fleets",
      description: "Autonomous borers dig tunnels at a fraction of the cost.",
      effects: [{ kind: "logisticsStrength", flat: 34 }],
    },
    {
      name: "Self-Repairing Infrastructure",
      description: "Bridges and roads seal and reinforce themselves.",
      effects: [{ kind: "laborCostReduction", pct: 0.09 }],
    },
    {
      name: "Orbital Construction Contracts",
      description: "Firms build stations and habitats in orbit.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Universal Building Kits",
      description: "One kit of parts builds homes, plants and towers.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
  ],
  defense: [
    {
      name: "Autonomous Combat Networks",
      description: "Linked uncrewed forces fight as one system.",
      effects: [
        { kind: "inputEfficiency", pct: 0.125 },
        { kind: "growthCostReduction", pct: 0.09 },
      ],
    },
    {
      name: "High-Energy Laser Shields",
      description: "Laser batteries defend whole cities from missiles.",
      effects: [{ kind: "inputEfficiency", pct: 0.1 }],
    },
    {
      name: "Orbital Defense Platforms",
      description: "Space platforms open a premium market.",
      effects: [{ kind: "inputEfficiency", pct: 0.085 }],
    },
    {
      name: "Machine-Speed Command",
      description: "Agents plan and adjust operations in seconds.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Cislunar Surveillance",
      description: "Sensors watch the space between Earth and Moon.",
      effects: [{ kind: "inputEfficiency", pct: 0.085 }],
    },
    {
      name: "Seabed Sentinel Arrays",
      description: "Uncrewed sensors guard cables and sea lanes.",
      effects: [{ kind: "inputEfficiency", pct: 0.085 }],
    },
    {
      name: "Expendable Strike Craft",
      description: "Cheap uncrewed craft are built to be lost.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
    {
      name: "Quantum Navigation",
      description: "Quantum sensors navigate with no satellites.",
      effects: [{ kind: "inputEfficiency", pct: 0.1 }],
    },
    {
      name: "Virtual Proving Grounds",
      description: "Systems are fully tested in simulation before any build.",
      effects: [{ kind: "inputEfficiency", pct: 0.085 }],
    },
  ],
  telecommunications: [
    {
      name: "Quantum-Secure Networks",
      description: "Quantum keys make every link unbreakable.",
      effects: [
        { kind: "laborCostReduction", pct: 0.16 },
        { kind: "growthCostReduction", pct: 0.09 },
      ],
    },
    {
      name: "Terahertz Radios",
      description: "Ultra-high bands carry vast data over short hops.",
      effects: [{ kind: "laborCostReduction", pct: 0.14 }],
    },
    {
      name: "Self-Operating Networks",
      description: "Networks run, heal and upgrade themselves.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Everywhere Sensing",
      description: "The network senses traffic, weather and crowds.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
    {
      name: "Lunar Relay Links",
      description: "Relays carry traffic to and from the Moon.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
    {
      name: "Software-Only Networks",
      description: "Every network function runs as software.",
      effects: [{ kind: "laborCostReduction", pct: 0.14 }],
    },
    {
      name: "Zero-Energy Devices",
      description: "Tags and sensors run on harvested radio waves.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
    {
      name: "Orbital Traffic Control",
      description: "Automated control keeps crowded orbits safe.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
    {
      name: "Guaranteed Latency Markets",
      description: "Industry buys guaranteed response times by the second.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
  ],
  media_entertainment: [
    {
      name: "Living Worlds",
      description: "Persistent worlds grow and change with every player.",
      effects: [
        { kind: "laborCostReduction", pct: 0.14 },
        { kind: "growthCostReduction", pct: 0.105 },
      ],
    },
    {
      name: "Endless Generated Series",
      description: "Series never end, written fresh for each viewer.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
    {
      name: "Licensed Digital Stars",
      description: "Synthetic stars tour every venue at once.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
    {
      name: "Holographic Arenas",
      description: "Live shows play to arenas in many cities at once.",
      effects: [{ kind: "marketingStrength", flat: 100 }],
    },
    {
      name: "Fan-Made Universes",
      description: "Fans build and sell stories inside official worlds.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
    {
      name: "Companion Characters",
      description: "Characters stay with each fan for years.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
    {
      name: "Universal Releases",
      description: "Every title launches worldwide in every language.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
    {
      name: "Mood-Matched Scores",
      description: "Music shifts with the listener's mood in real time.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
    {
      name: "Neural Sensory Play",
      description: "Interfaces add touch and feeling to premium sessions.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
  ],
  logistics: [
    {
      name: "Orbital Freight Lanes",
      description: "Suborbital hops move urgent cargo across the planet.",
      effects: [{ kind: "logisticsStrength", flat: 34 }],
    },
    {
      name: "Heavy-Lift Drone Networks",
      description: "Drone fleets carry container loads between cities.",
      effects: [{ kind: "logisticsStrength", flat: 40 }],
    },
    {
      name: "Autonomous Freight Exchanges",
      description: "Agent markets price and book every load.",
      effects: [{ kind: "marketingStrength", flat: 70 }],
    },
    {
      name: "Predictive Flow Planning",
      description: "Freight moves before orders are even placed.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Hydrogen Long-Haul",
      description: "Fuel cell trucks and ships cross continents.",
      effects: [{ kind: "laborCostReduction", pct: 0.12 }],
    },
    {
      name: "Lights-Out Hubs",
      description: "Hubs sort and load with no staff on site.",
      effects: [{ kind: "logisticsStrength", flat: 40 }],
    },
    {
      name: "Uncrewed Ocean Shipping",
      description: "Autonomous ships cross oceans with no crew.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Planetary Routing Agents",
      description: "One agent plans every mode across the globe.",
      effects: [{ kind: "growthCostReduction", pct: 0.11 }],
    },
    {
      name: "Vacuum Tube Freight",
      description: "Sealed tubes move cargo at airliner speeds.",
      effects: [{ kind: "logisticsStrength", flat: 40 }],
    },
  ],
  extraction: [
    {
      name: "Asteroid Prospecting",
      description: "Robotic probes mine near-Earth rock to unlock the Space Resources method.",
      effects: [
        { kind: "unlockStrategy", strategyId: "space_resources" },
        { kind: "plantOutput", pct: 0.035 },
        { kind: "growthCostReduction", pct: 0.11 },
      ],
    },
    {
      name: "Lunar Regolith Processing",
      description: "Moon dust is refined for metals and oxygen.",
      effects: [{ kind: "plantOutput", pct: 0.03 }],
    },
    {
      name: "Seawater Mineral Harvest",
      description: "Membranes pull lithium and uranium from seawater.",
      effects: [{ kind: "plantOutput", pct: 0.03 }],
    },
    {
      name: "Autonomous Prospecting",
      description: "Agents and drones find deposits without crews.",
      effects: [{ kind: "growthCostReduction", pct: 0.09 }],
    },
    {
      name: "Orbital Ore Haulers",
      description: "Robotic tugs bring ore down from orbit.",
      effects: [{ kind: "logisticsStrength", flat: 40 }],
    },
    {
      name: "Bioleaching Mines",
      description: "Microbes dissolve metal from low-grade ore.",
      effects: [{ kind: "plantOutput", pct: 0.03 }],
    },
    {
      name: "Plasma Drilling",
      description: "Plasma bores reach rock no drill bit can.",
      effects: [{ kind: "logisticsStrength", flat: 38 }],
    },
    {
      name: "Landfill Mining",
      description: "Old dumps are mined for metals and fuel.",
      effects: [{ kind: "plantOutput", pct: 0.03 }],
    },
    {
      name: "Off-World Control Rooms",
      description: "One center runs mines on Earth and in space.",
      effects: [{ kind: "logisticsStrength", flat: 38 }],
    },
  ],
};
