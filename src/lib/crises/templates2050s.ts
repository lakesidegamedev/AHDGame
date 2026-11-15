import type { CrisisTemplate } from "@/lib/db/types/crisis";
import { fx, gdpLoss, marginShock } from "@/lib/crises/templateHelpers";
import { HERO, modernCrisis, random } from "@/lib/crises/templates2027";

/**
 * Crisis templates for the 2050s. Same shape as the 2027 to 2050 set: a
 * response choice, a funded collective node, then a terminal outcome. Some roll
 * at random and some are armed by the state of the country (unemployment, grid
 * reliability, inflation), so a well-run country can go the whole decade
 * without seeing them. Themes that fade carry an earlier `untilYear`.
 */

const HEAT_COLLAPSE = modernCrisis({
  name: "Continental Heat Collapse",
  heroImage: HERO.heat,
  description:
    "A heat wave has sat over {location} for most of the summer, and the cooling systems people depend on are failing one by one. Outdoor work stops, crops scorch and the old and the sick suffer first. Output drops about 1% at once. For about 5 turns the grid falls short of demand and approval falls with the heat response.",
  durationTurns: 5,
  fromYear: 2050,
  untilYear: 2059,
  trigger: random(144, 0.0035),
  effects: [
    gdpLoss(0.01, "Outdoor work halts"),
    fx("tick", "metric", "infrastructure", "power", -0.02, "Cooling demand overwhelms supply"),
    fx("tick", "approval", "government", "overall", -0.025, "Anger at the heat response"),
  ],
  wireStart:
    "A record heat wave is wearing down {location}. Cooling systems are failing in several cities.",
  wireEnd: "Temperatures finally fall. Cities start counting the cost.",
  prompt: {
    title: "Heat emergency response",
    description: "Power is short and hospitals are full. What does the government do?",
  },
  options: [
    {
      id: "district_cooling",
      label: "Open district cooling hubs and pay for the power",
      description:
        "Fund cooling hubs in every district and subsidize the electricity. Expensive, but it protects the vulnerable and shortens the crisis.",
      effects: [
        fx("flat", "metric", "publicsafety", "confidence", 0.04, "Visible care for the vulnerable"),
        fx("flat", "metric", "economy", "gdp", -0.004, "Emergency spending"),
      ],
      cutsTurns: 1,
    },
    {
      id: "shift_hours",
      label: "Order work to shift to nights",
      description:
        "Move outdoor and factory work to the cool hours. It keeps output up, but workers and families pay for it.",
      effects: [
        fx("flat", "metric", "economy", "gdp", 0.002, "Output partly protected"),
        fx("flat", "approval", "workers", "overall", -0.025, "Night work resented"),
      ],
    },
    {
      id: "advise_and_wait",
      label: "Issue advisories and wait",
      description: "Publish guidance and leave utilities and councils to cope.",
      effects: [fx("flat", "approval", "government", "overall", -0.02, "Seen as detached")],
    },
  ],
  fund: {
    title: "Heat resilience fund",
    description:
      "Pooled money for shade, cool roofs and power backup. Full funding speeds recovery.",
    target: 18_000_000,
  },
  outcome: {
    message:
      "Hospitals have cleared the surge. A permanent heat plan with cooling hubs and backup power is now in force.",
    effects: [
      fx("flat", "metric", "publicsafety", "confidence", 0.03, "Heat plan in force"),
      fx("flat", "metric", "infrastructure", "power", 0.02, "Grid reinforced"),
    ],
  },
});

const SURGE_FLOOD = modernCrisis({
  name: "Coastal Storm Surge Flood",
  heroImage: HERO.tide,
  description:
    "A powerful storm has pushed a wall of sea water over the coastal defenses of {location}. Streets, substations and ports are under water and thousands have been evacuated. Output drops about 1.1% at once. For about 5 turns flooded property loses value, networks need repair and approval falls with the response.",
  durationTurns: 5,
  fromYear: 2050,
  untilYear: 2059,
  trigger: random(144, 0.0035),
  effects: [
    gdpLoss(0.011, "Flooded ports and districts"),
    fx("tick", "metric", "economy", "housing", -0.012, "Flooded property loses value"),
    fx("tick", "metric", "infrastructure", "damage", 0.02, "Flood damage to networks"),
    fx("tick", "approval", "government", "overall", -0.025, "Anger at the flood response"),
  ],
  wireStart:
    "A storm surge has broken through the coastal defenses of {location}. Evacuations are under way.",
  wireEnd: "The water has gone. The long clean-up begins.",
  prompt: {
    title: "Flood response",
    description: "Thousands are displaced and the defences need rebuilding. What is the plan?",
  },
  options: [
    {
      id: "rebuild_stronger",
      label: "Rebuild the defences to a higher standard",
      description:
        "Commit to taller, wider defences and raise the building code. Costly now, safer later.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.005, "Heavy rebuilding spend"),
        fx("flat", "metric", "publicsafety", "confidence", 0.03, "Credible long-term protection"),
      ],
      cutsTurns: 1,
    },
    {
      id: "managed_retreat",
      label: "Buy out the worst-hit streets and move people inland",
      description:
        "Pay owners to leave the lowest ground. Cuts the risk for good, but the buyouts are bitter for those who stay attached to home.",
      effects: [
        fx("flat", "metric", "economy", "housing", -0.008, "Buyouts reshape the market"),
        fx("flat", "approval", "base", "overall", -0.02, "Families forced to move"),
      ],
    },
    {
      id: "patch_and_pray",
      label: "Patch the damage and hope",
      description: "Repair what broke and keep the old plan.",
      effects: [fx("flat", "approval", "government", "overall", -0.025, "Seen as unprepared")],
    },
  ],
  fund: {
    title: "Coastal recovery fund",
    description: "Pooled money for flood defences and rehousing. Full funding speeds recovery.",
    target: 22_000_000,
  },
  outcome: {
    message:
      "Families are back in repaired homes and the new defences are rising. Insurers are returning to the coast.",
    effects: [
      fx("flat", "metric", "economy", "housing", 0.015, "Confidence returns to the coast"),
      fx("flat", "metric", "infrastructure", "damage", -0.02, "Networks repaired"),
    ],
  },
});

const AQUIFER_COLLAPSE = modernCrisis({
  name: "Aquifer Collapse",
  heroImage: HERO.water,
  description:
    "A deep aquifer that fed the farms and cities of {location} for generations has run dry in places and turned salty in others. Wells are failing across a whole farming region. Farm output drops about 0.6% at once. For about 8 turns irrigated harvests fall and food prices rise, water costs cut margins and approval falls.",
  durationTurns: 8,
  fromYear: 2050,
  untilYear: 2057,
  trigger: random(192, 0.003),
  effects: [
    fx("tick", "metric", "economy", "foodPrices", 0.012, "Irrigated harvests fall"),
    gdpLoss(0.006, "Farm output collapses"),
    marginShock(-2, "Water costs soar", "financial", "agriculture"),
    fx("tick", "approval", "government", "overall", -0.02, "Anger at the water failure"),
  ],
  wireStart:
    "Wells are failing across the farm belt of {location}. Officials say the aquifer may not recover.",
  wireEnd: "New water supplies are flowing and farms are adapting.",
  prompt: {
    title: "Water supply response",
    description: "Farms and cities are competing for what is left. How is it shared?",
  },
  options: [
    {
      id: "pipeline_and_reuse",
      label: "Build a pipeline and mandate water reuse",
      description:
        "Bring water in from a distant source and require recycling in industry and cities. A big investment that shortens the crisis.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.005, "Capital spending"),
        fx("flat", "metric", "infrastructure", "power", -0.004, "Pumping load on the grid"),
      ],
      cutsTurns: 2,
    },
    {
      id: "priority_cities",
      label: "Put cities first and cut farm allocations",
      description:
        "Keep taps running in towns by cutting irrigation. Cities hold, but farms and food prices take the hit.",
      effects: [
        fx("flat", "metric", "economy", "foodPrices", 0.01, "Fewer irrigated crops"),
        fx("flat", "approval", "workers", "overall", -0.04, "Farmers feel sacrificed"),
      ],
    },
    {
      id: "market_pricing",
      label: "Let water prices find their level",
      description: "Allow the market to ration what is left.",
      effects: [fx("flat", "approval", "base", "overall", -0.03, "Water bills jump")],
    },
  ],
  fund: {
    title: "Water security fund",
    description:
      "Pooled money for pipelines, desalination and farm transition. Full funding speeds recovery.",
    target: 20_000_000,
  },
  outcome: {
    message:
      "New supplies and reuse rules have stabilized water. Farms are switching to crops that need less.",
    effects: [
      fx("flat", "metric", "economy", "foodPrices", -0.01, "Supply stabilizes"),
      fx("flat", "metric", "publicsafety", "confidence", 0.02, "Reliable water restored"),
    ],
  },
});

const LOGISTICS_STALL = modernCrisis({
  name: "Autonomous Logistics Stall",
  heroImage: HERO.port,
  description:
    "A coordination fault has frozen the self-driving freight fleets that carry most goods. Warehouses fill while shelves empty, and nobody can say how long the fix will take. Output drops about 0.9% at once. For about 4 turns margins fall on idle fleets and spoiled stock, shortages dent consumer confidence and approval falls.",
  durationTurns: 4,
  fromYear: 2050,
  untilYear: 2059,
  trigger: {
    kind: "condition",
    cooldownTurns: 240,
    condition: {
      all: [{ metric: "powerGridReliability", op: "lt", threshold: 90, clearMargin: 2 }],
    },
  },
  effects: [
    gdpLoss(0.009, "Goods stuck in transit"),
    marginShock(-2, "Idle fleets and spoiled stock", "financial"),
    fx("tick", "metric", "economy", "consumerConfidence", -0.012, "Shortages in the shops"),
    fx("tick", "approval", "government", "overall", -0.02, "Anger at empty shelves"),
  ],
  wireStart:
    "Self-driving freight fleets across {location} have stopped. Retailers warn of shortages within days.",
  wireEnd: "The freight network is moving again.",
  prompt: {
    title: "Freight stall response",
    description:
      "Operators are blaming each other and stock is running low. What does the government do?",
  },
  options: [
    {
      id: "manual_override",
      label: "Authorize human drivers and manual override",
      description:
        "Recall licensed drivers and permit manual control. Slow and costly, but goods start moving and the crisis is shorter.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.003, "Emergency staffing costs"),
        fx("flat", "approval", "business", "overall", -0.015, "Operators object to the order"),
      ],
      cutsTurns: 1,
    },
    {
      id: "mandate_fault_review",
      label: "Order a public review and a shared safety standard",
      description:
        "Force operators to share fault data and agree one standard. Better for the long run, but little help this week.",
      effects: [
        fx("flat", "metric", "economy", "investorConfidence", -0.01, "Uncertainty over new rules"),
        fx("flat", "metric", "infrastructure", "damage", -0.01, "Weak points found and fixed"),
      ],
    },
    {
      id: "let_operators_fix",
      label: "Leave it to the operators",
      description: "Trust the companies to sort it out.",
      effects: [fx("flat", "approval", "government", "overall", -0.025, "Seen as absent")],
    },
  ],
  fund: {
    title: "Freight resilience fund",
    description: "Pooled money for backup routing and buffer stock. Full funding speeds recovery.",
    target: 15_000_000,
  },
  outcome: {
    message:
      "Freight is flowing again and buffer stocks are in place. A shared safety standard is being drafted.",
    effects: [
      fx("flat", "metric", "economy", "consumerConfidence", 0.02, "Shelves restocked"),
      fx("flat", "metric", "infrastructure", "power", 0.01, "Network hardened"),
    ],
  },
});

const AUTOMATION_LAYOFFS = modernCrisis({
  name: "Automation Layoff Wave",
  heroImage: HERO.labor,
  description:
    "Several large employers replaced whole departments with automated systems in the same season. Tens of thousands of skilled workers are out of work, and towns built around one employer are hit hardest. For about 6 turns unemployment rises, pay falls for those still working and approval drops among frightened workers.",
  durationTurns: 6,
  fromYear: 2050,
  untilYear: 2059,
  trigger: {
    kind: "condition",
    cooldownTurns: 216,
    condition: {
      all: [
        {
          metric: "unemploymentRate",
          op: "gt",
          threshold: 8,
          consecutiveTurns: 3,
          clearMargin: 0.5,
        },
      ],
    },
  },
  effects: [
    fx("tick", "metric", "economy", "unemployment", 0.01, "Skilled jobs disappear"),
    fx("tick", "metric", "economy", "realWages", -0.008, "Pay falls for those still working"),
    fx("tick", "approval", "workers", "overall", -0.03, "Fear and anger among workers"),
  ],
  wireStart:
    "Major employers in {location} are cutting thousands of jobs as automation takes over. Unions are calling for talks.",
  wireEnd: "The layoff wave has passed. Retraining places are filling up.",
  prompt: {
    title: "Layoff wave response",
    description: "Whole towns are losing their main employer. What does the government do?",
  },
  options: [
    {
      id: "retraining_guarantee",
      label: "Guarantee paid retraining",
      description:
        "Pay people to retrain while they search. Expensive, but it softens the blow and shortens the downturn.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.004, "Retraining costs"),
        fx("flat", "approval", "workers", "overall", 0.02, "Support for displaced workers"),
      ],
      cutsTurns: 1,
    },
    {
      id: "automation_levy",
      label: "Tax the automated profits to fund wage support",
      description:
        "Raise a levy on the firms that automated and pay it out as wage insurance. Fair to many, but investors object.",
      effects: [
        fx(
          "flat",
          "metric",
          "economy",
          "investorConfidence",
          -0.02,
          "Firms warn of lost investment"
        ),
        fx("flat", "approval", "business", "overall", -0.03, "Business lobby opposes the levy"),
      ],
    },
    {
      id: "market_adjusts",
      label: "Let the labor market adjust",
      description: "Trust new industries to hire the displaced.",
      effects: [fx("flat", "approval", "workers", "overall", -0.03, "Workers feel abandoned")],
    },
  ],
  fund: {
    title: "Transition fund",
    description: "Pooled money for retraining and local development. Full funding speeds recovery.",
    target: 20_000_000,
  },
  outcome: {
    message:
      "Retrained workers are finding new roles and the worst-hit towns have new anchor employers.",
    effects: [
      fx("flat", "metric", "economy", "unemployment", -0.01, "Workers re-employed"),
      fx("flat", "metric", "economy", "consumerConfidence", 0.015, "Households steadier"),
    ],
  },
});

const CROP_BLIGHT = modernCrisis({
  name: "Engineered Crop Blight",
  heroImage: HERO.drought,
  description:
    "A fast-spreading blight has hit the high-yield crop strain most farms now plant. Fields that looked healthy a month ago are lost, and the seed supply sits with a handful of firms. Farm output drops about 0.6% at once. For about 6 turns food prices rise and approval falls as farmers lose a season.",
  durationTurns: 6,
  fromYear: 2051,
  untilYear: 2059,
  trigger: random(192, 0.003),
  effects: [
    fx("tick", "metric", "economy", "foodPrices", 0.015, "Harvest losses push food prices up"),
    gdpLoss(0.006, "Farm output collapses"),
    fx("tick", "approval", "workers", "overall", -0.03, "Farmers lose a season"),
  ],
  wireStart:
    "A blight is spreading through the main crop strain in {location}. Farmers report whole fields lost.",
  wireEnd: "A resistant strain is in the ground and the blight is in retreat.",
  prompt: {
    title: "Blight response",
    description: "One strain feeds the country and it is failing. What does the government do?",
  },
  options: [
    {
      id: "diversify_seed",
      label: "Fund open seed banks and crop diversity",
      description:
        "Release stored varieties and pay farmers to plant a wider mix. Slower to pay off, but it ends the dependence on one strain.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.003, "Seed program costs"),
        fx("flat", "approval", "workers", "overall", 0.01, "Farmers get a choice of seed"),
      ],
      cutsTurns: 2,
    },
    {
      id: "emergency_imports",
      label: "Import food and release reserves",
      description:
        "Keep shelves full with imports and stockpiles. Prices cool at once, but trade balances take the hit.",
      effects: [
        fx("flat", "metric", "economy", "foodPrices", -0.008, "Imports cool prices"),
        fx("flat", "metric", "economy", "exports", -0.01, "Import bill grows"),
      ],
    },
    {
      id: "wait_for_firms",
      label: "Wait for the seed firms to deliver a fix",
      description: "Let the companies that sold the strain repair it.",
      effects: [
        fx("flat", "approval", "government", "overall", -0.025, "Seen as captured by seed firms"),
      ],
    },
  ],
  fund: {
    title: "Food security fund",
    description: "Pooled money for seed banks and farmer support. Full funding speeds recovery.",
    target: 16_000_000,
  },
  outcome: {
    message:
      "A resistant mix of crops is growing and food prices are easing. Farmers hold more varieties than before.",
    effects: [
      fx("flat", "metric", "economy", "foodPrices", -0.012, "Supply recovers"),
      fx("flat", "approval", "workers", "overall", 0.02, "Farm incomes recover"),
    ],
  },
});

const SYNTHETIC_MEDIA_PANIC = modernCrisis({
  name: "Synthetic Media Market Panic",
  heroImage: HERO.info,
  description:
    "A flawless fake video of a central banker announcing an emergency move spread before anyone could check it. Markets lurched, then lurched back, and people now doubt every official video. For about 3 turns investor confidence falls, people feel less sure of what they see and approval slips because the government cannot stop fakes.",
  durationTurns: 3,
  fromYear: 2050,
  untilYear: 2059,
  trigger: random(192, 0.003),
  effects: [
    fx("tick", "metric", "economy", "investorConfidence", -0.02, "Markets shaken by a fake"),
    fx("tick", "metric", "publicsafety", "confidence", -0.015, "Nobody trusts what they see"),
    fx("tick", "approval", "government", "overall", -0.015, "Seen as unable to stop fakes"),
  ],
  wireStart:
    "A fake video moved markets this morning. Officials are urging calm and asking people to verify before sharing.",
  wireEnd: "Verification measures are in place and markets have settled.",
  prompt: {
    title: "Synthetic media response",
    description:
      "The fake is debunked but the damage to trust remains. What does the government do?",
  },
  options: [
    {
      id: "signed_broadcasts",
      label: "Require signed, verifiable official broadcasts",
      description:
        "All official statements carry a public signature that anyone can check. Takes effort to set up, but it restores confidence quickly.",
      effects: [
        fx("flat", "metric", "economy", "gdp", -0.001, "Compliance costs"),
        fx("flat", "metric", "publicsafety", "confidence", 0.03, "Trusted channel established"),
      ],
      cutsTurns: 1,
    },
    {
      id: "platform_duty",
      label: "Impose a takedown duty on the platforms",
      description:
        "Fines for slow removal of market-moving fakes. Effective, but critics warn of over-removal.",
      effects: [
        fx("flat", "approval", "reformers", "overall", -0.02, "Free speech concerns"),
        fx("flat", "approval", "business", "overall", -0.01, "Platforms object"),
      ],
    },
    {
      id: "appeal_for_calm",
      label: "Appeal for calm and wait",
      description: "Say it was a hoax and let the story fade.",
      effects: [fx("flat", "approval", "government", "overall", -0.02, "Seen as slow to act")],
    },
  ],
  fund: {
    title: "Information integrity fund",
    description:
      "Pooled money for verification tools and public education. Full funding speeds recovery.",
    target: 10_000_000,
  },
  outcome: {
    message: "Verification tools are in common use and markets have regained their footing.",
    effects: [
      fx("flat", "metric", "economy", "investorConfidence", 0.02, "Markets regain confidence"),
      fx("flat", "metric", "publicsafety", "confidence", 0.015, "Public trust rebuilt"),
    ],
  },
});

const LONGEVITY_PENSION_STRAIN = modernCrisis({
  name: "Longevity Pension Strain",
  heroImage: HERO.bank,
  description:
    "People are living years longer than the pension tables assumed. Funds that were solvent on paper now face a widening gap, and younger workers ask why they should pay for it. For about 6 turns investors doubt the funds, retirees fear benefit cuts, workers resent higher contributions and approval falls on both sides.",
  durationTurns: 6,
  fromYear: 2052,
  untilYear: 2059,
  trigger: random(240, 0.003),
  effects: [
    fx("tick", "metric", "economy", "investorConfidence", -0.01, "Doubts over fund solvency"),
    fx("tick", "approval", "base", "overall", -0.02, "Fear of benefit cuts"),
    fx("tick", "approval", "workers", "overall", -0.015, "Anger at higher contributions"),
  ],
  wireStart:
    "Pension funds report a widening gap as retirees live longer. Calls for reform are growing.",
  wireEnd: "A pension deal has been reached.",
  prompt: {
    title: "Pension settlement",
    description: "Someone has to pay for the longer retirements. Who?",
  },
  options: [
    {
      id: "raise_age_gradually",
      label: "Raise the pension age gradually",
      description:
        "Phase in a later retirement age over twenty years. Fair to people who have time to plan, but it is hard to sell.",
      effects: [
        fx("flat", "approval", "workers", "overall", -0.03, "Anger at later retirement"),
        fx("flat", "metric", "economy", "investorConfidence", 0.01, "Funds look safer"),
      ],
      cutsTurns: 1,
    },
    {
      id: "raise_contributions",
      label: "Raise contributions from workers and employers",
      description:
        "Share the cost across working people and firms. Keeps the retirement age, but squeezes pay.",
      effects: [
        fx("flat", "metric", "economy", "realWages", -0.01, "Take-home pay falls"),
        fx("flat", "approval", "business", "overall", -0.02, "Employers object"),
      ],
    },
    {
      id: "cut_benefits",
      label: "Trim benefits for new retirees",
      description: "Lower payouts for those who retire from now on.",
      effects: [fx("flat", "approval", "base", "overall", -0.04, "Retirees feel betrayed")],
    },
  ],
  fund: {
    title: "Pension stabilization reserve",
    description:
      "Pooled money to bridge the gap while reforms phase in. Full funding speeds recovery.",
    target: 25_000_000,
  },
  outcome: {
    message: "The settlement is law and the funds are on a stable footing for a generation.",
    effects: [
      fx("flat", "metric", "economy", "investorConfidence", 0.015, "Funds solvent again"),
      fx("flat", "approval", "base", "overall", 0.01, "Certainty restored"),
    ],
  },
});

export const MODERN_2050S_CRISIS_TEMPLATES: Record<string, CrisisTemplate> = {
  continental_heat_collapse: HEAT_COLLAPSE,
  coastal_storm_surge_flood: SURGE_FLOOD,
  aquifer_collapse: AQUIFER_COLLAPSE,
  autonomous_logistics_stall: LOGISTICS_STALL,
  automation_layoff_wave: AUTOMATION_LAYOFFS,
  engineered_crop_blight: CROP_BLIGHT,
  synthetic_media_market_panic: SYNTHETIC_MEDIA_PANIC,
  longevity_pension_strain: LONGEVITY_PENSION_STRAIN,
};
