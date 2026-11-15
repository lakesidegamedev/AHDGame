import type {
  CrisisAutoTrigger,
  CrisisDecisionOption,
  CrisisEffect,
  CrisisTemplate,
} from "@/lib/db/types/crisis";
import { fx, gdpLoss, marginShock } from "@/lib/crises/templateHelpers";

/**
 * Crisis templates for the 2027 to 2050 world. Each one carries a `fromYear` and
 * an `untilYear` so the theme opens when it becomes apt and retires when the
 * world has moved on from it. Every template follows one shape: a response
 * choice, a funded collective node, then a terminal outcome. Nothing here is
 * scheduled: each one is a low per-turn roll with a cooldown, so a country can
 * go years without seeing any of them.
 */

export const HERO = {
  heat: "https://images.unsplash.com/photo-1563630381190-77c336ea545a?auto=format&fit=crop&w=1600&q=70",
  fire: "https://images.unsplash.com/photo-1692364221415-654b20e6d1d2?auto=format&fit=crop&w=1600&q=70",
  drought:
    "https://images.unsplash.com/photo-1753542175735-f57082a5ff79?auto=format&fit=crop&w=1600&q=70",
  housing:
    "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1600&q=70",
  bank: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1600&q=70",
  tech: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=70",
  industry:
    "https://images.unsplash.com/photo-1676624775964-10bc144cbeba?auto=format&fit=crop&w=1600&q=70",
  port: "https://images.unsplash.com/photo-1605745341112-85968b19335b?auto=format&fit=crop&w=1600&q=70",
  grid: "https://images.unsplash.com/photo-1611416457332-946853cc75d6?auto=format&fit=crop&w=1600&q=70",
  water:
    "https://images.unsplash.com/photo-1769298315896-fc23a5dcbff8?auto=format&fit=crop&w=1600&q=70",
  cyber:
    "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1600&q=70",
  info: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1600&q=70",
  tide: "https://images.unsplash.com/photo-1657069344312-a500de53b566?auto=format&fit=crop&w=1600&q=70",
  labor:
    "https://images.unsplash.com/photo-1511898634545-c01af8a54dd5?auto=format&fit=crop&w=1600&q=70",
} as const;

export interface ModernOption {
  id: string;
  label: string;
  description: string;
  effects: CrisisEffect[];
  /** Turns cut from the crisis when chosen. Only set where the copy promises it. */
  cutsTurns?: number;
}

export interface ModernCrisisSpec {
  name: string;
  heroImage: string;
  description: string;
  scope?: "country" | "global";
  durationTurns: number;
  fromYear: number;
  untilYear: number;
  trigger: CrisisAutoTrigger;
  effects: CrisisEffect[];
  wireStart: string;
  wireEnd: string;
  prompt: { title: string; description: string };
  options: [ModernOption, ModernOption, ModernOption];
  fund: { title: string; description: string; target: number };
  outcome: { message: string; effects: CrisisEffect[] };
}

function option(o: ModernOption): CrisisDecisionOption {
  return {
    optionId: o.id,
    label: o.label,
    description: o.description,
    nextNodeId: "fund",
    effects: o.effects,
    ...(o.cutsTurns ? { durationReductionTurns: o.cutsTurns } : {}),
  };
}

export function random(
  cooldownTurns: number,
  spawnChance: number,
  scope: "country" | "global" = "country"
): CrisisAutoTrigger {
  return { kind: "random", cooldownTurns, scope, spawnChance };
}

export function modernCrisis(spec: ModernCrisisSpec): CrisisTemplate {
  const scope = spec.scope ?? "country";
  return {
    name: spec.name,
    heroImage: spec.heroImage,
    description: spec.description,
    fromYear: spec.fromYear,
    untilYear: spec.untilYear,
    autoTrigger: spec.trigger,
    scope,
    countryIds: [],
    regionIds: [],
    durationTurns: spec.durationTurns,
    durationByScope: { country: spec.durationTurns, global: spec.durationTurns + 2 },
    effects: spec.effects,
    wireMessageOnStart: spec.wireStart,
    wireMessageOnEnd: spec.wireEnd,
    interactionDefinition: {
      decisionTree: [
        {
          nodeId: "response",
          type: "choice",
          title: spec.prompt.title,
          description: spec.prompt.description,
          requiredRoles: ["headOfState"],
          timeLimitMinutes: null,
          options: spec.options.map(option),
        },
        {
          nodeId: "fund",
          type: "collective",
          title: spec.fund.title,
          description: spec.fund.description,
          collectiveTarget: spec.fund.target,
          collectiveCurrency: "USD",
          requiredRoles: ["headOfState", "cabinet"],
          timeLimitMinutes: 1440,
          options: [
            {
              optionId: "contribute_10m",
              label: "Contribute $10M",
              description: "Commit $10M to the recovery fund.",
              collectiveContribution: 10_000_000,
              nextNodeId: "terminal",
              effects: [],
            },
            {
              optionId: "contribute_5m",
              label: "Contribute $5M",
              description: "Commit $5M to the recovery fund.",
              collectiveContribution: 5_000_000,
              nextNodeId: "terminal",
              effects: [],
            },
            {
              optionId: "decline",
              label: "Decline",
              description: "No contribution.",
              collectiveContribution: 0,
              nextNodeId: "terminal",
              effects: [],
            },
          ],
        },
        {
          nodeId: "terminal",
          type: "terminal",
          title: "Recovery underway",
          description: "The response is set.",
          outcomeMessage: spec.outcome.message,
          outcomeEffects: spec.outcome.effects,
          requiredRoles: ["any"],
          timeLimitMinutes: null,
        },
      ],
      autoResolveOnExpiry: true,
    },
  };
}

// ── CLIMATE AND UTILITIES ──────────────────────────────────────────────────

const HEAT_DOME = modernCrisis({
  name: "Heat Dome Emergency",
  heroImage: HERO.heat,
  description:
    "A stalled high pressure system parks over the country for weeks. Overnight temperatures never drop, hospitals fill with heat stroke cases, rail lines buckle and the cooling load pushes the grid to its limit.",
  durationTurns: 4,
  fromYear: 2027,
  untilYear: 2040,
  trigger: random(144, 0.0035),
  effects: [
    fx("tick", "metric", "economy", "gdp", -0.008, "Lost working hours in the heat"),
    fx("tick", "metric", "infrastructure", "power", -0.02, "Cooling demand strains the grid"),
    fx("tick", "approval", "government", "overall", -0.03, "Anger at the heat response"),
  ],
  wireStart: "A heat dome has settled over the country. Hospitals report record admissions.",
  wireEnd: "The heat dome breaks. Cooling centers close and the grid steadies.",
  prompt: {
    title: "Heat emergency response",
    description:
      "Deaths are rising and the grid is close to its limit. What does the government do?",
  },
  options: [
    {
      id: "cooling_centers",
      label: "Open public cooling centers",
      description:
        "Open libraries, schools and transit halls around the clock and send outreach teams to the elderly. Costs money, saves lives, and shortens the emergency.",
      effects: [
        fx("flat", "metric", "publicsafety", "confidence", 0.04, "Visible care for the vulnerable"),
        fx("flat", "metric", "economy", "gdp", -0.004, "Emergency staffing costs"),
      ],
      cutsTurns: 1,
    },
    {
      id: "rolling_cuts",
      label: "Ration power with rolling cuts",
      description:
        "Protect the grid by cutting supply to districts in rotation. The grid holds, but people in the dark do not forgive it.",
      effects: [
        fx("flat", "metric", "infrastructure", "power", 0.03, "Grid protected from collapse"),
        fx("flat", "approval", "government", "overall", -0.03, "Anger at the blackouts"),
      ],
    },
    {
      id: "ride_it_out",
      label: "Issue advisories and wait",
      description: "Publish guidance and let utilities and local councils cope with the surge.",
      effects: [fx("flat", "approval", "government", "overall", -0.02, "Seen as detached")],
    },
  ],
  fund: {
    title: "Heat resilience fund",
    description:
      "Governments may pool money for shade, cool roofs and hospital surge capacity. Full funding speeds recovery.",
    target: 15_000_000,
  },
  outcome: {
    message:
      "Hospitals have cleared the surge and a heat action plan is now in force. Cities are planting shade and retrofitting the worst housing.",
    effects: [
      fx("flat", "metric", "publicsafety", "confidence", 0.03, "Heat action plan in force"),
      fx("flat", "metric", "infrastructure", "power", 0.02, "Grid reinforced"),
    ],
  },
});

const WET_BULB_HEAT = modernCrisis({
  name: "Lethal Humid Heat Wave",
  heroImage: HERO.heat,
  description:
    "Heat and humidity climb past the point where the human body can cool itself outdoors. Outdoor work stops, crops wilt in the field and the old and the poor are at mortal risk without air conditioning.",
  durationTurns: 5,
  fromYear: 2038,
  untilYear: 2050,
  trigger: random(144, 0.004),
  effects: [
    fx("tick", "metric", "economy", "gdp", -0.012, "Outdoor work halted"),
    fx("tick", "metric", "economy", "foodPrices", 0.015, "Field crops fail in the heat"),
    fx("tick", "metric", "publicsafety", "confidence", -0.03, "Fear of the next heat wave"),
    fx("tick", "approval", "government", "overall", -0.03, "Anger at the mortality toll"),
  ],
  wireStart: "Dangerous humid heat has gripped the country. Outdoor work has been suspended.",
  wireEnd: "The humid heat lifts. Work resumes and mortality figures are published.",
  prompt: {
    title: "Humid heat response",
    description:
      "Outdoor work is unsafe and the poorest homes have no cooling. How does the government respond?",
  },
  options: [
    {
      id: "heat_subsidy",
      label: "Subsidize cooling for poor households",
      description:
        "Fund cooling units and power bills for the vulnerable. Expensive, but it shortens the emergency and saves lives.",
      effects: [
        fx("flat", "metric", "publicsafety", "confidence", 0.05, "Mortality contained"),
        fx("flat", "metric", "economy", "gdp", -0.005, "Subsidy costs"),
      ],
      cutsTurns: 1,
    },
    {
      id: "work_ban",
      label: "Mandate paid heat days",
      description:
        "Require employers to stop outdoor work at dangerous readings with pay protected. Workers are protected, margins are not.",
      effects: [
        fx("flat", "metric", "publicsafety", "confidence", 0.03, "Workers protected"),
        marginShock(-2, "Mandatory paid heat days", "physical"),
      ],
    },
    {
      id: "market_response",
      label: "Leave it to the market",
      description: "No new rules. People who can afford cooling cope, and the rest do not.",
      effects: [fx("flat", "approval", "government", "overall", -0.03, "Seen as indifferent")],
    },
  ],
  fund: {
    title: "Adaptation fund",
    description:
      "Governments may pool money for passive cooling, grid reinforcement and heat early warning. Full funding speeds recovery.",
    target: 25_000_000,
  },
  outcome: {
    message:
      "The heat has broken and an adaptation program is under way. Early warning now reaches the vulnerable before the heat does.",
    effects: [
      fx("flat", "metric", "publicsafety", "confidence", 0.03, "Early warning in place"),
      fx("flat", "metric", "economy", "unemployment", -0.01, "Adaptation works hire locally"),
    ],
  },
});

const MEGAFIRE_SEASON = modernCrisis({
  name: "Megafire Season",
  heroImage: HERO.fire,
  description:
    "A season of linked wildfires burns for weeks across forest and suburb alike. Smoke closes airports, insurers pull out of fire zones and whole towns are evacuated.",
  durationTurns: 6,
  fromYear: 2027,
  untilYear: 2045,
  trigger: random(144, 0.003),
  effects: [
    gdpLoss(0.012, "Burned property and lost output"),
    fx("tick", "metric", "economy", "housing", -0.01, "Fire zone property values fall"),
    fx("tick", "metric", "publicsafety", "confidence", -0.03, "Smoke and evacuation fear"),
    fx("tick", "approval", "government", "overall", -0.025, "Anger at the fire response"),
  ],
  wireStart: "A megafire season has begun. Evacuation orders cover several districts.",
  wireEnd: "Rain finally smothers the fires. The count of lost homes is released.",
  prompt: {
    title: "Fire season response",
    description: "The fires are outrunning the crews. What is the emergency posture?",
  },
  options: [
    {
      id: "national_mobilize",
      label: "Mobilize the national fire service and army",
      description:
        "Bring in every crew, aircraft and soldier available. Costs heavily but saves towns and shortens the season.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.006, "Mobilization costs"),
        fx("flat", "metric", "publicsafety", "confidence", 0.04, "Visible national effort"),
      ],
      cutsTurns: 2,
    },
    {
      id: "controlled_burns",
      label: "Fast-track prescribed burns and fuel clearing",
      description:
        "Fight today's fires as best you can and fund fuel clearing to blunt the next season.",
      effects: [
        fx("flat", "metric", "publicsafety", "confidence", 0.02, "Long-term fire plan"),
        fx("flat", "metric", "economy", "unemployment", -0.008, "Crews hired for clearing"),
      ],
    },
    {
      id: "local_lead",
      label: "Let regions lead",
      description: "Support regional fire services with modest aid and stay out of the way.",
      effects: [fx("flat", "approval", "government", "overall", -0.02, "Slow, uneven response")],
    },
  ],
  fund: {
    title: "Fire recovery fund",
    description:
      "Governments may pool money to rebuild burned towns and underwrite fire-zone insurance. Full funding speeds recovery.",
    target: 20_000_000,
  },
  outcome: {
    message:
      "Evacuees are returning and rebuilding has begun under new fire-safe building rules. The fuel clearing program continues.",
    effects: [
      fx("flat", "metric", "economy", "housing", 0.015, "Rebuilding restores confidence"),
      fx("flat", "metric", "economy", "unemployment", -0.01, "Reconstruction jobs"),
    ],
  },
});

const MEGADROUGHT = modernCrisis({
  name: "Megadrought",
  heroImage: HERO.drought,
  description:
    "A drought now in its fifth year has emptied reservoirs and aquifers. Farms fallow, river barges run aground and cities argue over every cubic meter of water.",
  durationTurns: 10,
  fromYear: 2031,
  untilYear: 2050,
  trigger: random(288, 0.002),
  effects: [
    fx("tick", "metric", "economy", "gdp", -0.01, "Farm and river output collapse"),
    fx("tick", "metric", "economy", "foodPrices", 0.02, "Food prices climb"),
    fx("tick", "metric", "economy", "exports", -0.015, "Lost crop exports"),
    fx("tick", "approval", "government", "overall", -0.02, "Public anger over water"),
  ],
  wireStart: "Reservoirs are at record lows. The multi-year drought is now a national emergency.",
  wireEnd: "Rains return and reservoirs begin to recover. The drought emergency is lifted.",
  prompt: {
    title: "Drought strategy",
    description: "The drought shows no sign of ending. What is the long-term response?",
  },
  options: [
    {
      id: "desal_build",
      label: "Fund desalination and water reuse",
      description:
        "Commit to coastal desalination and wastewater recycling. Slow and costly, but it ends the dependence on rain and shortens the crisis.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.008, "Capital outlay"),
        fx("flat", "metric", "infrastructure", "power", -0.01, "New plants draw heavy power"),
      ],
      cutsTurns: 2,
    },
    {
      id: "farm_buyout",
      label: "Buy out the thirstiest farms",
      description:
        "Pay farmers to retire water-hungry crops. Saves the aquifer and hurts rural communities.",
      effects: [
        fx("flat", "metric", "economy", "foodPrices", 0.01, "Fewer acres in production"),
        fx("flat", "approval", "government", "overall", -0.015, "Rural backlash"),
      ],
    },
    {
      id: "cloud_seed",
      label: "Pour money into stopgaps",
      description:
        "Trucked water, cloud seeding and emergency wells. Visible effort, little lasting effect.",
      effects: [fx("flat", "approval", "government", "overall", 0.005, "Seen to be acting")],
    },
  ],
  fund: {
    title: "Drought relief fund",
    description:
      "Governments may pool money for emergency water supply and farm credit. Full funding speeds recovery.",
    target: 30_000_000,
  },
  outcome: {
    message:
      "Reservoirs are rising and a long-term water plan is in force. Farms are switching to crops that suit the new climate.",
    effects: [
      fx("flat", "metric", "economy", "foodPrices", -0.015, "Harvests recover"),
      fx("flat", "metric", "economy", "gdp", 0.008, "Farm output returns"),
    ],
  },
});

const WATER_RATIONING = modernCrisis({
  name: "Municipal Water Rationing",
  heroImage: HERO.water,
  description:
    "Supply from the main reservoirs falls below demand. Cities impose strict rationing, factories cut shifts, and politicians argue over who gets cut off first.",
  durationTurns: 6,
  fromYear: 2033,
  untilYear: 2050,
  trigger: random(216, 0.0028),
  effects: [
    fx("tick", "metric", "economy", "gdp", -0.007, "Water-intensive industry throttled"),
    fx("tick", "metric", "publicsafety", "confidence", -0.025, "Anxiety over supply"),
    fx("tick", "approval", "government", "overall", -0.03, "Anger at rationing"),
    marginShock(-3, "Industrial water cuts", "financial", "manufacturing"),
  ],
  wireStart: "Cities have begun water rationing. Industrial users face mandatory cuts.",
  wireEnd: "Reservoirs recover and rationing ends.",
  prompt: {
    title: "Water allocation",
    description: "There is not enough water for everyone. Who is protected first?",
  },
  options: [
    {
      id: "households_first",
      label: "Households first, industry second",
      description:
        "Guarantee basic household supply and cut industrial allocations hard. Popular at home, costly for factories.",
      effects: [
        fx("flat", "approval", "government", "overall", 0.02, "Households protected"),
        marginShock(-2, "Deeper industrial cuts", "physical", "manufacturing"),
      ],
    },
    {
      id: "price_tiers",
      label: "Tiered water pricing",
      description:
        "Let heavy users pay sharply more. Cuts waste and raises money for repairs, and it shortens the shortage.",
      effects: [
        fx("flat", "metric", "economy", "foodPrices", 0.005, "Higher bills pass through"),
        fx("flat", "metric", "infrastructure", "damage", -0.02, "Leak repairs funded"),
      ],
      cutsTurns: 1,
    },
    {
      id: "tanker_relief",
      label: "Truck in emergency supply",
      description: "Buy and haul water to the worst hit districts. A short-term patch.",
      effects: [fx("flat", "metric", "economy", "gdp", -0.004, "Emergency purchases")],
    },
  ],
  fund: {
    title: "Water security fund",
    description:
      "Governments may pool money for leak repair, recycling and storage. Full funding speeds recovery.",
    target: 18_000_000,
  },
  outcome: {
    message:
      "Rationing has ended and a leak repair program is under way. New storage and recycling plants are being commissioned.",
    effects: [
      fx("flat", "metric", "infrastructure", "damage", -0.03, "Water network repaired"),
      fx("flat", "metric", "publicsafety", "confidence", 0.02, "Supply secured"),
    ],
  },
});

const GRID_EMERGENCY = modernCrisis({
  name: "Grid Emergency",
  heroImage: HERO.grid,
  description:
    "Peak demand from data centers, electric heating and cooling meets a thin reserve margin. Operators warn of cascading failure unless load is shed within hours.",
  durationTurns: 3,
  fromYear: 2028,
  untilYear: 2050,
  trigger: random(144, 0.0035),
  effects: [
    fx("tick", "metric", "infrastructure", "power", -0.03, "Reserve margin exhausted"),
    fx("tick", "metric", "economy", "gdp", -0.006, "Scheduled outages hit output"),
    marginShock(-3, "Curtailed power supply", "physical"),
    fx("tick", "approval", "government", "overall", -0.025, "Anger at the outages"),
  ],
  wireStart: "Grid operators have declared an emergency. Controlled outages may follow tonight.",
  wireEnd: "Reserve margins are restored. The grid emergency is over.",
  prompt: {
    title: "Grid emergency response",
    description: "The system has hours before forced blackouts. What takes priority?",
  },
  options: [
    {
      id: "demand_response",
      label: "Call on demand response and curtail data centers",
      description:
        "Pay large users to cut load and order data centers onto backup. Keeps homes lit and shortens the emergency, and the tech sector complains.",
      effects: [
        fx("flat", "metric", "infrastructure", "power", 0.04, "Load shed from big users"),
        fx("flat", "metric", "economy", "investorConfidence", -0.01, "Tech operators protest"),
      ],
      cutsTurns: 1,
    },
    {
      id: "emergency_imports",
      label: "Buy emergency power from neighbors",
      description: "Pay premium prices for imports across the interconnectors.",
      effects: [
        fx("flat", "metric", "economy", "inflation", 0.004, "Spike in electricity prices"),
        fx("flat", "metric", "infrastructure", "power", 0.03, "Imports cover the gap"),
      ],
    },
    {
      id: "rolling_blackouts",
      label: "Accept controlled blackouts",
      description: "Protect the system and shed neighborhoods in rotation.",
      effects: [fx("flat", "approval", "government", "overall", -0.03, "Anger at the blackouts")],
    },
  ],
  fund: {
    title: "Grid storage fund",
    description:
      "Governments may pool money for batteries, interconnectors and demand response. Full funding speeds recovery.",
    target: 22_000_000,
  },
  outcome: {
    message:
      "Reserve margins are back and storage procurement is under way. Grid operators now run stress drills every season.",
    effects: [
      fx("flat", "metric", "infrastructure", "power", 0.03, "Storage capacity added"),
      fx("flat", "metric", "economy", "renewableShare", 0.01, "Storage unlocks more renewables"),
    ],
  },
});

const SOLAR_STORM = modernCrisis({
  name: "Severe Solar Storm",
  heroImage: HERO.grid,
  description:
    "The strongest geomagnetic storm in generations induces currents in long power lines and transformers. Satellites tumble, navigation fails and parts of the grid trip offline.",
  scope: "global",
  durationTurns: 4,
  fromYear: 2027,
  untilYear: 2050,
  trigger: random(432, 0.0006, "global"),
  effects: [
    fx(
      "tick",
      "metric",
      "infrastructure",
      "power",
      -0.04,
      "Transformers tripped by induced current"
    ),
    fx("tick", "metric", "economy", "gdp", -0.01, "Satellite and navigation outages"),
    marginShock(-3, "Power and logistics disruption", "financial"),
    fx("tick", "approval", "government", "overall", -0.015, "Public alarm"),
  ],
  wireStart: "A severe solar storm is hitting Earth. Power and satellite services are failing.",
  wireEnd: "The storm has passed. Operators are restoring power and replacing satellites.",
  prompt: {
    title: "Solar storm response",
    description:
      "Grid operators ask for emergency powers to protect the system. What do you order?",
  },
  options: [
    {
      id: "protect_grid",
      label: "Order precautionary shutdowns",
      description:
        "Disconnect vulnerable lines and transformers before the surge. A planned outage now to avoid months of repairs, and it shortens the crisis.",
      effects: [
        fx("flat", "metric", "infrastructure", "power", 0.03, "Transformers saved"),
        fx("flat", "metric", "economy", "gdp", -0.004, "Planned outage cost"),
      ],
      cutsTurns: 1,
    },
    {
      id: "spare_stock",
      label: "Release the national spare transformer stock",
      description: "Swap damaged units from the strategic reserve and restore service fast.",
      effects: [
        fx("flat", "metric", "infrastructure", "power", 0.025, "Spares speed restoration"),
        fx("flat", "metric", "infrastructure", "damage", -0.01, "Reserve drawn down"),
      ],
    },
    {
      id: "wait_and_see",
      label: "Wait for operators to assess damage",
      description: "Leave decisions to the grid operators and the weather service.",
      effects: [fx("flat", "approval", "government", "overall", -0.02, "Seen as unprepared")],
    },
  ],
  fund: {
    title: "Space weather resilience fund",
    description:
      "Governments may pool money for hardened transformers and satellite replacement. Full funding speeds recovery.",
    target: 25_000_000,
  },
  outcome: {
    message:
      "Power is back and damaged satellites are being replaced. A space weather protection standard is now in force for new grid equipment.",
    effects: [
      fx("flat", "metric", "infrastructure", "power", 0.03, "Hardened equipment standard"),
      fx("flat", "metric", "publicsafety", "confidence", 0.02, "Forecasting improved"),
    ],
  },
});

const ORBITAL_DEBRIS = modernCrisis({
  name: "Orbital Debris Outage",
  heroImage: HERO.cyber,
  description:
    "A collision in a crowded orbit throws off a cloud of fragments that takes out a cluster of communications and navigation satellites. Phones, shipping and aviation lose service across the region.",
  durationTurns: 5,
  fromYear: 2040,
  untilYear: 2050,
  trigger: random(216, 0.0025),
  effects: [
    fx("tick", "metric", "economy", "gdp", -0.009, "Telecom and navigation outage"),
    fx("tick", "metric", "economy", "exports", -0.01, "Shipping and aviation disruption"),
    fx("tick", "metric", "economy", "consumerConfidence", -0.015, "Connectivity loss"),
    fx("tick", "approval", "government", "overall", -0.02, "Anger at the outage"),
  ],
  wireStart: "A satellite collision has knocked out regional communications and navigation.",
  wireEnd: "Replacement satellites are in service. Connectivity is restored.",
  prompt: {
    title: "Orbital debris response",
    description: "Services are failing and more collisions are possible. What is the response?",
  },
  options: [
    {
      id: "traffic_law",
      label: "Impose a binding space traffic regime",
      description:
        "Require tracking, maneuvering and end-of-life disposal for every operator. Raises costs for operators and shortens the crisis.",
      effects: [
        fx("flat", "metric", "economy", "investorConfidence", -0.008, "Operators face new costs"),
        fx("flat", "metric", "publicsafety", "confidence", 0.02, "Risk of repeat falls"),
      ],
      cutsTurns: 1,
    },
    {
      id: "fund_removal",
      label: "Fund active debris removal",
      description: "Pay for removal missions and fast launches of replacements.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.005, "Public spending on launches"),
        fx("flat", "metric", "economy", "unemployment", -0.008, "Space sector hiring"),
      ],
    },
    {
      id: "fall_back",
      label: "Fall back on ground networks",
      description: "Route critical services over fiber and radio and wait for operators to repair.",
      effects: [fx("flat", "approval", "government", "overall", -0.015, "Slow restoration")],
    },
  ],
  fund: {
    title: "Orbital recovery fund",
    description:
      "Governments may pool money for replacement satellites and debris removal. Full funding speeds recovery.",
    target: 25_000_000,
  },
  outcome: {
    message:
      "Service is restored and a debris tracking program is running. Operators now carry mandatory disposal insurance.",
    effects: [
      fx("flat", "metric", "economy", "consumerConfidence", 0.02, "Connectivity restored"),
      fx("flat", "metric", "economy", "exports", 0.01, "Shipping lanes reopen"),
    ],
  },
});

// ── FINANCE AND HOUSING ────────────────────────────────────────────────────

const HOUSING_RATE_RESET = modernCrisis({
  name: "Housing Rate Reset Crash",
  heroImage: HERO.housing,
  description:
    "A wave of cheap fixed-rate mortgages ends at once and household payments jump. Forced sales climb, prices fall and builders stop work on half-finished estates.",
  durationTurns: 8,
  fromYear: 2027,
  untilYear: 2036,
  trigger: random(216, 0.003),
  effects: [
    fx("tick", "metric", "economy", "housing", -0.025, "Forced sales push prices down"),
    fx("tick", "metric", "economy", "consumerConfidence", -0.02, "Households cut spending"),
    fx("tick", "metric", "economy", "unemployment", 0.01, "Construction layoffs"),
    marginShock(-4, "Mortgage and construction losses", "financial", "financial"),
  ],
  wireStart: "Mortgage payments are resetting sharply higher. Home prices are falling fast.",
  wireEnd: "Prices stabilize and forced sales ebb.",
  prompt: {
    title: "Housing crash response",
    description: "Households cannot pay and prices are falling. What does the government do?",
  },
  options: [
    {
      id: "payment_holiday",
      label: "Mortgage payment holiday and refinancing",
      description:
        "Let banks defer payments and refinance at a state-backed rate. Stops the spiral and shortens the downturn, at some cost to the budget.",
      effects: [
        fx("flat", "metric", "economy", "housing", 0.02, "Forced sales avoided"),
        fx("flat", "metric", "economy", "gdp", -0.005, "Fiscal cost of the program"),
      ],
      cutsTurns: 2,
    },
    {
      id: "bulk_buy",
      label: "Buy distressed homes for social housing",
      description:
        "A public buyer takes homes off the market at a discount and rents them to families in need.",
      effects: [
        fx("flat", "metric", "economy", "housing", 0.01, "Public buyer supports prices"),
        fx("flat", "approval", "government", "overall", 0.01, "Housing for families"),
      ],
    },
    {
      id: "let_it_clear",
      label: "Let the market clear",
      description: "No intervention. Prices find a floor, and many households lose their homes.",
      effects: [fx("flat", "approval", "government", "overall", -0.03, "Seen as callous")],
    },
  ],
  fund: {
    title: "Housing stabilization fund",
    description:
      "Governments may pool money to backstop mortgage lenders and finish stalled building. Full funding speeds recovery.",
    target: 25_000_000,
  },
  outcome: {
    message:
      "Prices have steadied and stalled estates are being finished. Lenders now stress-test borrowers against rate resets.",
    effects: [
      fx("flat", "metric", "economy", "housing", 0.015, "Market finds a floor"),
      fx("flat", "metric", "economy", "unemployment", -0.01, "Building resumes"),
    ],
  },
});

const PENSION_CLIFF = modernCrisis({
  name: "Pension Funding Cliff",
  heroImage: HERO.bank,
  description:
    "The public pension fund's reserves run out years before projected as retirees outnumber contributors. Benefits must be cut, contributions raised or the shortfall borrowed.",
  durationTurns: 10,
  fromYear: 2032,
  untilYear: 2048,
  trigger: random(288, 0.002),
  effects: [
    fx(
      "tick",
      "metric",
      "economy",
      "investorConfidence",
      -0.015,
      "Bond markets price the shortfall"
    ),
    fx("tick", "metric", "economy", "consumerConfidence", -0.015, "Retirees fear for incomes"),
    fx("tick", "approval", "government", "overall", -0.03, "Anger across generations"),
  ],
  wireStart: "The pension fund is running dry years early. Reform talks have begun.",
  wireEnd: "A pension settlement is agreed. The funding gap is closed on paper.",
  prompt: {
    title: "Pension settlement",
    description: "The fund cannot pay what has been promised. Who bears the cost?",
  },
  options: [
    {
      id: "raise_contributions",
      label: "Raise contributions and retirement age together",
      description:
        "A balanced package that asks something of workers and employers alike. Painful now, credible to markets, and it shortens the crisis.",
      effects: [
        fx("flat", "metric", "economy", "investorConfidence", 0.03, "Credible long-term plan"),
        fx("flat", "approval", "government", "overall", -0.03, "Backlash from workers"),
      ],
      cutsTurns: 2,
    },
    {
      id: "borrow_gap",
      label: "Borrow to cover the gap",
      description: "Issue debt to pay current benefits and postpone the choice.",
      effects: [
        fx("flat", "metric", "economy", "investorConfidence", -0.02, "Rising debt load"),
        fx("flat", "approval", "government", "overall", 0.01, "Benefits protected for now"),
      ],
    },
    {
      id: "cut_benefits",
      label: "Cut benefits for future retirees",
      description: "Trim promised benefits for younger workers and protect today's pensioners.",
      effects: [
        fx("flat", "metric", "economy", "investorConfidence", 0.02, "Gap narrowed"),
        fx("flat", "approval", "government", "overall", -0.04, "Youth and union backlash"),
      ],
    },
  ],
  fund: {
    title: "Pension transition fund",
    description:
      "Governments may pool money to cushion the transition for the oldest workers. Full funding speeds the settlement.",
    target: 30_000_000,
  },
  outcome: {
    message:
      "The reform has passed and the fund is solvent on its new schedule. Trust in the system will take longer to rebuild.",
    effects: [
      fx("flat", "metric", "economy", "investorConfidence", 0.02, "Fund solvent"),
      fx("flat", "metric", "economy", "consumerConfidence", 0.01, "Certainty restored"),
    ],
  },
});

const TECH_LENDER_RUN = modernCrisis({
  name: "Run on a Tech Lender",
  heroImage: HERO.bank,
  description:
    "A bank that lends mainly to start-ups and holds long bonds loses depositors in a single weekend. Companies cannot make payroll and the fear spreads to similar lenders.",
  durationTurns: 5,
  fromYear: 2027,
  untilYear: 2038,
  trigger: random(216, 0.0028),
  effects: [
    fx("tick", "metric", "economy", "investorConfidence", -0.035, "Contagion fear"),
    fx(
      "tick",
      "metric",
      "economic",
      "smallBusinessFormation",
      -0.02,
      "Credit to start-ups freezes"
    ),
    marginShock(-5, "Tech lender losses", "financial", "financial"),
    fx("tick", "approval", "government", "overall", -0.02, "Public anger at bank rescue talk"),
  ],
  wireStart: "Depositors are pulling money out of a major tech lender. Regulators are meeting.",
  wireEnd: "The lender is resolved and deposits are secure. Fear in the market subsides.",
  prompt: {
    title: "Tech lender resolution",
    description: "Hours remain before Monday's open. Do you guarantee deposits or let losses fall?",
  },
  options: [
    {
      id: "guarantee_deposits",
      label: "Guarantee all deposits",
      description:
        "Stop the run by guaranteeing every deposit and shortening the crisis. Taxpayers carry some risk and critics cry moral hazard.",
      effects: [
        fx("flat", "metric", "economy", "investorConfidence", 0.04, "Run halted"),
        fx("flat", "approval", "government", "overall", -0.015, "Bailout criticism"),
      ],
      cutsTurns: 2,
    },
    {
      id: "bridge_bank",
      label: "Seize the lender and sell it to a rival",
      description:
        "Resolve the bank over a weekend, wiping out shareholders and protecting insured deposits.",
      effects: [
        fx("flat", "metric", "economy", "investorConfidence", 0.02, "Orderly resolution"),
        fx("flat", "metric", "economic", "smallBusinessFormation", -0.01, "Lender franchise lost"),
      ],
    },
    {
      id: "let_fail",
      label: "Let uninsured depositors take losses",
      description: "Hold the line on moral hazard. The panic spreads to the next weakest lender.",
      effects: [
        fx("flat", "metric", "economy", "investorConfidence", -0.03, "Panic spreads"),
        fx("flat", "approval", "government", "overall", -0.02, "Founders lose their payroll"),
      ],
    },
  ],
  fund: {
    title: "Deposit stabilization fund",
    description:
      "Governments may pool money to backstop sound lenders. Full funding speeds recovery.",
    target: 25_000_000,
  },
  outcome: {
    message:
      "Deposits are safe and the run has ended. Regulators are tightening liquidity rules for lenders with concentrated books.",
    effects: [
      fx("flat", "metric", "economy", "investorConfidence", 0.02, "Rules tightened"),
      fx("flat", "metric", "economic", "smallBusinessFormation", 0.01, "Credit returns"),
    ],
  },
});

const INSURANCE_RETREAT = modernCrisis({
  name: "Climate Insurance Retreat",
  heroImage: HERO.tide,
  description:
    "After repeated disasters, major insurers withdraw from coastal and fire-prone districts. Mortgages cannot be written, property values slide and the state is pushed into the role of insurer of last resort.",
  durationTurns: 8,
  fromYear: 2036,
  untilYear: 2050,
  trigger: random(288, 0.002),
  effects: [
    fx("tick", "metric", "economy", "housing", -0.02, "Uninsurable property loses value"),
    fx("tick", "metric", "economy", "investorConfidence", -0.012, "Reinsurance losses"),
    marginShock(-3, "Insurance withdrawal", "financial", "financial"),
    fx("tick", "approval", "government", "overall", -0.02, "Homeowners left exposed"),
  ],
  wireStart: "Major insurers are pulling out of high-risk districts. Property values are sliding.",
  wireEnd: "A public insurance backstop is in place. Mortgage lending resumes.",
  prompt: {
    title: "Insurance backstop",
    description: "Whole districts are becoming uninsurable. What is the state's role?",
  },
  options: [
    {
      id: "public_backstop",
      label: "Create a public insurer of last resort",
      description:
        "A state-backed pool covers high-risk homes at risk-based premiums. Restores lending and shortens the slump, and exposes the budget.",
      effects: [
        fx("flat", "metric", "economy", "housing", 0.02, "Lending resumes"),
        fx(
          "flat",
          "metric",
          "economy",
          "investorConfidence",
          -0.008,
          "Contingent liability on the budget"
        ),
      ],
      cutsTurns: 2,
    },
    {
      id: "managed_retreat",
      label: "Fund managed retreat from the worst districts",
      description: "Buy out homeowners in the highest-risk districts and restore the land.",
      effects: [
        fx("flat", "metric", "economy", "housing", -0.005, "Districts emptied"),
        fx("flat", "metric", "publicsafety", "confidence", 0.02, "People moved out of harm's way"),
      ],
    },
    {
      id: "market_pricing",
      label: "Let premiums find their level",
      description: "No state role. Premiums reflect risk, and many owners cannot afford them.",
      effects: [fx("flat", "approval", "government", "overall", -0.03, "Owners priced out")],
    },
  ],
  fund: {
    title: "Resilience and retreat fund",
    description:
      "Governments may pool money for sea walls, buyouts and reinsurance. Full funding speeds recovery.",
    target: 30_000_000,
  },
  outcome: {
    message:
      "A risk-based insurance pool is operating and the worst districts are being phased out of new building.",
    effects: [
      fx("flat", "metric", "economy", "housing", 0.015, "Market clarity"),
      fx("flat", "metric", "publicsafety", "confidence", 0.02, "Exposure reduced"),
    ],
  },
});

// ── TECHNOLOGY AND INDUSTRY ────────────────────────────────────────────────

const CHIP_FAB_FIRE = modernCrisis({
  name: "Chip Fab Fire",
  heroImage: HERO.industry,
  description:
    "A fire shuts a leading chip fabrication plant. Carmakers, phone makers and defense contractors that depend on its output face weeks of idle lines, and spot prices for chips spike.",
  durationTurns: 6,
  fromYear: 2027,
  untilYear: 2040,
  trigger: random(216, 0.0028),
  effects: [
    marginShock(-5, "Chip shortage idles production lines", "physical", "manufacturing"),
    fx("tick", "metric", "economy", "exports", -0.015, "Electronics exports stall"),
    fx("tick", "metric", "economy", "inflation", 0.006, "Component prices spike"),
    fx("tick", "approval", "government", "overall", -0.015, "Layoffs at idled plants"),
  ],
  wireStart: "A fire has shut a major chip plant. Manufacturers are warning of idle lines.",
  wireEnd: "The plant restarts. Chip deliveries return to normal.",
  prompt: {
    title: "Chip supply response",
    description: "Industries are queuing for scarce chips. How does the government respond?",
  },
  options: [
    {
      id: "allocate_chips",
      label: "Allocate scarce chips to critical users",
      description:
        "Prioritize medical, defense and power equipment makers. Protects essentials, leaves consumer goods short.",
      effects: [
        fx("flat", "metric", "publicsafety", "confidence", 0.02, "Essentials protected"),
        fx("flat", "metric", "economy", "consumerConfidence", -0.01, "Consumer shortages"),
      ],
    },
    {
      id: "fast_restart",
      label: "Fund a rapid restart and rebuild",
      description:
        "Underwrite emergency repairs and clean-room replacement equipment. Costly, and it shortens the shortage.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.004, "Public support spend"),
        fx("flat", "metric", "economy", "investorConfidence", 0.015, "Capacity back sooner"),
      ],
      cutsTurns: 2,
    },
    {
      id: "wait_for_market",
      label: "Leave it to buyers and the plant",
      description: "No state role. Buyers bid up scarce chips and the weakest firms cut shifts.",
      effects: [fx("flat", "approval", "government", "overall", -0.015, "Seen as absent")],
    },
  ],
  fund: {
    title: "Domestic fab resilience fund",
    description:
      "Governments may pool money for backup fabrication capacity and chip stockpiles. Full funding speeds recovery.",
    target: 20_000_000,
  },
  outcome: {
    message:
      "Production is running again and a national chip reserve is being built. Fabs now share fire safety audits with the regulator.",
    effects: [
      fx("flat", "metric", "economy", "exports", 0.015, "Electronics exports recover"),
      fx("flat", "metric", "economy", "investorConfidence", 0.01, "Supply chain buffers added"),
    ],
  },
});

const AI_MODEL_FAILURE = modernCrisis({
  name: "AI Model Failure Scandal",
  heroImage: HERO.info,
  description:
    "A widely deployed AI system is found to have been making flawed decisions for months in benefits, lending and hiring. Thousands were wrongly refused, and nobody can say who is accountable.",
  durationTurns: 5,
  fromYear: 2027,
  untilYear: 2044,
  trigger: random(216, 0.003),
  effects: [
    fx(
      "tick",
      "metric",
      "economy",
      "consumerConfidence",
      -0.012,
      "Public trust in automated decisions"
    ),
    fx("tick", "metric", "economy", "investorConfidence", -0.01, "Liability uncertainty"),
    fx("tick", "approval", "government", "overall", -0.03, "Anger at the wrongful refusals"),
  ],
  wireStart: "A flawed AI system is found to have wrongly refused thousands of claims.",
  wireEnd: "Affected people are being compensated and the system has been withdrawn.",
  prompt: {
    title: "Automated decision failure",
    description: "Victims want answers and the vendor says the system worked as designed.",
  },
  options: [
    {
      id: "audit_mandate",
      label: "Mandate audits and human appeal for automated decisions",
      description:
        "Require independent audits, logging and a human appeal route. Slows deployment and shortens the scandal.",
      effects: [
        fx("flat", "metric", "economy", "consumerConfidence", 0.02, "Trust partly restored"),
        fx(
          "flat",
          "metric",
          "economy",
          "investorConfidence",
          -0.008,
          "Compliance costs for AI firms"
        ),
      ],
      cutsTurns: 1,
    },
    {
      id: "compensation_fund",
      label: "Compensate the victims at public cost",
      description:
        "Pay back wrongly refused claims at once and seek recovery from the vendor later.",
      effects: [
        fx("flat", "approval", "government", "overall", 0.02, "Victims made whole"),
        fx("flat", "metric", "economy", "gdp", -0.003, "Compensation cost"),
      ],
    },
    {
      id: "blame_vendor",
      label: "Blame the vendor and change nothing",
      description:
        "Cancel the contract and issue a statement. The next system will fail the same way.",
      effects: [fx("flat", "approval", "government", "overall", -0.025, "Seen as evasive")],
    },
  ],
  fund: {
    title: "Algorithmic redress fund",
    description:
      "Governments may pool money for independent audit capacity and redress. Full funding speeds recovery.",
    target: 12_000_000,
  },
  outcome: {
    message:
      "An audit regime is operating and appeals are being heard by people. Vendors now carry liability for automated decisions.",
    effects: [
      fx("flat", "metric", "economy", "consumerConfidence", 0.015, "Appeal route in place"),
      fx("flat", "metric", "economic", "smallBusinessFormation", 0.005, "Clear rules for builders"),
    ],
  },
});

const PORT_STRIKE = modernCrisis({
  name: "Port Workers Strike",
  heroImage: HERO.port,
  description:
    "Dockworkers walk out over automation of terminal handling and the loss of jobs it brings. Ships queue at anchor and shelves empty inland.",
  durationTurns: 4,
  fromYear: 2027,
  untilYear: 2038,
  trigger: random(180, 0.003),
  effects: [
    marginShock(-4, "Port stoppage halts cargo", "physical", "logistics"),
    fx("tick", "metric", "economy", "exports", -0.02, "Cargo stuck at the quay"),
    fx("tick", "metric", "economy", "inflation", 0.004, "Shortages lift prices"),
    fx("tick", "approval", "government", "overall", -0.015, "Public frustration"),
  ],
  wireStart: "Port workers have walked out over automation. Ships are queuing outside the harbors.",
  wireEnd: "The port strike ends with a new automation agreement.",
  prompt: {
    title: "Port strike response",
    description:
      "Cargo is backing up. The union wants a job guarantee. What does the government do?",
  },
  options: [
    {
      id: "broker_deal",
      label: "Broker a deal with retraining guarantees",
      description:
        "Press both sides into a deal tying automation to paid retraining and job guarantees. Ends the strike sooner.",
      effects: [
        fx("flat", "metric", "economy", "unemployment", -0.005, "Retraining places funded"),
        fx("flat", "approval", "government", "overall", 0.015, "Strike settled"),
      ],
      cutsTurns: 2,
    },
    {
      id: "emergency_order",
      label: "Order the port back to work",
      description: "Use emergency powers to force reopening. Cargo moves, workers are furious.",
      effects: [
        fx("flat", "metric", "economy", "exports", 0.015, "Cargo moves again"),
        fx("flat", "approval", "government", "overall", -0.03, "Labor backlash"),
      ],
    },
    {
      id: "let_bargain",
      label: "Stay out of it",
      description: "Let the two sides bargain while the backlog grows.",
      effects: [fx("flat", "metric", "economy", "exports", -0.01, "Prolonged backlog")],
    },
  ],
  fund: {
    title: "Dockworker transition fund",
    description:
      "Governments may pool money for retraining and wage insurance for displaced dockworkers. Full funding speeds recovery.",
    target: 12_000_000,
  },
  outcome: {
    message:
      "The backlog has cleared and the new automation agreement is holding. Retraining places are filling.",
    effects: [
      fx("flat", "metric", "economy", "exports", 0.012, "Cargo flow restored"),
      fx("flat", "metric", "economy", "unemployment", -0.008, "Displaced workers retrained"),
    ],
  },
});

const DEPOT_LOCKOUT = modernCrisis({
  name: "Robotic Depot Lockout",
  heroImage: HERO.labor,
  description:
    "Logistics firms lock out unionized staff as they switch warehouses and trucking to autonomous fleets. Delivery networks seize up and the dispute becomes a national argument about who owns the gains from automation.",
  durationTurns: 5,
  fromYear: 2039,
  untilYear: 2050,
  trigger: random(216, 0.003),
  effects: [
    marginShock(-3, "Distribution network disrupted", "physical", "logistics"),
    fx("tick", "metric", "economy", "unemployment", 0.012, "Mass displacement"),
    fx("tick", "metric", "economy", "realWages", -0.01, "Wage pressure from automation"),
    fx("tick", "approval", "government", "overall", -0.025, "Anger over lost jobs"),
  ],
  wireStart: "Logistics firms have locked out staff in a shift to autonomous fleets.",
  wireEnd: "The lockout ends with a transition agreement.",
  prompt: {
    title: "Automation lockout response",
    description: "Workers and firms are at an impasse. What is the government's position?",
  },
  options: [
    {
      id: "wage_insurance",
      label: "Offer wage insurance and a shared-gains levy",
      description:
        "Tax part of the automation gains to fund wage insurance for displaced staff. Ends the dispute sooner and irritates investors.",
      effects: [
        fx("flat", "metric", "economy", "realWages", 0.015, "Incomes cushioned"),
        fx("flat", "metric", "economy", "investorConfidence", -0.01, "Levy on automation gains"),
      ],
      cutsTurns: 2,
    },
    {
      id: "slow_rollout",
      label: "Legislate a phased rollout",
      description: "Cap the pace of fleet conversion for three years and require notice.",
      effects: [
        fx("flat", "metric", "economy", "unemployment", -0.006, "Layoffs spread over time"),
        fx("flat", "metric", "economy", "gdp", -0.004, "Slower productivity gains"),
      ],
    },
    {
      id: "back_firms",
      label: "Back the firms",
      description: "Defend the right to automate and offer only generic jobs help.",
      effects: [fx("flat", "approval", "government", "overall", -0.03, "Labor backlash")],
    },
  ],
  fund: {
    title: "Worker transition fund",
    description:
      "Governments may pool money for retraining and regional jobs. Full funding speeds recovery.",
    target: 20_000_000,
  },
  outcome: {
    message:
      "The dispute is settled and a transition scheme is paying out. Retrained drivers and loaders are moving into new roles.",
    effects: [
      fx("flat", "metric", "economy", "unemployment", -0.01, "Retrained workers placed"),
      fx("flat", "metric", "economy", "realWages", 0.008, "Gains partly shared"),
    ],
  },
});

export const MODERN_2027_CRISIS_TEMPLATES: Record<string, CrisisTemplate> = {
  heat_dome_emergency: HEAT_DOME,
  lethal_humid_heat_wave: WET_BULB_HEAT,
  megafire_season: MEGAFIRE_SEASON,
  megadrought: MEGADROUGHT,
  municipal_water_rationing: WATER_RATIONING,
  grid_emergency: GRID_EMERGENCY,
  severe_solar_storm: SOLAR_STORM,
  orbital_debris_outage: ORBITAL_DEBRIS,
  housing_rate_reset_crash: HOUSING_RATE_RESET,
  pension_funding_cliff: PENSION_CLIFF,
  tech_lender_run: TECH_LENDER_RUN,
  climate_insurance_retreat: INSURANCE_RETREAT,
  chip_fab_fire: CHIP_FAB_FIRE,
  ai_model_failure_scandal: AI_MODEL_FAILURE,
  port_workers_strike: PORT_STRIKE,
  robotic_depot_lockout: DEPOT_LOCKOUT,
};
