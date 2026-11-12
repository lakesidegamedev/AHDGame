/**
 * The 2045 band (longevity care, fossil fuel sunset, digital self-ownership,
 * water security) and the 2050 band (advanced AI oversight, lifelong pension
 * account, zero carbon economy, space resources) of the later-era law book.
 * Split from modernEraLaws.ts to keep that file under its size pin; the specs
 * share its shape and are built there. Copy is shared across countries.
 */

import type { ModernLawSpec } from "./modernEraLaws";

export const LATE_BAND_SPECS: readonly ModernLawSpec[] = [
  // ── 2045 ────────────────────────────────────────────────────────────────
  {
    slug: "longevityCare",
    from: 2045,
    category: "health",
    targets: [
      { metricId: "health.outcomes", weight: 0.4 },
      { metricId: "health.socialInsurance", weight: 0.3 },
      { metricId: "economy.fiscal", weight: -0.3 },
    ],
    title: "Longevity Care Act",
    description:
      "Sets who pays for care in a very long old age. Older people and their families gain; taxpayers and employers pay.",
    noStatute: "Care in old age is paid for under the existing health and welfare rules.",
    levels: [
      {
        name: "Family Care Allowances",
        description: "Families who care for an older relative at home get a small tax allowance.",
        cost: 0.0008,
      },
      {
        name: "Capped Lifetime Care Costs",
        description:
          "The state caps what any person pays for care in a lifetime and pays the rest for people with little savings.",
        cost: 0.0025,
      },
      {
        name: "Care Insurance for All",
        description:
          "Everyone pays into a national care insurance fund that covers most of the cost of care.",
        cost: 0.0055,
      },
      {
        name: "Universal Long-Term Care",
        description:
          "Care at home and in care homes is free for everyone who needs it, paid for from general taxes.",
        cost: 0.009,
      },
    ],
  },
  {
    slug: "fossilFuelSunset",
    from: 2045,
    category: "environment",
    targets: [
      { metricId: "environment.stewardship", weight: 0.4 },
      { metricId: "environment.energySecurity", weight: 0.3 },
      { metricId: "environment.affordability", weight: -0.3 },
    ],
    title: "Fossil Fuel Sunset Act",
    description:
      "Sets a final date for burning coal, oil and gas for power and heat. The climate and clean energy gain; households and firms that depend on fossil fuels pay. It replaces the coal power phase-out for new bills.",
    noStatute: "Fossil fuels fall under the existing climate and energy law.",
    levels: [
      {
        name: "Declining Fossil Quota",
        description: "Each year the amount of fossil fuel that may be burned for power falls.",
        cost: 0.0004,
      },
      {
        name: "Gas Plants as Backup Only",
        description:
          "Fossil plants may run only as emergency backup, and new ones may not be built.",
        cost: 0.0015,
      },
      {
        name: "Fixed Sunset Date",
        description:
          "A fixed date ends fossil fuel use for power and heat, with help for affected workers and regions.",
        cost: 0.003,
      },
      {
        name: "Immediate Fossil Ban",
        description:
          "Burning fossil fuels for power and heat is banned within a few years, with a state fund helping households switch.",
        cost: 0.005,
      },
    ],
  },
  {
    slug: "digitalSelfOwnership",
    from: 2045,
    category: "governance",
    targets: [
      { metricId: "order.dueProcess", weight: 0.45 },
      { metricId: "governance.integrity", weight: 0.3 },
      { metricId: "economy.productivity", weight: -0.25 },
    ],
    title: "Digital Self-Ownership Act",
    description:
      "Gives people ownership of their data, their digital identity and their face and voice online. People gain control; firms that build services on data pay. It replaces the data protection overhaul for new bills.",
    noStatute: "Personal data is covered by the existing data protection and privacy rules.",
    levels: [
      {
        name: "Right to Withdraw Data",
        description: "People may pull their data from any service and have it deleted.",
        cost: 0.0001,
      },
      {
        name: "Likeness Protection",
        description:
          "Faking a person's face or voice without consent is a civil and criminal wrong.",
        cost: 0.0003,
      },
      {
        name: "Portable Digital Identity",
        description:
          "Each person holds a digital identity they control and can carry from one service to another.",
        cost: 0.0006,
      },
      {
        name: "Personal Data Ownership",
        description:
          "Every person owns their data, face and voice. Firms need paid consent to use them and must delete them on request.",
        cost: 0.001,
      },
    ],
  },
  {
    slug: "waterSecurity",
    from: 2045,
    category: "infrastructure",
    budgetKeyOverride: { UK: "other" },
    targets: [
      { metricId: "infrastructure.utilities", weight: 0.45 },
      { metricId: "environment.conservation", weight: 0.3 },
      { metricId: "economy.fiscal", weight: -0.25 },
    ],
    title: "Water Security Act",
    description:
      "Plans for droughts, floods and shrinking water supplies. Towns and farms keep water in dry years; taxpayers and water bills pay.",
    noStatute: "Water follows the existing utility and environment rules.",
    levels: [
      {
        name: "Leakage and Reuse Targets",
        description: "Suppliers must cut leaks and reuse more water by set dates.",
        cost: 0.0005,
      },
      {
        name: "River Basin Authorities",
        description:
          "Regional authorities plan water for each river basin and may order cuts in a drought.",
        cost: 0.0018,
      },
      {
        name: "Storage and Recycling Build",
        description:
          "The state builds reservoirs and water recycling plants in the driest regions.",
        cost: 0.0035,
      },
      {
        name: "National Water Grid",
        description:
          "The state builds reservoirs, recycling plants and a national grid that moves water between regions.",
        cost: 0.006,
      },
    ],
  },
  // ── 2050 ────────────────────────────────────────────────────────────────
  {
    slug: "advancedAiOversight",
    from: 2050,
    category: "governance",
    targets: [
      { metricId: "governance.integrity", weight: 0.4 },
      { metricId: "defense.security", weight: 0.3 },
      { metricId: "economy.productivity", weight: -0.3 },
    ],
    title: "Advanced AI Oversight Act",
    description:
      "Sets rules for the most capable AI systems, which can plan and act on their own. Public trust and security gain; research and the firms that build these systems pay. It replaces the AI liability act for new bills.",
    noStatute: "Capable AI systems are covered by general liability and consumer law.",
    levels: [
      {
        name: "Incident Reporting",
        description: "Developers must report serious failures of capable systems within days.",
        cost: 0.00008,
      },
      {
        name: "Mandatory Safety Testing",
        description:
          "Developers of highly capable systems must pass independent safety tests before release.",
        cost: 0.0002,
      },
      {
        name: "Compute and Model Licensing",
        description:
          "Training the most capable systems needs a licence, and the licence can be withdrawn.",
        cost: 0.0005,
      },
      {
        name: "Public AI Safety Authority",
        description:
          "A national authority tests every highly capable system before release and may order it shut down.",
        cost: 0.0009,
      },
    ],
  },
  {
    slug: "lifelongPensionAccount",
    from: 2050,
    category: "society",
    budgetKeyOverride: { US: "socialSecurity", UK: "statePensions" },
    targets: [
      { metricId: "economy.householdIncome", weight: 0.4 },
      { metricId: "health.socialInsurance", weight: 0.3 },
      { metricId: "economy.fiscal", weight: -0.3 },
    ],
    title: "Lifelong Pension Account Act",
    description:
      "Replaces a fixed retirement age with a personal account every worker carries for life and can draw on at an age they choose. Workers gain security and choice; taxpayers pay the top-ups. It replaces pension age indexation for new bills.",
    noStatute: "Pensions follow the existing retirement age and funding rules.",
    levels: [
      {
        name: "Flexible Retirement Window",
        description:
          "Workers may retire within a wide age window, with a smaller pension if they leave early.",
        cost: 0.0006,
      },
      {
        name: "Personal Account Option",
        description: "Workers may pay part of their pension contributions into a personal account.",
        cost: 0.002,
      },
      {
        name: "Topped-Up Personal Account",
        description: "The state adds to the accounts of low earners and carers every year.",
        cost: 0.0045,
      },
      {
        name: "Guaranteed Lifelong Account",
        description:
          "Every worker gets a state-backed account with a guaranteed minimum, drawn at any age from sixty on.",
        cost: 0.008,
      },
    ],
  },
  {
    slug: "zeroCarbonEconomy",
    from: 2050,
    category: "environment",
    targets: [
      { metricId: "environment.stewardship", weight: 0.4 },
      { metricId: "environment.urbanAir", weight: 0.3 },
      { metricId: "economy.productivity", weight: -0.25 },
    ],
    title: "Zero Carbon Economy Act",
    description:
      "Makes net zero emissions a legal limit for the whole economy. The climate and clean air gain; industry, transport and farming pay. It replaces the clean power standard for new bills.",
    noStatute: "Emissions follow the existing climate law.",
    levels: [
      {
        name: "Sector Carbon Budgets",
        description: "Each sector gets a falling carbon budget that reaches zero by a fixed date.",
        cost: 0.0005,
      },
      {
        name: "Transition Grants",
        description: "The state pays firms and farms to clean up their last emissions.",
        cost: 0.002,
      },
      {
        name: "Zero Emissions Standards",
        description:
          "New vehicles, buildings and factories must produce no emissions, with fines for those that do.",
        cost: 0.0042,
      },
      {
        name: "Binding Zero Limit",
        description:
          "A legal limit of zero net emissions applies to every sector, with fines on firms that miss it.",
        cost: 0.007,
      },
    ],
  },
  {
    slug: "spaceResources",
    from: 2050,
    category: "economy",
    targets: [
      { metricId: "economy.productivity", weight: 0.4 },
      { metricId: "education.research", weight: 0.3 },
      { metricId: "economy.fiscal", weight: -0.3 },
    ],
    title: "Space Resources Act",
    description:
      "Sets who may mine the Moon and asteroids and who owns what they bring back. A new industry and secure metal supplies gain; taxpayers pay for the regulator and risk disputes with other powers.",
    noStatute: "Space mining falls under the general space and trade rules.",
    levels: [
      {
        name: "Claims Registry",
        description:
          "Firms may register claims to mine and keep what they bring back, with safety duties.",
        cost: 0.0003,
      },
      {
        name: "Licensed Public Partnerships",
        description:
          "Firms mine under state licence and share part of their output with a public fund.",
        cost: 0.001,
      },
      {
        name: "Public Launch and Mining Fund",
        description:
          "The state co-funds launches and mining missions and takes a share of the output.",
        cost: 0.0022,
      },
      {
        name: "State Space Mining Corporation",
        description:
          "A state corporation mines the Moon and asteroids and sells what it brings back.",
        cost: 0.004,
      },
    ],
  },
];
