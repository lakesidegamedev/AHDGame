import type { ModernLawSpec } from "@/lib/politicalLegislation/laws/modernEraLaws";

export const EARLIER_BAND_SPECS_1: readonly ModernLawSpec[] = [
  // ── 2027 ────────────────────────────────────────────────────────────────
  {
    slug: "aiLiabilityTransparency",
    from: 2027,
    until: 2050,
    successor: "advancedAiOversight",
    category: "governance",
    targets: [
      { metricId: "governance.integrity", weight: 0.45 },
      { metricId: "order.dueProcess", weight: 0.3 },
      { metricId: "economy.productivity", weight: -0.25 },
    ],
    title: {
      US: "Artificial Intelligence Accountability Act",
      UK: "Artificial Intelligence (Liability and Transparency) Act",
    },
    description: {
      US: "Makes the builders and users of automated systems answer for the harm they cause and say what their systems decide.",
      UK: "Makes the builders and users of automated systems answer for the harm they cause and say what their systems decide.",
    },
    noStatute: "Automated systems answer to no law of their own. Harm is argued case by case.",
    levels: [
      {
        name: "Disclosure Notices",
        description: "People must be told when an automated system makes a decision about them.",
        cost: 0.00005,
      },
      {
        name: "Audit and Liability",
        description:
          "High-risk systems are audited before use, and whoever deploys them pays for the harm they do.",
        cost: 0.00012,
      },
      {
        name: "Licensed Deployment",
        description: {
          US: "High-risk systems need a license to run and must keep logs a regulator can inspect.",
          UK: "High-risk systems need a licence to run and must keep logs a regulator can inspect.",
        },
        cost: 0.00025,
      },
      {
        name: "Strict Liability Regime",
        description:
          "Builders and users carry strict liability, and opaque systems are barred from public decisions.",
        cost: 0.0004,
      },
    ],
  },

  {
    slug: "dataProtectionOverhaul",
    from: 2027,
    until: 2045,
    successor: "digitalSelfOwnership",
    category: "governance",
    targets: [
      { metricId: "order.dueProcess", weight: 0.45 },
      { metricId: "governance.integrity", weight: 0.25 },
      { metricId: "economy.competition", weight: -0.25 },
    ],
    title: {
      US: "Consumer Data Privacy Act",
      UK: "Data Protection and Digital Rights Act",
    },
    description: {
      US: "Sets what companies may collect about people, how long they may keep it and who they may sell it to.",
      UK: "Sets what companies may collect about people, how long they may keep it and who they may sell it to.",
    },
    noStatute: "Personal data is governed by a patchwork of old rules and company terms.",
    levels: [
      {
        name: "Breach Notification",
        description: "Firms must report data breaches quickly and tell the people affected.",
        cost: 0.00004,
      },
      {
        name: "Access and Consent Rights",
        description:
          "People can see, correct and delete what firms hold, and sale of data needs consent.",
        cost: 0.0001,
      },
      {
        name: { US: "Data Minimization Rules", UK: "Data Minimisation Rules" },
        description:
          "Firms may collect only what a service needs, with heavy fines for misuse and smaller firms squeezed by compliance.",
        cost: 0.0002,
      },
      {
        name: "Data Sovereignty Code",
        description:
          "A strict code: sensitive data stays at home, profiling for advertising is banned, and a strong regulator polices it.",
        cost: 0.00035,
      },
    ],
  },

  {
    slug: "housingSupplyZoning",
    from: 2027,
    category: "infrastructure",
    targets: [
      { metricId: "infrastructure.ownership", weight: 0.5 },
      { metricId: "infrastructure.development", weight: 0.35 },
      { metricId: "economy.householdIncome", weight: 0.25 },
      { metricId: "environment.conservation", weight: -0.25 },
    ],
    title: {
      US: "Housing Supply and Zoning Reform Act",
      UK: "Planning and Housing Supply Act",
    },
    description: {
      US: "Pushes towns and states to let more homes be built, with grants for those that do. Renters and first buyers gain; open land and local control pay.",
      UK: "Pushes councils to let more homes be built, with grants for those that do. Renters and first buyers gain; green fields and local control pay.",
    },
    noStatute: "Local rules decide what may be built, and most land stays zoned as it is.",
    levels: [
      {
        name: "Incentive Grants",
        description: "Grants reward places that approve new homes quickly.",
        cost: 0.0003,
      },
      {
        name: "Building by Right",
        description:
          "Homes that meet a national code are approved by right, with no local veto on denser housing near transit.",
        cost: 0.0008,
      },
      {
        name: "Upzoning Mandate",
        description:
          "Every place must allow small apartment blocks on residential land and meet a national housing target.",
        cost: 0.0015,
      },
      {
        name: { US: "National Build Program", UK: "National Build Programme" },
        description:
          "Targets are enforced from the centre, new towns are planned, and the state funds the roads and pipes they need.",
        cost: 0.0025,
      },
    ],
  },

  {
    slug: "criticalMineralsStockpile",
    from: 2027,
    category: "defense",
    targets: [
      { metricId: "defense.defenseIndustry", weight: 0.45 },
      { metricId: "environment.energySecurity", weight: 0.35 },
      { metricId: "environment.resourceDev", weight: 0.25 },
      { metricId: "environment.conservation", weight: -0.25 },
    ],
    title: {
      US: "Critical Minerals Stockpile Act",
      UK: "Critical Minerals Reserve Act",
    },
    description: {
      US: "Builds a national reserve of lithium, rare earths and other minerals that batteries, chips and weapons need. Industry gains supply security; the treasury and wild land pay.",
      UK: "Builds a national reserve of lithium, rare earths and other minerals that batteries, chips and weapons need. Industry gains supply security; the treasury and wild land pay.",
    },
    noStatute: "The country buys minerals on the open market and holds no reserve.",
    levels: [
      {
        name: "Supply Mapping",
        description: "The state tracks where key minerals come from and where supply could fail.",
        cost: 0.0002,
      },
      {
        name: "Strategic Reserve",
        description: {
          US: "A reserve holds several months of supply for defense and grid industries.",
          UK: "A reserve holds several months of supply for defence and grid industries.",
        },
        cost: 0.0005,
      },
      {
        name: "Domestic Extraction Drive",
        description:
          "The reserve grows, new mines and refineries at home get fast permits and price floors, and makers must recover a tenth of the rare earths they use from scrap.",
        cost: 0.001,
      },
      {
        name: { US: "Minerals Security Program", UK: "Minerals Security Programme" },
        description: {
          US: "A full program: a large reserve, state stakes in refining, long contracts with friendly suppliers, and a recycling duty that recovers a fifth of rare earth use.",
          UK: "A full programme: a large reserve, state stakes in refining, long contracts with friendly suppliers, and a recycling duty that recovers a fifth of rare earth use.",
        },
        cost: 0.0016,
      },
    ],
  },

  {
    slug: "cyberResilienceMandate",
    from: 2027,
    category: "defense",
    targets: [
      { metricId: "defense.security", weight: 0.45 },
      { metricId: "infrastructure.utilities", weight: 0.35 },
      { metricId: "governance.administration", weight: 0.25 },
      { metricId: "economy.competition", weight: -0.25 },
    ],
    title: {
      US: "Cyber Resilience Mandate",
      UK: "Cyber Security and Resilience Act",
    },
    description: {
      US: "Sets security duties for grids, hospitals, banks and the firms that supply them. Critical services gain; small suppliers pay for compliance.",
      UK: "Sets security duties for grids, hospitals, banks and the firms that supply them. Critical services gain; small suppliers pay for compliance.",
    },
    noStatute: "Security is left to each operator, and attacks are reported if the victim chooses.",
    levels: [
      {
        name: "Incident Reporting",
        description: "Operators of critical services must report serious attacks to the state.",
        cost: 0.0001,
      },
      {
        name: "Baseline Standards",
        description:
          "Critical operators must meet a security baseline and pass regular inspections.",
        cost: 0.0003,
      },
      {
        name: "Supply Chain Duties",
        description:
          "The duties extend to suppliers, and insecure products may not be sold to critical services.",
        cost: 0.0006,
      },
      {
        name: "National Cyber Shield",
        description:
          "A national agency can direct operators during an attack and runs joint defence of the grid and the banks.",
        cost: 0.001,
      },
    ],
  },

  {
    slug: "platformContentLaw",
    from: 2027,
    category: "governance",
    targets: [
      { metricId: "order.communityTrust", weight: 0.4 },
      { metricId: "society.civicLife", weight: 0.3 },
      { metricId: "governance.openness", weight: -0.3 },
    ],
    title: {
      US: "Platform Accountability Act",
      UK: "Online Platforms Act",
    },
    description: {
      US: "Sets what large online platforms must remove and how fast. Users gain protection from abuse; open speech pays at the stricter end.",
      UK: "Sets what large online platforms must remove and how fast. Users gain protection from abuse; open speech pays at the stricter end.",
    },
    noStatute: "Platforms set their own rules and carry no duty for what users post.",
    levels: [
      {
        name: "Transparency Reports",
        description: "Large platforms must publish how they moderate and what they take down.",
        cost: 0.00003,
      },
      {
        name: "Duty of Care",
        description:
          "Platforms must act on illegal content and protect children, under a regulator that can fine them.",
        cost: 0.00008,
      },
      {
        name: "Takedown Deadlines",
        description:
          "Harmful posts must come down within hours, and repeat failures cost a share of turnover.",
        cost: 0.00015,
      },
      {
        name: "Licensed Platforms",
        description:
          "Large platforms need a licence, verify their users and answer for what they spread.",
        cost: 0.00025,
      },
    ],
  },

  {
    slug: "carbonPrice",
    from: 2027,
    category: "environment",
    targets: [
      { metricId: "environment.stewardship", weight: 0.5 },
      { metricId: "environment.urbanAir", weight: 0.3 },
      { metricId: "economy.householdIncome", weight: -0.3 },
      { metricId: "economy.productivity", weight: -0.25 },
    ],
    title: {
      US: "Carbon Pricing Act",
      UK: "Carbon Price Act",
    },
    description: {
      US: "Charges power plants and heavy industry for every ton of carbon they release. The treasury and clean producers gain; coal and gas power, chemical works, factories and their customers pay.",
      UK: "Charges power plants and heavy industry for every ton of carbon they release. The treasury and clean producers gain; coal and gas power, chemical works, factories and their customers pay.",
    },
    noStatute: "Carbon released by power plants and industry carries no charge.",
    levels: [
      {
        name: "Token Carbon Fee",
        description:
          "A small charge per ton that funds monitoring and barely moves prices. Coal and gas plants notice it.",
        cost: 0.00005,
        revenue: 0.001,
      },
      {
        name: "Moderate Carbon Price",
        description:
          "A real charge per ton. Coal power, chemicals and steel pay noticeably more to run.",
        cost: 0.0001,
        revenue: 0.002,
      },
      {
        name: "High Carbon Price",
        description:
          "A steep charge per ton that makes coal power a losing business and pushes industry to cleaner methods.",
        cost: 0.00015,
        revenue: 0.004,
      },
      {
        name: "Full Social Cost of Carbon",
        description:
          "Every ton pays its full estimated damage. Fossil power and heavy industry pay heavily and prices rise across the shops.",
        cost: 0.0002,
        revenue: 0.007,
      },
    ],
  },

  {
    slug: "coalPhaseOut",
    from: 2027,
    until: 2045,
    successor: "fossilFuelSunset",
    category: "environment",
    targets: [
      { metricId: "environment.urbanAir", weight: 0.5 },
      { metricId: "environment.stewardship", weight: 0.3 },
      { metricId: "environment.energySecurity", weight: -0.3 },
      { metricId: "economy.workerSecurity", weight: -0.25 },
    ],
    title: {
      US: "Coal Power Phase-Out Act",
      UK: "Coal Power (Closure) Act",
    },
    description: {
      US: "Sets a date by which coal power must close, with help for the towns that lose it. Clean air and clean generators gain; coal plant owners, miners and grid reliability pay.",
      UK: "Sets a date by which coal power must close, with help for the towns that lose it. Clean air and clean generators gain; coal plant owners, miners and grid reliability pay.",
    },
    noStatute: "Coal plants run for as long as their owners find them worth running.",
    levels: [
      {
        name: "Distant Closure Date",
        description:
          "Coal power must close in about two decades. Owners have time to run old plants down.",
        cost: 0.0002,
      },
      {
        name: "Firm Closure Date",
        description:
          "Coal power must close well within two decades, and running costs climb as the date nears.",
        cost: 0.0005,
      },
      {
        name: "Early Closure Date",
        description:
          "Coal power must close within about a decade, with retraining money for the towns that lose it.",
        cost: 0.001,
      },
      {
        name: "Rapid Coal Exit",
        description:
          "Coal power must close within a few years. Old plants become costly at once and coal towns get a large support fund.",
        cost: 0.0015,
      },
    ],
  },

  {
    slug: "cleanPowerStandard",
    from: 2027,
    until: 2050,
    successor: "zeroCarbonEconomy",
    category: "environment",
    targets: [
      { metricId: "environment.stewardship", weight: 0.45 },
      { metricId: "environment.energySecurity", weight: 0.3 },
      { metricId: "environment.affordability", weight: -0.3 },
    ],
    title: {
      US: "Clean Electricity Standard Act",
      UK: "Clean Power Standard Act",
    },
    description: {
      US: "Requires a set share of the country's power to come from clean sources. Fossil plants buy certificates for the shortfall. Clean generators gain; fossil power and power bills pay.",
      UK: "Requires a set share of the country's power to come from clean sources. Fossil plants buy certificates for the shortfall. Clean generators gain; fossil power and power bills pay.",
    },
    noStatute: "No share of power has to come from clean sources.",
    levels: [
      {
        name: "Two-Fifths Clean",
        description:
          "Two fifths of power must be clean. Fossil plants pay for certificates when the country falls short.",
        cost: 0.0001,
      },
      {
        name: "Three-Fifths Clean",
        description: "Three fifths of power must be clean, and the shortfall charge grows with it.",
        cost: 0.0002,
      },
      {
        name: "Four-Fifths Clean",
        description:
          "Four fifths of power must be clean. Gas and coal plants pay heavily unless renewables, storage and nuclear are built.",
        cost: 0.0004,
      },
      {
        name: "Near-Zero Carbon Grid",
        description:
          "Almost all power must be clean, and every fossil plant pays a steep charge while the country falls short.",
        cost: 0.0006,
      },
    ],
  },

  // ── 2030 ────────────────────────────────────────────────────────────────
  {
    slug: "automationTax",
    from: 2030,
    // The automation dividend replaces it: from 2040 the levy is filed as part
    // of the dividend, and an automation tax already in force stays in force.
    until: 2040,
    successor: "automationDividend",
    category: "economy",
    targets: [
      { metricId: "economy.workerSecurity", weight: 0.45 },
      { metricId: "economy.mobility", weight: 0.3 },
      { metricId: "economy.productivity", weight: -0.35 },
    ],
    title: {
      US: "Automation Tax Act",
      UK: "Robotics and Automation Levy",
    },
    description: {
      US: "Taxes firms that replace workers with machines and software. Displaced workers and the treasury gain; productivity and investment pay.",
      UK: "Taxes firms that replace workers with machines and software. Displaced workers and the treasury gain; productivity and investment pay.",
    },
    noStatute: "Machines and software that replace workers are taxed like any other investment.",
    levels: [
      {
        name: "Reporting Duty",
        description:
          "Large firms report jobs lost to automation and pay a small levy on the largest cuts.",
        cost: 0.00003,
        revenue: 0.001,
      },
      {
        name: "Displacement Levy",
        description: "A levy is charged on each job automated away, paid into retraining.",
        cost: 0.00005,
        revenue: 0.002,
      },
      {
        name: "Robot Payroll Tax",
        description:
          "Automated work is taxed as if it were wages, so machines carry the payroll cost of the jobs they replace.",
        cost: 0.00008,
        revenue: 0.0035,
      },
      {
        name: "Full Automation Tax",
        description:
          "A broad tax on automated output funds the welfare state, at a real cost to investment.",
        cost: 0.0001,
        revenue: 0.005,
      },
    ],
  },
];
