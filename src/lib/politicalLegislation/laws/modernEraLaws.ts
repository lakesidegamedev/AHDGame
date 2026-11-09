/**
 * Later-era national laws for the US and UK law books: the 2027 band (AI
 * liability, data protection, housing supply, critical minerals, cyber
 * resilience, platform content, and the climate laws: carbon price, coal
 * phase-out, clean power standard), the 2030 band (automation tax, wage
 * insurance, carbon border adjustment, heat standards, pension age indexation,
 * nuclear licensing), the 2035 band (climate adaptation fund, managed retreat,
 * basic income pilot, gene editing, space traffic) and the 2040 band
 * (automation dividend, four-day week, digital currency, sovereign wealth
 * fund), the 2045 band (longevity care, fossil fuel sunset, digital
 * self-ownership, water security) and the 2050 band (advanced AI oversight,
 * lifelong pension account, zero carbon economy, space resources). The 2045 and
 * 2050 bands also reach RU and DD. The same laws exist in the legacy catalogue
 * for DE, JP, CN and IE (seeds/shared/modernEraLegislation.ts).
 *
 * Every law carries an era `window`: it cannot be filed before its first year,
 * and an enacted one stays in force whatever the year. The automation tax also
 * closes to new bills in 2040, when the automation dividend replaces it; later
 * retirements name their successor in `successor`. They are national only.
 * A `both` law with a window would need year-aware regional read fallbacks
 * (see regionalDefaults.test.ts), so zoning and heat standards have no state
 * variant.
 *
 * Winners are the positive targets. Payers come through the same channels the
 * rest of the book uses: a cost on a budget line, and one negative target (the
 * metric the law trades away). The automation tax, the carbon price and the
 * carbon border adjustment raise real revenue through gdpRevenueFraction, as do the
 * automation dividend (a levy paid back out as a dividend), digital currency
 * (seigniorage) and the sovereign wealth fund (its returns). Pension age
 * indexation carries a negative cost from its second rung: a saving on the
 * pension line.
 * In energy transition worlds the climate laws and the minerals recycling
 * duty also reach firms' input costs and emissions (energyTransition/rules).
 *
 * Every law seeds at level 0, so adding them moves no day-one budget, metric
 * or equilibrium.
 */

import type { PoliticalMetricCategoryId, PoliticalMetricId } from "../../politicalMetrics/types";
import type { LawLevel, PoliticalLaw } from "../types";
import { LATE_BAND_SPECS } from "./modernEraLawsLate";

type ModernLawCountry = "US" | "UK" | "RU" | "DD";

/** Text that differs by country; a plain string is shared. */
type Copy = string | { US: string; UK: string };

interface LevelSpec {
  name: Copy;
  description: Copy;
  cost?: number;
  revenue?: number;
}

export interface ModernLawSpec {
  slug: string;
  from: 2027 | 2030 | 2035 | 2040 | 2045 | 2050;
  /** First year no new bill may file the law; an enacted one stays in force. */
  until?: number;
  /** Slug of the law that takes over new filing when this one closes. */
  successor?: string;
  category: PoliticalMetricCategoryId;
  /** Winners first (the first entry sets the law's lean), then the payer. */
  targets: Array<{ metricId: PoliticalMetricId; weight: number }>;
  budgetKeyOverride?: Partial<Record<ModernLawCountry, string>>;
  title: Copy;
  description: Copy;
  /** Levels 1 to 4; level 0 is the shared "no statute" rung below. */
  levels: [LevelSpec, LevelSpec, LevelSpec, LevelSpec];
  noStatute: Copy;
}

const pick = (copy: Copy, countryId: ModernLawCountry): string =>
  typeof copy === "string" ? copy : copy[countryId as keyof typeof copy];

const EARLIER_BAND_SPECS: readonly ModernLawSpec[] = [
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
  // ── 2040 ────────────────────────────────────────────────────────────────
  {
    slug: "automationDividend",
    from: 2040,
    category: "economy",
    budgetKeyOverride: { US: "socialSecurity", UK: "welfare" },
    targets: [
      { metricId: "economy.householdIncome", weight: 0.45 },
      { metricId: "society.socialMobility", weight: 0.3 },
      { metricId: "economy.productivity", weight: -0.3 },
    ],
    title: {
      US: "Automation Dividend Act",
      UK: "Automation Dividend Act",
    },
    description: {
      US: "Taxes the output of machines and software and pays it back to every resident as a yearly dividend. Households gain a share of automated wealth; the firms that automate pay.",
      UK: "Taxes the output of machines and software and pays it back to every resident as a yearly dividend. Households gain a share of automated wealth; the firms that automate pay.",
    },
    noStatute: "The gains from automation go to the firms that own the machines.",
    levels: [
      {
        name: "Token Dividend",
        description: "A small levy on automated output is paid out as an annual dividend.",
        cost: 0.0021,
        revenue: 0.002,
      },
      {
        name: "Shared Gains Dividend",
        description: "A larger levy funds a dividend worth a few weeks of wages each year.",
        cost: 0.0052,
        revenue: 0.005,
      },
      {
        name: "Citizens Share",
        description:
          "Every resident holds a share in a national automation fund that pays a dividend every quarter.",
        cost: 0.0103,
        revenue: 0.01,
      },
      {
        name: "Full Automation Dividend",
        description:
          "A heavy levy on automated output pays a dividend large enough to live on for many households.",
        cost: 0.0155,
        revenue: 0.015,
      },
    ],
  },
  {
    slug: "fourDayWeek",
    from: 2040,
    category: "economy",
    targets: [
      { metricId: "society.familyStability", weight: 0.4 },
      { metricId: "health.prevention", weight: 0.3 },
      { metricId: "economy.productivity", weight: -0.3 },
    ],
    title: {
      US: "Four-Day Work Week Act",
      UK: "Four-Day Working Week Act",
    },
    description: {
      US: "Shortens the standard working week to four days without a cut in pay. Workers and families gain time; employers pay for the lost hours.",
      UK: "Shortens the standard working week to four days without a cut in pay. Workers and families gain time; employers pay for the lost hours.",
    },
    noStatute: "The working week is whatever employers and workers agree.",
    levels: [
      {
        name: "Right to Request",
        description:
          "Workers may ask for a four-day week, and employers must give a reason to refuse.",
        cost: 0.0001,
      },
      {
        name: "Public Sector Trial",
        description:
          "Government departments move to a four-day week and report on output and wellbeing.",
        cost: 0.0004,
      },
      {
        name: "Thirty-Two Hour Standard",
        description:
          "Overtime pay starts after thirty-two hours a week, so most employers move to four days.",
        cost: 0.0008,
      },
      {
        name: "Four-Day Week Mandate",
        description:
          "A four-day week on full pay is the legal standard for every employer, enforced by inspectors.",
        cost: 0.0015,
      },
    ],
  },
  {
    slug: "digitalCurrencyLegalTender",
    from: 2040,
    category: "economy",
    targets: [
      { metricId: "economy.stability", weight: 0.4 },
      { metricId: "economy.competition", weight: 0.3 },
      { metricId: "order.dueProcess", weight: -0.3 },
    ],
    title: {
      US: "Digital Dollar Act",
      UK: "Digital Pound Act",
    },
    description: {
      US: "Makes a central bank digital dollar legal tender alongside cash. Payments get cheaper and safer; privacy and the banks that hold deposits pay.",
      UK: "Makes a Bank of England digital pound legal tender alongside cash. Payments get cheaper and safer; privacy and the banks that hold deposits pay.",
    },
    noStatute: "Money is cash and bank deposits. The central bank issues no digital currency.",
    levels: [
      {
        name: "Wholesale Digital Money",
        description: "Banks settle payments with each other in central bank digital money.",
        cost: 0.0001,
      },
      {
        name: "Retail Pilot",
        description:
          "Households may hold a capped amount of digital currency in a central bank wallet.",
        cost: 0.0002,
      },
      {
        name: "Legal Tender",
        description:
          "Digital currency is legal tender: every shop must accept it, and the state earns a margin on issuing it.",
        cost: 0.0004,
        revenue: 0.0005,
      },
      {
        name: "Cashless Transition",
        description:
          "Digital currency becomes the main form of money, cash is phased out and every payment leaves a record.",
        cost: 0.0006,
        revenue: 0.001,
      },
    ],
  },
  {
    slug: "sovereignWealthFundMandate",
    from: 2040,
    category: "economy",
    targets: [
      { metricId: "economy.stability", weight: 0.4 },
      { metricId: "economy.fiscal", weight: 0.3 },
      { metricId: "economy.competition", weight: -0.25 },
    ],
    title: {
      US: "American Sovereign Wealth Fund Act",
      UK: "National Wealth Fund Act",
    },
    description: {
      US: "Sets up a national investment fund, paid into from the budget, that owns stakes in firms at home and abroad. Future budgets gain its returns; taxpayers pay in today and private investors face a state rival.",
      UK: "Sets up a national investment fund, paid into from the budget, that owns stakes in firms at home and abroad. Future budgets gain its returns; taxpayers pay in today and private investors face a state rival.",
    },
    noStatute: "The state owns no investment fund, and surpluses go to paying down debt.",
    levels: [
      {
        name: "Seed Fund",
        description: "A small fund invests windfall revenue and reports its returns each year.",
        cost: 0.002,
        revenue: 0.0005,
      },
      {
        name: "Strategic Investment Mandate",
        description:
          "The fund is paid into every year and backs domestic industries the state judges strategic.",
        cost: 0.005,
        revenue: 0.0015,
      },
      {
        name: "Global Portfolio Fund",
        description:
          "A large fund invests worldwide under an independent board, with its returns paid into the budget.",
        cost: 0.01,
        revenue: 0.0035,
      },
      {
        name: "National Ownership Fund",
        description:
          "The fund takes large stakes in major companies and pays a share of its returns into the budget.",
        cost: 0.015,
        revenue: 0.006,
      },
    ],
  },
];

export const MODERN_ERA_LAW_SPECS: readonly ModernLawSpec[] = [
  ...EARLIER_BAND_SPECS,
  ...LATE_BAND_SPECS,
];

function buildLaw(spec: ModernLawSpec, countryId: ModernLawCountry): PoliticalLaw {
  const levels = [
    { name: "No Statute", description: pick(spec.noStatute, countryId) },
    ...spec.levels.map((level): LawLevel => ({
      name: pick(level.name, countryId),
      description: pick(level.description, countryId),
      ...(level.cost !== undefined ? { gdpCostFraction: level.cost } : {}),
      ...(level.revenue !== undefined ? { gdpRevenueFraction: level.revenue } : {}),
    })),
  ] as [LawLevel, LawLevel, LawLevel, LawLevel, LawLevel];
  return {
    id: `${countryId.toLowerCase()}.sec.${spec.slug}`,
    countryId,
    kind: "secondary",
    targets: spec.targets.map((target) => ({ ...target })),
    title: pick(spec.title, countryId),
    description: pick(spec.description, countryId),
    category: spec.category,
    allowedScope: "national",
    baselineLevel: 0,
    window: { from: spec.from, ...(spec.until !== undefined ? { until: spec.until } : {}) },
    levels,
    ...(spec.budgetKeyOverride?.[countryId]
      ? { budgetKeyOverride: spec.budgetKeyOverride[countryId] }
      : {}),
  };
}

export const US_MODERN_ERA_LAWS: PoliticalLaw[] = MODERN_ERA_LAW_SPECS.map((spec) =>
  buildLaw(spec, "US")
);

export const UK_MODERN_ERA_LAWS: PoliticalLaw[] = MODERN_ERA_LAW_SPECS.map((spec) =>
  buildLaw(spec, "UK")
);

/** First year of the bands that RU and DD also carry. */
export const SHARED_BAND_FROM_YEAR = 2045;

const sharedBand = (country: "RU" | "DD"): PoliticalLaw[] =>
  MODERN_ERA_LAW_SPECS.filter((spec) => spec.from >= SHARED_BAND_FROM_YEAR).map((spec) =>
    buildLaw(spec, country)
  );

export const RU_MODERN_ERA_LAWS: PoliticalLaw[] = sharedBand("RU");

export const DD_MODERN_ERA_LAWS: PoliticalLaw[] = sharedBand("DD");
