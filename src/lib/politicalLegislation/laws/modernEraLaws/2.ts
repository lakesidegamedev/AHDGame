import type { ModernLawSpec } from "@/lib/politicalLegislation/laws/modernEraLaws";

export const EARLIER_BAND_SPECS_2: readonly ModernLawSpec[] = [
  {
    slug: "wageInsurance",
    from: 2030,
    category: "economy",
    budgetKeyOverride: { US: "socialSecurity", UK: "welfare" },
    targets: [
      { metricId: "economy.mobility", weight: 0.45 },
      { metricId: "education.adultSkills", weight: 0.3 },
      { metricId: "economy.stability", weight: 0.25 },
      { metricId: "economy.fiscal", weight: -0.25 },
    ],
    title: {
      US: "Wage Insurance Act",
      UK: "Earnings Protection Act",
    },
    description: {
      US: "Tops up the pay of workers who lose a job and take a lower paid one. Displaced workers gain; taxpayers pay.",
      UK: "Tops up the pay of workers who lose a job and take a lower paid one. Displaced workers gain; taxpayers pay.",
    },
    noStatute: "A worker who takes a lower paid job after a layoff absorbs the whole loss.",
    levels: [
      {
        name: "Pilot Scheme",
        description: "Workers in the hardest hit trades get a short top-up after a layoff.",
        cost: 0.0005,
      },
      {
        name: "Half the Gap",
        description: "Displaced workers get half the drop in pay back for two years.",
        cost: 0.0012,
      },
      {
        name: "Insurance with Retraining",
        description:
          "The top-up runs longer and comes with paid retraining for anyone who wants it.",
        cost: 0.0022,
      },
      {
        name: "Universal Earnings Cover",
        description:
          "Every worker is covered for most of a pay cut after a layoff, for as long as it lasts.",
        cost: 0.0035,
      },
    ],
  },

  {
    slug: "carbonBorderAdjustment",
    from: 2030,
    category: "environment",
    targets: [
      { metricId: "environment.stewardship", weight: 0.45 },
      { metricId: "environment.urbanAir", weight: 0.3 },
      { metricId: "economy.householdIncome", weight: -0.25 },
      { metricId: "defense.diplomacy", weight: -0.25 },
    ],
    title: {
      US: "Carbon Border Adjustment Act",
      UK: "Carbon Border Adjustment Mechanism Act",
    },
    description: {
      US: "Charges imports for the carbon released in making them. Clean producers and the treasury gain; shoppers and trading partners pay.",
      UK: "Charges imports for the carbon released in making them. Clean producers and the treasury gain; shoppers and trading partners pay.",
    },
    noStatute: "Imports pay no charge for the carbon released in making them.",
    levels: [
      {
        name: "Emissions Reporting",
        description:
          "Importers of steel, cement and aluminium must report the carbon in what they bring in, with a token fee.",
        cost: 0.00005,
        revenue: 0.0005,
      },
      {
        name: "Heavy Industry Charge",
        description: "Carbon-heavy imports pay a charge that matches what home producers pay.",
        cost: 0.0001,
        revenue: 0.001,
      },
      {
        name: "Broad Border Charge",
        description:
          "The charge covers most manufactured imports, and partners threaten to answer in kind.",
        cost: 0.00015,
        revenue: 0.002,
      },
      {
        name: "Full Carbon Border",
        description:
          "Every import pays for its carbon at a high price, with steep costs in the shops and strained trade ties.",
        cost: 0.0002,
        revenue: 0.003,
      },
    ],
  },

  {
    slug: "heatLabourStandards",
    from: 2030,
    category: "economy",
    targets: [
      { metricId: "economy.workerSecurity", weight: 0.4 },
      { metricId: "health.prevention", weight: 0.35 },
      { metricId: "economy.productivity", weight: -0.25 },
    ],
    title: {
      US: "Workplace Heat Safety Act",
      UK: "Heat and Working Conditions Act",
    },
    description: {
      US: "Sets rest breaks, water, shade and stop-work limits for jobs done in extreme heat. Outdoor and warehouse workers gain; employers pay in lost hours.",
      UK: "Sets rest breaks, water, shade and stop-work limits for jobs done in extreme heat. Outdoor and warehouse workers gain; employers pay in lost hours.",
    },
    noStatute: "No rule says when it is too hot to work.",
    levels: [
      {
        name: "Heat Guidance",
        description: "The state publishes advice on working in heat, with no penalties.",
        cost: 0.00005,
      },
      {
        name: "Water, Shade and Rest",
        description: "Employers must provide water, shade and rest breaks above a set temperature.",
        cost: 0.0001,
      },
      {
        name: "Stop-Work Thresholds",
        description:
          "Outdoor work stops above a set heat index, with inspections and fines for breaches.",
        cost: 0.0002,
      },
      {
        name: "Climate Work Code",
        description:
          "A full code: cooled workplaces, shifted hours and paid heat days, enforced by a dedicated inspectorate.",
        cost: 0.0003,
      },
    ],
  },

  {
    slug: "pensionAgeIndexation",
    from: 2030,
    until: 2050,
    successor: "lifelongPensionAccount",
    category: "economy",
    budgetKeyOverride: { US: "socialSecurity", UK: "statePensions" },
    targets: [
      { metricId: "economy.fiscal", weight: 0.5 },
      { metricId: "society.demography", weight: 0.25 },
      { metricId: "health.socialInsurance", weight: -0.35 },
    ],
    title: {
      US: "Retirement Age Indexation Act",
      UK: "State Pension Age Indexation Act",
    },
    description: {
      US: "Ties the age at which retirement benefits start to life expectancy. The public finances gain; workers nearing retirement pay with more years of work.",
      UK: "Ties the State Pension age to life expectancy. The public finances gain; workers nearing retirement pay with more years of work.",
    },
    noStatute: {
      US: "The retirement age moves only when Congress votes to change it.",
      UK: "The State Pension age moves only when Parliament votes to change it.",
    },
    levels: [
      // A negative cost is a saving on the pension line: fewer years of
      // pension paid, net of running the review.
      {
        name: "Periodic Review",
        description: "An independent review recommends a pension age every few years.",
        cost: 0.00002,
      },
      {
        name: "Partial Indexation",
        description: "The pension age rises by half of each gain in life expectancy.",
        cost: -0.0006,
      },
      {
        name: "Full Indexation",
        description:
          "The pension age moves with life expectancy, keeping the share of adult life spent retired fixed.",
        cost: -0.0012,
      },
      {
        name: "Accelerated Indexation",
        description:
          "The pension age rises faster than life expectancy until the system is fully funded.",
        cost: -0.002,
      },
    ],
  },

  {
    slug: "nuclearLicensingReform",
    from: 2030,
    category: "environment",
    targets: [
      { metricId: "environment.energySecurity", weight: 0.5 },
      { metricId: "environment.affordability", weight: 0.35 },
      { metricId: "environment.conservation", weight: -0.25 },
    ],
    title: {
      US: "Nuclear Licensing Modernization Act",
      UK: "Nuclear Licensing Reform Act",
    },
    description: {
      US: "Speeds up approval of new reactors, including small modular designs. Energy security and power bills gain; local objectors and nature sites pay.",
      UK: "Speeds up approval of new reactors, including small modular designs. Energy security and power bills gain; local objectors and nature sites pay.",
    },
    noStatute:
      "Each reactor is licensed from scratch, and approval takes the better part of a decade.",
    levels: [
      {
        name: "Regulator Staffing",
        description: "The nuclear regulator hires staff to clear its backlog of applications.",
        cost: 0.0001,
      },
      {
        name: "Approved Designs",
        description:
          "A reactor design approved once can be built anywhere without a fresh review of the design.",
        cost: 0.0003,
      },
      {
        name: "Fast-Track Siting",
        description:
          "Designated sites get fast permits, and local objections are heard on a fixed timetable.",
        cost: 0.0006,
      },
      {
        name: { US: "Nuclear Build Program", UK: "Nuclear Build Programme" },
        description:
          "Licensing is cut to a few years, with state backed finance for a fleet of new reactors.",
        cost: 0.001,
      },
    ],
  },

  // ── 2035 ────────────────────────────────────────────────────────────────
  {
    slug: "climateAdaptationFund",
    from: 2035,
    category: "environment",
    targets: [
      { metricId: "infrastructure.condition", weight: 0.45 },
      { metricId: "environment.stewardship", weight: 0.3 },
      { metricId: "economy.fiscal", weight: -0.25 },
    ],
    title: {
      US: "Climate Adaptation Fund Act",
      UK: "Climate Adaptation Fund Act",
    },
    description: {
      US: "Pays for sea walls, flood defenses, cooler cities and water storage so the country can live with a hotter climate. Exposed towns gain; taxpayers pay.",
      UK: "Pays for sea walls, flood defences, cooler cities and water storage so the country can live with a hotter climate. Exposed towns gain; taxpayers pay.",
    },
    noStatute: "Places protect themselves from floods, fires and heat with what they already have.",
    levels: [
      {
        name: "Risk Mapping",
        description: "The state maps flood, fire and heat risk and publishes it for every area.",
        cost: 0.0003,
      },
      {
        name: "Matched Grants",
        description: {
          US: "A fund matches what states and towns spend on flood defenses and heat shelters.",
          UK: "A fund matches what councils spend on flood defences and heat shelters.",
        },
        cost: 0.0012,
      },
      {
        name: "National Defense Works",
        description: {
          US: "The fund builds sea walls, levees and reservoirs to a national standard.",
          UK: "The fund builds sea walls, flood barriers and reservoirs to a national standard.",
        },
        cost: 0.0028,
      },
      {
        name: "Climate Ready Nation",
        description:
          "A long-term fund rebuilds roads, rail, power and homes to cope with the climate expected later in the century.",
        cost: 0.005,
      },
    ],
  },

  {
    slug: "managedRetreat",
    from: 2035,
    category: "infrastructure",
    budgetKeyOverride: { US: "infrastructure", UK: "other" },
    targets: [
      { metricId: "infrastructure.publicHousing", weight: 0.4 },
      { metricId: "environment.conservation", weight: 0.35 },
      { metricId: "infrastructure.ownership", weight: -0.3 },
      { metricId: "society.tradition", weight: -0.25 },
    ],
    title: {
      US: "Managed Retreat and Relocation Act",
      UK: "Managed Retreat and Coastal Relocation Act",
    },
    description: {
      US: "Buys out homes on coasts and floodplains that can no longer be defended and helps families move. Future flood victims and wetlands gain; homeowners and old communities pay.",
      UK: "Buys out homes on coasts and floodplains that can no longer be defended and helps families move. Future flood victims and wetlands gain; homeowners and old communities pay.",
    },
    noStatute: "Owners rebuild after every flood, and the state pays to repair them each time.",
    levels: [
      {
        name: "Voluntary Buyouts",
        description: "Owners of homes flooded again and again may sell them to the state.",
        cost: 0.0004,
      },
      {
        name: "No Rebuild Zones",
        description:
          "New building is banned on the most exposed land, and owners there are offered a buyout.",
        cost: 0.0012,
      },
      {
        name: "Planned Relocation",
        description:
          "Whole communities on failing coasts are moved to new homes inland, with the state paying the cost.",
        cost: 0.0025,
      },
      {
        name: "Compulsory Retreat",
        description:
          "The state may require people to leave land it judges indefensible, paying less than the old market value.",
        cost: 0.004,
      },
    ],
  },

  {
    slug: "basicIncomePilot",
    from: 2035,
    until: 2045,
    successor: "automationDividend",
    category: "economy",
    budgetKeyOverride: { US: "socialSecurity", UK: "welfare" },
    targets: [
      { metricId: "economy.householdIncome", weight: 0.45 },
      { metricId: "economy.workerSecurity", weight: 0.3 },
      { metricId: "society.familyStability", weight: 0.25 },
      { metricId: "economy.productivity", weight: -0.3 },
    ],
    title: {
      US: "Basic Income Pilot Act",
      UK: "Universal Basic Income Pilot Act",
    },
    description: {
      US: "Pays a regular cash income with no conditions to a group of residents to test whether it works. People in the pilot gain security; taxpayers pay and some work less.",
      UK: "Pays a regular cash income with no conditions to a group of residents to test whether it works. People in the pilot gain security; taxpayers pay and some work less.",
    },
    noStatute: "Cash support comes only through means-tested benefits with work conditions.",
    levels: [
      {
        name: "Local Trials",
        description: "A few towns pay a small monthly income to every adult for two years.",
        cost: 0.0005,
      },
      {
        name: "Regional Pilot",
        description: {
          US: "Several states pay a basic income to a large sample of adults and study the results.",
          UK: "Several regions pay a basic income to a large sample of adults and study the results.",
        },
        cost: 0.002,
      },
      {
        name: "Youth and Carer Income",
        description:
          "Every young adult and every unpaid carer in the country gets a basic income with no conditions.",
        cost: 0.006,
      },
      {
        name: "National Basic Income Trial",
        description:
          "Every adult gets a modest basic income as a national trial, replacing some smaller benefits.",
        cost: 0.015,
      },
    ],
  },

  {
    slug: "geneEditingRegulation",
    from: 2035,
    category: "health",
    targets: [
      { metricId: "health.outcomes", weight: 0.45 },
      { metricId: "education.research", weight: 0.3 },
      { metricId: "society.tradition", weight: -0.3 },
    ],
    title: {
      US: "Human Gene Editing Act",
      UK: "Human Genome Editing Act",
    },
    description: {
      US: "Sets which gene therapies may be licensed and paid for, and where the line on editing human embryos sits. Patients and researchers gain; religious and traditional objectors pay.",
      UK: "Sets which gene therapies may be licensed and paid for, and where the line on editing human embryos sits. Patients and researchers gain; religious and traditional objectors pay.",
    },
    noStatute:
      "Gene editing falls under general medicines law, and most therapies sit in legal limbo.",
    levels: [
      {
        name: "Research Licenses",
        description: {
          US: "Laboratories may edit human cells under license, and editing embryos for birth is banned.",
          UK: "Laboratories may edit human cells under licence, and editing embryos for birth is banned.",
        },
        cost: 0.0001,
      },
      {
        name: "Approved Therapies",
        description:
          "Gene therapies for serious inherited diseases may be approved and prescribed.",
        cost: 0.0003,
      },
      {
        name: "Funded Gene Medicine",
        description:
          "Approved gene therapies are paid for by the public health system, and a national regulator speeds up trials.",
        cost: 0.0008,
      },
      {
        name: "Heritable Editing Allowed",
        description: {
          US: "Editing embryos to prevent serious disease is allowed under strict license, and public funding covers it.",
          UK: "Editing embryos to prevent serious disease is allowed under strict licence, and public funding covers it.",
        },
        cost: 0.0014,
      },
    ],
  },

  {
    slug: "spaceTrafficAct",
    from: 2035,
    category: "defense",
    targets: [
      { metricId: "defense.security", weight: 0.4 },
      { metricId: "infrastructure.utilities", weight: 0.3 },
      { metricId: "economy.competition", weight: -0.25 },
    ],
    title: {
      US: "Space Traffic Management Act",
      UK: "Space Traffic and Orbital Safety Act",
    },
    description: {
      US: "Tracks satellites and debris, sets rules for launches and makes operators clear their dead satellites from orbit. Satellite services and defense gain; launch firms pay for compliance.",
      UK: "Tracks satellites and debris, sets rules for launches and makes operators clear their dead satellites from orbit. Satellite services and defence gain; launch firms pay for compliance.",
    },
    noStatute:
      "Operators launch under old licensing rules and nobody is responsible for crowded orbits.",
    levels: [
      {
        name: "Tracking Service",
        description: "The state tracks objects in orbit and warns operators of likely collisions.",
        cost: 0.0001,
      },
      {
        name: "Debris Rules",
        description: "Every new satellite must carry a plan to leave orbit at the end of its life.",
        cost: 0.0003,
      },
      {
        name: "Orbital Traffic Control",
        description: {
          US: "A regulator assigns orbits, can order maneuvers and fines operators who leave debris behind.",
          UK: "A regulator assigns orbits, can order manoeuvres and fines operators who leave debris behind.",
        },
        cost: 0.0006,
      },
      {
        name: "Orbital Clean-Up Duty",
        description: {
          US: "Operators pay into a fund that removes old debris, and the military may clear threats to key satellites.",
          UK: "Operators pay into a fund that removes old debris, and the armed forces may clear threats to key satellites.",
        },
        cost: 0.001,
      },
    ],
  },
];
