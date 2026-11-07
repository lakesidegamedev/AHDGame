import type {
  DemographicEffect,
  EffectTargetWeighted,
  LegislationPolicyOption,
  LegislationType,
} from "@/lib/db/types/legislation";

type CountryScope = NonNullable<LegislationType["countryScope"]>;
type ChamberKey = LegislationType["positions"][number]["chamber"];

/**
 * Law types that first become fileable in 2027 or 2030, generated for every
 * legacy-catalog legislature that runs the full simulation in a modern world.
 *
 * Each law is a seven-option ladder ordered left to right. The centre option
 * (index 3) is "no statute": no cost, no effect, and it is what a world seeds
 * as the national baseline when the law is already open at the start year
 * (basePolicies seeds index 3). Players and NPPs then move the law either way.
 *
 * Costs are hand-priced fractions of GDP on every option, so the era cost
 * materializer leaves them alone, and the cost catalog excludes these types
 * from its per-domain divisor so adding them does not reprice existing laws.
 *
 * The United States and United Kingdom use the new-generation law book and
 * are not covered here.
 */

/** Spending line a law's cost books to; resolved per country below. */
type BudgetLine = "technology" | "housing" | "industry" | "security" | "welfare";

export interface ModernEraLegislatureSpec {
  /** Id prefix, e.g. "de" gives "de_ai_liability_act". */
  prefix: string;
  scope: CountryScope;
  chamberKey: ChamberKey;
  budgetCategories: Record<BudgetLine, string>;
}

/** The legacy-catalog legislatures that run the full simulation in a modern world. */
export const MODERN_ERA_LEGISLATURE_SPECS: readonly ModernEraLegislatureSpec[] = [
  {
    prefix: "de",
    scope: "de",
    chamberKey: "bundestag",
    budgetCategories: {
      technology: "other",
      housing: "other",
      industry: "other",
      security: "defense",
      welfare: "welfare",
    },
  },
  {
    prefix: "jp",
    scope: "jp",
    chamberKey: "shugiin",
    budgetCategories: {
      technology: "technology",
      housing: "infrastructure",
      industry: "economic",
      security: "defense",
      welfare: "social",
    },
  },
  {
    prefix: "cn",
    scope: "cn",
    chamberKey: "npc",
    budgetCategories: {
      technology: "other",
      housing: "infrastructure",
      industry: "other",
      security: "defense",
      welfare: "socialSecurity",
    },
  },
  {
    prefix: "ie",
    scope: "ie",
    chamberKey: "dail",
    budgetCategories: {
      technology: "other",
      housing: "housing",
      industry: "other",
      security: "defense",
      welfare: "socialProtection",
    },
  },
];

type Stance = LegislationPolicyOption["stance"];
type Direction = LegislationPolicyOption["effectDirection"];

interface OptionCopy {
  name: string;
  explanation: string;
}

interface ModernEraLaw {
  /** Id suffix after the country prefix. */
  slug: string;
  /** First fileable calendar year. */
  from: 2027 | 2030;
  name: string;
  description: string;
  explanation: string;
  policyDomain: string;
  subCategory: string;
  committee: string;
  /** Absent: a regulatory law with no spending line (cost class "none"). */
  budgetLine?: BudgetLine;
  /** Signed for an effectDirection +1 option; positive improves the metric. */
  effects: EffectTargetWeighted[];
  demographicEffects?: DemographicEffect[];
  /** Seven options, left to right; index 3 is the no-statute centre. */
  options: readonly [
    OptionCopy,
    OptionCopy,
    OptionCopy,
    OptionCopy,
    OptionCopy,
    OptionCopy,
    OptionCopy,
  ];
  /** Which end the +1 push is: "left" (default) or "right". */
  reformEnd?: "left" | "right";
  /** Share of GDP per option when budgetLine is set; index 3 must be 0. */
  gdpCostFractions?: readonly [number, number, number, number, number, number, number];
}

const STANCES: readonly Stance[] = ["left", "left", "left", "center", "right", "right", "right"];
const ECONOMIC: readonly number[] = [-3, -2, -1, 0, 1, 2, 3];
const LEFT_REFORM: readonly Direction[] = [1, 1, 1, 0, -1, -1, -1];
const RIGHT_REFORM: readonly Direction[] = [-1, -1, -1, 0, 1, 1, 1];

export const MODERN_ERA_LAWS: readonly ModernEraLaw[] = [
  // ── 2027 ──────────────────────────────────────────────────────────────────
  {
    slug: "ai_liability_act",
    from: 2027,
    name: "AI Liability and Transparency Act",
    description:
      "Sets who answers for harm caused by artificial intelligence systems and what developers must disclose",
    explanation:
      "This act decides whether companies that build and deploy AI systems are liable when those systems cause harm, and whether they must disclose how high-risk systems are trained and tested. Stricter rules protect the public and raise trust, but slow adoption and add compliance costs for developers and the businesses that use them.",
    policyDomain: "technology",
    subCategory: "Artificial intelligence",
    committee: "Digital Affairs",
    budgetLine: "technology",
    gdpCostFractions: [0.0009, 0.0006, 0.0003, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "governance", metricId: "governmentTransparency", weight: 0.6 },
      { metricCategoryId: "governance", metricId: "civilLiberties", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "regulatoryBurden", weight: -0.4 },
      { metricCategoryId: "governance", metricId: "roboticsAdoption", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "investorConfidence", weight: -0.2 },
    ],
    demographicEffects: [
      { dim: "income", bucket: "high", target: "economicLean", direction: -0.3 },
      { dim: "age", bucket: "young", target: "economicLean", direction: 0.2 },
    ],
    options: [
      {
        name: "Public AI Licensing Authority",
        explanation:
          "High-risk AI systems need a licence before release, developers carry strict liability for harm, and a public authority audits training data and testing.",
      },
      {
        name: "Strict AI Liability",
        explanation:
          "Developers and deployers are liable for harm from their systems unless they prove they took every reasonable care, and must publish risk reports.",
      },
      {
        name: "AI Transparency Duty",
        explanation:
          "Developers must label AI-generated content and disclose how high-risk systems were tested. Ordinary negligence rules decide liability.",
      },
      {
        name: "No AI Statute",
        explanation:
          "AI systems are governed by existing product, contract and negligence law, with no rules written for them.",
      },
      {
        name: "Voluntary AI Codes",
        explanation:
          "Industry writes its own codes of practice. The state endorses them but imposes no new duties.",
      },
      {
        name: "AI Safe Harbour",
        explanation:
          "Developers who follow a published code are shielded from most liability claims for harm caused by their systems.",
      },
      {
        name: "AI Innovation Shield",
        explanation:
          "AI developers are broadly protected from liability and disclosure rules, and regulators may not impose new duties without a fresh act.",
      },
    ],
  },
  {
    slug: "data_protection_overhaul",
    from: 2027,
    name: "Data Protection Overhaul",
    description: "Rewrites how companies and the state may collect, share and sell personal data",
    explanation:
      "This act sets the rules for personal data: what companies may collect, whether they may sell it, how long they may keep it, and what the state may demand. Stronger protection raises public trust and civil liberties, but costs businesses, especially small ones, and slows data-driven research.",
    policyDomain: "technology",
    subCategory: "Personal data",
    committee: "Digital Affairs",
    budgetLine: "technology",
    gdpCostFractions: [0.0005, 0.0003, 0.00015, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "governance", metricId: "civilLiberties", weight: 0.6 },
      { metricCategoryId: "governance", metricId: "publicTrust", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "regulatoryBurden", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "smallBusinessFormation", weight: -0.2 },
      { metricCategoryId: "economic", metricId: "rdIntensity", weight: -0.15 },
    ],
    options: [
      {
        name: "Data Rights Charter",
        explanation:
          "Personal data belongs to the person. Sale of personal data is banned, retention is strictly limited, and a well-funded regulator can fine a share of global turnover.",
      },
      {
        name: "Consent by Default",
        explanation:
          "Companies need clear opt-in consent for every use of personal data, and people can demand deletion at any time.",
      },
      {
        name: "Modernised Data Code",
        explanation:
          "Existing data rules are updated with breach reporting, simpler consent and a larger regulator.",
      },
      {
        name: "No Overhaul",
        explanation: "Existing data protection law stays as it is.",
      },
      {
        name: "Business-Friendly Data Code",
        explanation:
          "Consent rules are simplified and companies may use data for any purpose that is compatible with why it was collected.",
      },
      {
        name: "Open Data Market",
        explanation:
          "Companies may share and sell personal data freely once it is pseudonymised. Fines are capped at a low level.",
      },
      {
        name: "Data Deregulation Act",
        explanation:
          "Most data protection duties are repealed. People keep only a right to be told about a breach.",
      },
    ],
  },
  {
    slug: "housing_supply_reform",
    from: 2027,
    name: "Housing Supply and Zoning Reform",
    description: "Decides how much new housing may be built and who decides where it goes",
    explanation:
      "This act sets planning rules for new homes. Building more homes lowers rents and house prices and reduces homelessness, which helps renters and young people, but existing homeowners see their property values fall and the public building programmes cost money. Tighter local control protects neighbourhoods and home values while housing pressure grows.",
    policyDomain: "housing",
    subCategory: "Planning and zoning",
    committee: "Housing",
    budgetLine: "housing",
    gdpCostFractions: [0.003, 0.0015, 0.0005, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "social", metricId: "housingAffordability", weight: 0.7 },
      { metricCategoryId: "social", metricId: "housingSupplyGrowth", weight: 0.5 },
      { metricCategoryId: "social", metricId: "homelessnessRate", weight: 0.4 },
      { metricCategoryId: "economic", metricId: "costOfLiving", weight: 0.2 },
      { metricCategoryId: "economic", metricId: "propertyValueIndex", weight: -0.4 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.2 },
    ],
    demographicEffects: [
      { dim: "age", bucket: "young", target: "economicLean", direction: 0.4 },
      { dim: "age", bucket: "senior", target: "economicLean", direction: -0.3 },
    ],
    options: [
      {
        name: "National Homes Programme",
        explanation:
          "The state builds homes at scale on public land, overrides local plans that block building, and allows apartments near every station.",
      },
      {
        name: "Build Everywhere Act",
        explanation:
          "Homes up to four storeys may be built by right on any residential plot, and the state funds new transport and services for growing areas.",
      },
      {
        name: "Faster Planning Act",
        explanation:
          "Planning decisions have firm deadlines, approval is presumed for homes that meet the rules, and councils get grants for meeting building targets.",
      },
      {
        name: "No Zoning Reform",
        explanation: "Local councils keep their existing planning powers and rules.",
      },
      {
        name: "Neighbourhood Consent",
        explanation:
          "Large developments need the support of neighbouring residents before they can go ahead.",
      },
      {
        name: "Green Belt Protection",
        explanation:
          "Building on open land around cities is banned, and density limits in existing neighbourhoods are tightened.",
      },
      {
        name: "Local Control Charter",
        explanation:
          "Councils may halt all new building in their area, and higher authorities may not overrule them.",
      },
    ],
  },
  {
    slug: "critical_minerals_stockpile",
    from: 2027,
    name: "Critical Minerals Stockpile Act",
    description:
      "Sets whether the state buys and holds reserves of minerals vital to industry and defence",
    explanation:
      "This act decides whether the state stockpiles lithium, rare earths, cobalt and other minerals that batteries, electronics and weapons depend on. A stockpile protects factories and the armed forces from supply shocks, but costs taxpayers, raises prices while the state is buying, and puts the state into a market private firms used to run.",
    policyDomain: "economic",
    subCategory: "Strategic resources",
    committee: "Economic Affairs",
    budgetLine: "industry",
    gdpCostFractions: [0.002, 0.0012, 0.0005, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "economic", metricId: "manufacturingCompetitiveness", weight: 0.4 },
      { metricCategoryId: "governance", metricId: "militaryReadiness", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "costOfLiving", weight: -0.15 },
    ],
    options: [
      {
        name: "State Minerals Corporation",
        explanation:
          "A state company buys and holds two years of national demand for every critical mineral and may take stakes in foreign mines. Makers must recover a fifth of the rare earths they use from scrap.",
      },
      {
        name: "Strategic Minerals Reserve",
        explanation:
          "The state holds a year of national demand for the most vital minerals and releases it in a supply crisis. Makers must recover a tenth of the rare earths they use from scrap.",
      },
      {
        name: "Emergency Minerals Buffer",
        explanation:
          "The state holds a small buffer of the minerals defence industries need most and requires large users to report their stocks.",
      },
      {
        name: "No Stockpile",
        explanation: "The state holds no mineral reserves. Supply is left to industry.",
      },
      {
        name: "Industry Stockholding Credit",
        explanation:
          "Firms that hold their own mineral reserves get a modest tax credit. The state holds nothing itself.",
      },
      {
        name: "Open Sourcing Policy",
        explanation:
          "The state commits to buying minerals on the open world market and removes barriers to foreign suppliers.",
      },
      {
        name: "Reserve Sell-Off",
        explanation:
          "Any state mineral holdings are sold, and the state is barred from building new ones.",
      },
    ],
  },
  {
    slug: "cyber_resilience_mandate",
    from: 2027,
    name: "Cyber Resilience Mandate",
    description:
      "Sets the security duties of operators of power, water, banking and other essential services",
    explanation:
      "This act decides how far the state requires essential service operators to defend against cyber attack, test their systems and report incidents. Strong mandates keep the grid and banks running under attack and strengthen national defence, but cost the state a cyber agency and cost businesses in compliance.",
    policyDomain: "defense",
    subCategory: "Cyber security",
    committee: "Security",
    budgetLine: "security",
    gdpCostFractions: [0.0015, 0.001, 0.0005, 0, 0, 0, 0],
    effects: [
      // Readiness arrives through the defence spending channel this law books to.
      { metricCategoryId: "infrastructure", metricId: "powerGridReliability", weight: 0.4 },
      { metricCategoryId: "governance", metricId: "publicTrust", weight: 0.2 },
      { metricCategoryId: "economic", metricId: "regulatoryBurden", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "smallBusinessFormation", weight: -0.15 },
    ],
    options: [
      {
        name: "National Cyber Defence Command",
        explanation:
          "A state cyber command may direct the defences of every essential operator, runs live attack drills, and can fine operators that fall short.",
      },
      {
        name: "Mandatory Security Standards",
        explanation:
          "Essential operators must meet a national security standard, pass yearly audits and report every serious incident within a day.",
      },
      {
        name: "Incident Reporting Duty",
        explanation:
          "Essential operators must report serious attacks to a national agency, which shares warnings across industry.",
      },
      {
        name: "No Mandate",
        explanation: "Operators manage their own cyber security with no state requirements.",
      },
      {
        name: "Voluntary Security Partnership",
        explanation:
          "The state shares threat warnings with operators that sign up, but sets no duties.",
      },
      {
        name: "Operator Self-Certification",
        explanation:
          "Operators certify their own security, and existing reporting duties are withdrawn.",
      },
      {
        name: "Cyber Liability Shield",
        explanation:
          "Operators that suffer an attack are shielded from legal claims by customers, and the state sets no standards.",
      },
    ],
  },
  {
    slug: "platform_content_law",
    from: 2027,
    name: "Platform Content Law",
    description: "Sets what online platforms must do about harmful and false content",
    explanation:
      "This act decides the duties of social media and other online platforms over what their users post. Tough duties cut disinformation and polarisation, but give platforms and regulators power over speech, which press freedom groups and civil liberties campaigners oppose.",
    policyDomain: "mediaInformation",
    subCategory: "Online platforms",
    committee: "Digital Affairs",
    budgetLine: "technology",
    gdpCostFractions: [0.0004, 0.00025, 0.0001, 0, 0, 0, 0],
    effects: [
      // Press freedom is the engine root of disinformation risk, so the speech
      // cost lands on civil liberties rather than on both ends of that edge.
      { metricCategoryId: "mediaInformation", metricId: "disinformationRisk", weight: 0.5 },
      { metricCategoryId: "mediaInformation", metricId: "mediaPolarization", weight: 0.3 },
      { metricCategoryId: "governance", metricId: "civilLiberties", weight: -0.4 },
      { metricCategoryId: "economic", metricId: "regulatoryBurden", weight: -0.3 },
    ],
    options: [
      {
        name: "Online Harms Regulator",
        explanation:
          "A regulator may order platforms to remove harmful or false content within hours and can block services that refuse.",
      },
      {
        name: "Duty of Care Act",
        explanation:
          "Large platforms must assess and reduce the harms their services cause, with heavy fines for failure.",
      },
      {
        name: "Notice and Takedown",
        explanation:
          "Platforms must remove illegal content once told about it and publish reports on what they removed.",
      },
      {
        name: "No Platform Statute",
        explanation: "Platforms set their own content rules under existing law.",
      },
      {
        name: "Transparency Only",
        explanation:
          "Platforms must publish their moderation rules but face no duty to remove lawful content.",
      },
      {
        name: "Platform Neutrality Act",
        explanation:
          "Large platforms may not remove lawful speech on political grounds and must offer an appeal to users they ban.",
      },
      {
        name: "Free Speech Shield",
        explanation:
          "Platforms are immune from liability for user posts and are barred from removing lawful content.",
      },
    ],
  },
  {
    slug: "carbon_price",
    from: 2027,
    name: "Carbon Price Act",
    description: "Charges power plants and heavy industry for every ton of carbon they release",
    explanation:
      "This act decides whether power plants, chemical works, factories, mines and cement makers pay a charge on each ton of carbon they release. A price pushes coal and gas power and heavy industry toward cleaner methods and cuts emissions, but raises their running costs, power bills and prices in the shops. The charge is a regulatory levy here: its revenue does not yet appear as a separate budget line.",
    policyDomain: "environment",
    subCategory: "Carbon pricing",
    committee: "Energy and Environment",
    effects: [
      { metricCategoryId: "environment", metricId: "carbonEmissions", weight: 0.6 },
      { metricCategoryId: "environment", metricId: "energyTransitionProgress", weight: 0.4 },
      { metricCategoryId: "economic", metricId: "costOfLiving", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "manufacturingCompetitiveness", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "regulatoryBurden", weight: -0.2 },
    ],
    demographicEffects: [
      { dim: "age", bucket: "young", target: "economicLean", direction: 0.2 },
      { dim: "urbanization", bucket: "rural", target: "economicLean", direction: -0.2 },
    ],
    options: [
      {
        name: "Full Social Cost of Carbon",
        explanation:
          "Every ton pays its full estimated damage. Coal and gas power and heavy industry pay heavily and prices rise across the shops.",
      },
      {
        name: "High Carbon Price",
        explanation:
          "A steep charge per ton makes coal power a losing business and pushes industry to cleaner methods.",
      },
      {
        name: "Moderate Carbon Price",
        explanation:
          "A real charge per ton. Coal power, chemicals and steel pay noticeably more to run.",
      },
      {
        name: "No Carbon Price",
        explanation: "Carbon released by power plants and industry carries no charge.",
      },
      {
        name: "Voluntary Offsets",
        explanation:
          "Firms may buy offsets to call themselves carbon neutral. Nothing is charged by the state.",
      },
      {
        name: "Fuel Price Relief",
        explanation:
          "Duties on coal, gas and power are cut to keep energy cheap for homes and industry.",
      },
      {
        name: "Carbon Charge Ban",
        explanation: "Any charge on carbon is banned, and existing energy duties are lifted.",
      },
    ],
  },
  {
    slug: "coal_phase_out",
    from: 2027,
    name: "Coal Power Phase-Out",
    description: "Sets a date by which coal power must close and who pays for the closures",
    explanation:
      "This act decides whether coal power stations must close by a set date. An earlier date cleans the air and cuts emissions, and running costs of old plants climb as the date nears, but owners lose their plants, mining towns lose jobs, the grid loses firm supply until replacements are built, and the state pays compensation and retraining.",
    policyDomain: "environment",
    subCategory: "Coal power",
    committee: "Energy and Environment",
    budgetLine: "industry",
    gdpCostFractions: [0.0015, 0.001, 0.0005, 0, 0, 0.0002, 0.0006],
    effects: [
      { metricCategoryId: "environment", metricId: "carbonEmissions", weight: 0.5 },
      { metricCategoryId: "environment", metricId: "energyTransitionProgress", weight: 0.4 },
      { metricCategoryId: "infrastructure", metricId: "powerGridReliability", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "laborParticipation", weight: -0.2 },
      { metricCategoryId: "economic", metricId: "regulatoryBurden", weight: -0.2 },
    ],
    demographicEffects: [
      { dim: "urbanization", bucket: "rural", target: "economicLean", direction: -0.3 },
    ],
    options: [
      {
        name: "Rapid Coal Exit",
        explanation:
          "Coal power must close within a few years. Old plants become costly at once and coal towns get a large support fund.",
      },
      {
        name: "Early Closure Date",
        explanation:
          "Coal power must close within about a decade, with retraining money for the towns that lose it.",
      },
      {
        name: "Firm Closure Date",
        explanation:
          "Coal power must close well within two decades, and running costs climb as the date nears.",
      },
      {
        name: "No Phase-Out",
        explanation: "Coal plants run for as long as their owners find them worth running.",
      },
      {
        name: "Coal Reserve Plants",
        explanation:
          "Coal plants are kept on standby as a reserve for winter peaks, and the state pays them to stay open.",
      },
      {
        name: "Coal Lifeline",
        explanation:
          "Coal plants that would close get a state payment to keep running and keep their mines open.",
      },
      {
        name: "Coal Guarantee",
        explanation:
          "The state guarantees coal power a share of the grid and pays to keep every plant and mine open.",
      },
    ],
  },
  {
    slug: "clean_power_standard",
    from: 2027,
    name: "Clean Power Standard",
    description: "Requires a set share of the country's power to come from clean sources",
    explanation:
      "This act decides what share of power must come from renewables, storage, nuclear and other clean sources. When the country falls short, coal and gas plants pay for certificates, so a high standard rewards building clean power and punishes fossil plants. It cuts emissions, but raises power bills while the clean fleet is built.",
    policyDomain: "environment",
    subCategory: "Clean power",
    committee: "Energy and Environment",
    budgetLine: "industry",
    gdpCostFractions: [0.0006, 0.0004, 0.0002, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "environment", metricId: "energyTransitionProgress", weight: 0.6 },
      { metricCategoryId: "environment", metricId: "carbonEmissions", weight: 0.4 },
      { metricCategoryId: "economic", metricId: "costOfLiving", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "regulatoryBurden", weight: -0.2 },
    ],
    options: [
      {
        name: "Near-Zero Carbon Grid",
        explanation:
          "Almost all power must be clean, and every fossil plant pays a steep charge while the country falls short.",
      },
      {
        name: "Four-Fifths Clean",
        explanation:
          "Four fifths of power must be clean. Gas and coal plants pay heavily unless renewables, storage and nuclear are built.",
      },
      {
        name: "Three-Fifths Clean",
        explanation:
          "Three fifths of power must be clean, and fossil plants pay for the shortfall.",
      },
      {
        name: "No Standard",
        explanation: "No share of power has to come from clean sources.",
      },
      {
        name: "Technology Neutral Grid",
        explanation:
          "Every source competes on price alone, and clean power gets no preference in grid access.",
      },
      {
        name: "Firm Power First",
        explanation:
          "Grid operators must favour plants that run on demand, which in practice means coal and gas.",
      },
      {
        name: "Renewables Cap",
        explanation:
          "The share of wind and solar on the grid is capped to protect existing plants.",
      },
    ],
  },
  // ── 2030 ──────────────────────────────────────────────────────────────────
  {
    slug: "automation_tax",
    from: 2030,
    name: "Automation Tax",
    description: "Sets whether firms pay a levy when they replace workers with robots and software",
    explanation:
      "This act decides whether companies pay a tax on machines and software that replace workers. A high levy slows automation and protects jobs and wages, but cuts productivity and investment. Firms that automate pay, and workers in routine jobs gain time. The levy is a regulatory charge here: its revenue does not yet appear as a separate budget line.",
    policyDomain: "economic",
    subCategory: "Automation",
    committee: "Economic Affairs",
    effects: [
      // Slower robot adoption feeds productivity through the engine's basket.
      { metricCategoryId: "governance", metricId: "roboticsAdoption", weight: -0.6 },
      { metricCategoryId: "social", metricId: "incomeInequality", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "laborParticipation", weight: 0.2 },
      { metricCategoryId: "economic", metricId: "investorConfidence", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.3 },
    ],
    demographicEffects: [
      { dim: "income", bucket: "low", target: "economicLean", direction: 0.3 },
      { dim: "income", bucket: "high", target: "economicLean", direction: -0.3 },
    ],
    options: [
      {
        name: "Full Automation Levy",
        explanation:
          "Firms pay a levy equal to the payroll tax of every job a machine or software replaces, for as long as the machine runs.",
      },
      {
        name: "Robot Payroll Tax",
        explanation:
          "Industrial robots and workplace software that replace staff are taxed at half the payroll tax of the jobs they replace.",
      },
      {
        name: "Displacement Charge",
        explanation:
          "Large firms pay a one-off charge for each worker made redundant by automation.",
      },
      {
        name: "No Automation Tax",
        explanation: "Machines and software are taxed like any other business investment.",
      },
      {
        name: "Automation Investment Allowance",
        explanation: "Firms may deduct part of the cost of new robots and software from their tax.",
      },
      {
        name: "Automation Tax Credit",
        explanation: "Firms get a tax credit for investment in robots and workplace software.",
      },
      {
        name: "Automation Free Zones",
        explanation:
          "Firms that automate in designated zones pay no tax on the equipment and are exempt from redundancy rules.",
      },
    ],
  },
  {
    slug: "wage_insurance",
    from: 2030,
    name: "Wage Insurance Act",
    description: "Tops up the pay of workers who lose a job and take a lower-paid one",
    explanation:
      "This act decides whether the state makes up part of the pay a worker loses after redundancy when they move into a lower-paid job. It cushions workers displaced by automation and trade, cuts poverty and gets people back to work faster, but costs the budget and is paid for by taxpayers.",
    policyDomain: "labor",
    subCategory: "Income security",
    committee: "Labour and Social Affairs",
    budgetLine: "welfare",
    gdpCostFractions: [0.004, 0.0025, 0.001, 0, 0, 0, 0],
    // Poverty and inequality relief arrives through the welfare spending
    // channel this law books to; targeting them directly would double count.
    effects: [
      { metricCategoryId: "economic", metricId: "matchingFriction", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "consumerConfidence", weight: 0.2 },
      { metricCategoryId: "economic", metricId: "laborParticipation", weight: 0.15 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.2 },
    ],
    demographicEffects: [
      { dim: "income", bucket: "low", target: "economicLean", direction: 0.4 },
      { dim: "income", bucket: "middle", target: "economicLean", direction: 0.2 },
    ],
    options: [
      {
        name: "Universal Wage Guarantee",
        explanation:
          "Any worker who loses a job and takes a lower-paid one has the gap made up in full for three years.",
      },
      {
        name: "Wage Insurance Scheme",
        explanation:
          "Displaced workers get half the pay gap made up for two years, up to a generous cap.",
      },
      {
        name: "Displaced Worker Top-Up",
        explanation:
          "Workers displaced by automation or trade get a modest top-up for one year in their new job.",
      },
      {
        name: "No Wage Insurance",
        explanation: "Displaced workers rely on ordinary unemployment benefits.",
      },
      {
        name: "Retraining Loans",
        explanation:
          "Displaced workers may borrow to retrain, repaying the loan from future earnings.",
      },
      {
        name: "Private Wage Insurance",
        explanation: "Workers may buy wage insurance privately, with no state top-up.",
      },
      {
        name: "Benefit Time Limits",
        explanation:
          "Unemployment benefits end sooner, and displaced workers are expected to take the first suitable job offered.",
      },
    ],
  },
  {
    slug: "carbon_border_adjustment",
    from: 2030,
    name: "Carbon Border Adjustment",
    description: "Charges imported goods for the carbon emitted in making them",
    explanation:
      "This act decides whether importers pay a charge on the carbon emitted abroad in making steel, cement, chemicals and other goods. It protects domestic producers who already pay for their emissions and pushes trading partners to cut theirs, but raises prices for consumers and slows trade. The charge is a regulatory levy here: its revenue does not yet appear as a separate budget line.",
    policyDomain: "environment",
    subCategory: "Carbon trade",
    committee: "Energy and Environment",
    effects: [
      { metricCategoryId: "environment", metricId: "carbonEmissions", weight: 0.4 },
      { metricCategoryId: "environment", metricId: "energyTransitionProgress", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "manufacturingCompetitiveness", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "tradeGrowth", weight: -0.4 },
      { metricCategoryId: "economic", metricId: "costOfLiving", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "regulatoryBurden", weight: -0.2 },
    ],
    options: [
      {
        name: "Full Carbon Border Charge",
        explanation:
          "Every import pays the full domestic carbon price on the emissions made in producing it, with no free allowances for anyone.",
      },
      {
        name: "Heavy Industry Border Charge",
        explanation:
          "Imports of steel, cement, aluminium, fertiliser and chemicals pay the domestic carbon price on their emissions.",
      },
      {
        name: "Carbon Reporting at the Border",
        explanation:
          "Importers of heavy industrial goods must report the emissions in their products, with a small charge on the worst.",
      },
      {
        name: "No Border Adjustment",
        explanation: "Imports pay no carbon charge.",
      },
      {
        name: "Climate Club Exemptions",
        explanation:
          "Imports from countries with their own carbon policy are exempt from any future charge, and no charge applies today.",
      },
      {
        name: "Free Trade in Carbon",
        explanation:
          "The state commits never to charge imports for their carbon and refunds domestic producers who export.",
      },
      {
        name: "Carbon Charge Ban",
        explanation:
          "Border carbon charges are banned, and existing domestic carbon costs on exporters are lifted.",
      },
    ],
  },
  {
    slug: "heat_labour_standards",
    from: 2030,
    name: "Heat Labour Standards",
    description: "Sets maximum working temperatures and rest rules during heatwaves",
    explanation:
      "This act decides how employers must protect workers in extreme heat: shade, water, rest breaks and stopping work above a set temperature. Strong standards save lives and protect outdoor and factory workers, but cut output on hot days and cost employers, especially small builders and farms.",
    policyDomain: "labor",
    subCategory: "Workplace safety",
    committee: "Labour and Social Affairs",
    budgetLine: "welfare",
    gdpCostFractions: [0.0006, 0.0004, 0.0002, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "healthcare", metricId: "preventableMortality", weight: 0.4 },
      { metricCategoryId: "social", metricId: "workLifeBalance", weight: 0.3 },
      { metricCategoryId: "environment", metricId: "climateResilience", weight: 0.2 },
      { metricCategoryId: "economic", metricId: "regulatoryBurden", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "smallBusinessFormation", weight: -0.2 },
    ],
    demographicEffects: [
      { dim: "income", bucket: "low", target: "economicLean", direction: 0.3 },
      { dim: "urbanization", bucket: "rural", target: "economicLean", direction: -0.2 },
    ],
    options: [
      {
        name: "Heat Stop Law",
        explanation:
          "All outdoor and unshaded work stops above a set temperature with full pay, enforced by a heat inspectorate.",
      },
      {
        name: "Mandatory Heat Breaks",
        explanation:
          "Employers must give paid rest breaks, shade and water on hot days, and heavy outdoor work ends at midday in heatwaves.",
      },
      {
        name: "Heat Safety Plans",
        explanation:
          "Employers must write a heat safety plan and train staff, with inspections after any heat injury.",
      },
      {
        name: "No Heat Standard",
        explanation: "General workplace safety law applies, with no specific heat rules.",
      },
      {
        name: "Heat Guidance Only",
        explanation: "The state publishes heat guidance for employers, with no legal duties.",
      },
      {
        name: "Employer Discretion",
        explanation:
          "Employers decide how to manage heat, and workers may not refuse work because of temperature alone.",
      },
      {
        name: "Heat Rule Repeal",
        explanation:
          "Existing heat rules are repealed and local authorities may not set their own.",
      },
    ],
  },
  {
    slug: "pension_age_indexation",
    from: 2030,
    name: "Pension Age Indexation Act",
    description: "Sets whether the state pension age rises with life expectancy",
    explanation:
      "This act decides whether the age at which people can draw the state pension is fixed or rises automatically as life expectancy grows. A fixed age protects older workers and keeps pensioner poverty down, but costs more every year as people live longer, paid for by taxpayers of working age. Indexation keeps the pension system solvent and keeps people in work, but makes those near retirement wait longer.",
    policyDomain: "social",
    subCategory: "Pension age",
    committee: "Labour and Social Affairs",
    budgetLine: "welfare",
    reformEnd: "left",
    gdpCostFractions: [0.005, 0.003, 0.0012, 0, 0, 0, 0],
    // Pensioner poverty relief arrives through the welfare spending channel.
    effects: [
      { metricCategoryId: "healthcare", metricId: "elderCareQuality", weight: 0.3 },
      { metricCategoryId: "governance", metricId: "rentenStabilitaet", weight: -0.5 },
      { metricCategoryId: "economic", metricId: "laborParticipation", weight: -0.4 },
    ],
    options: [
      {
        name: "Earlier Pension Age",
        explanation:
          "The state pension age is lowered by two years and frozen there, whatever happens to life expectancy.",
      },
      {
        name: "Pension Age Guarantee",
        explanation:
          "The state pension age is fixed in law and may not rise without a new act of parliament.",
      },
      {
        name: "Hard Work Exemption",
        explanation:
          "The pension age stays fixed, and people with long careers in physical work may retire earlier.",
      },
      {
        name: "No Indexation Rule",
        explanation: "The pension age is set from time to time by ordinary legislation.",
      },
      {
        name: "Partial Indexation",
        explanation:
          "The pension age rises by half of every year gained in life expectancy, with ten years' notice.",
      },
      {
        name: "Full Indexation",
        explanation:
          "The pension age rises automatically so that people spend a fixed share of adult life drawing a pension.",
      },
      {
        name: "Accelerated Indexation",
        explanation:
          "The pension age rises with life expectancy and an extra year is added at once to restore the system's balance.",
      },
    ],
  },
  {
    slug: "nuclear_licensing_reform",
    from: 2030,
    name: "Nuclear Licensing Reform",
    description: "Sets how quickly new nuclear plants can be approved and who pays for them",
    explanation:
      "This act decides how the state licenses nuclear power. Faster licensing and state-backed construction bring clean, reliable power and cut emissions, but carry safety risk and cost the budget when the state guarantees new plants. A phase-out ends that risk but costs the state decommissioning payments and makes the grid less reliable.",
    policyDomain: "environment",
    subCategory: "Nuclear power",
    committee: "Energy and Environment",
    // Loan guarantees and decommissioning payments are industrial support, and
    // an energy or grid line would double count the engine's spending channels.
    budgetLine: "industry",
    reformEnd: "right",
    gdpCostFractions: [0.0008, 0.0003, 0, 0, 0.0002, 0.0008, 0.002],
    effects: [
      { metricCategoryId: "environment", metricId: "carbonEmissions", weight: 0.4 },
      { metricCategoryId: "environment", metricId: "energyTransitionProgress", weight: 0.4 },
      { metricCategoryId: "infrastructure", metricId: "powerGridReliability", weight: 0.3 },
      { metricCategoryId: "environment", metricId: "nuclearSafety", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "regulatoryBurden", weight: 0.3 },
    ],
    options: [
      {
        name: "Nuclear Phase-Out",
        explanation:
          "Every nuclear plant closes within ten years, and the state compensates operators for the lost years of output.",
      },
      {
        name: "New Build Moratorium",
        explanation:
          "No new nuclear plants may be licensed, and existing plants close at the end of their current licence.",
      },
      {
        name: "Stricter Safety Licensing",
        explanation:
          "New plants face longer safety reviews and local referendums before they can be licensed.",
      },
      {
        name: "No Licensing Reform",
        explanation: "Nuclear plants are licensed under the existing rules.",
      },
      {
        name: "Streamlined Licensing",
        explanation:
          "Approved reactor designs are licensed once nationally, and site reviews must finish within three years.",
      },
      {
        name: "Small Reactor Fast Track",
        explanation:
          "Small modular reactors get a fast-track licence and state-backed loans for the first fleet.",
      },
      {
        name: "State Nuclear Build Programme",
        explanation:
          "The state guarantees the construction of a fleet of new reactors and licenses them on a fixed timetable.",
      },
    ],
  },
];

function costFor(law: ModernEraLaw, i: number): number {
  return law.gdpCostFractions?.[i] ?? 0;
}

function makeOptions(typeId: string, law: ModernEraLaw): LegislationPolicyOption[] {
  const directions = law.reformEnd === "right" ? RIGHT_REFORM : LEFT_REFORM;
  return law.options.map((copy, i) => ({
    id: `${typeId}_opt_${i}`,
    name: copy.name,
    explanation: copy.explanation,
    stance: STANCES[i],
    effectDirection: directions[i],
    economic: ECONOMIC[i],
    social: 0,
    ...(law.budgetLine ? { gdpCostFraction: costFor(law, i) } : {}),
  }));
}

function makeType(spec: ModernEraLegislatureSpec, law: ModernEraLaw): LegislationType {
  const typeId = `${spec.prefix}_${law.slug}`;
  return {
    _id: typeId,
    countryScope: spec.scope,
    name: law.name,
    description: law.description,
    explanation: law.explanation,
    policyDomain: law.policyDomain,
    subCategory: law.subCategory,
    nationalOnly: true,
    allowedScope: "national",
    ...(law.budgetLine ? { budgetCategory: spec.budgetCategories[law.budgetLine] } : {}),
    effectTarget: {
      metricCategoryId: law.effects[0].metricCategoryId,
      metricId: law.effects[0].metricId,
      scope: "national",
    },
    effectTargetsWeighted: law.effects.map((e) => ({ ...e })),
    ...(law.demographicEffects
      ? { demographicEffects: law.demographicEffects.map((e) => ({ ...e })) }
      : {}),
    positions: [
      {
        positionId: `${spec.prefix}_${law.slug}_chair`,
        name: `Chair, Committee on ${law.committee}`,
        chamber: spec.chamberKey,
      },
      {
        positionId: `${spec.prefix}_${law.slug}_ranking`,
        name: `Ranking Member, Committee on ${law.committee}`,
        chamber: spec.chamberKey,
      },
    ],
    policyOptions: makeOptions(typeId, law),
  };
}

export const modernEraLegislationTypes: LegislationType[] = MODERN_ERA_LEGISLATURE_SPECS.flatMap(
  (spec) => MODERN_ERA_LAWS.map((law) => makeType(spec, law))
);

export const MODERN_ERA_TYPE_IDS: readonly string[] = modernEraLegislationTypes.map((t) => t._id);

/** Era-catalog entries: each law's first fileable year. */
export const MODERN_ERA_LEGISLATION_ERA_ENTRIES: Record<string, number> = Object.fromEntries(
  MODERN_ERA_LEGISLATURE_SPECS.flatMap((spec) =>
    MODERN_ERA_LAWS.map((law) => [`${spec.prefix}_${law.slug}`, law.from])
  )
);

/** Cost classes: priced laws are gdpFraction, levies without a spending line are none. */
export const MODERN_ERA_COST_CLASSES: Record<string, "gdpFraction" | "none"> = Object.fromEntries(
  MODERN_ERA_LEGISLATURE_SPECS.flatMap((spec) =>
    MODERN_ERA_LAWS.map((law) => [
      `${spec.prefix}_${law.slug}`,
      law.budgetLine ? ("gdpFraction" as const) : ("none" as const),
    ])
  )
);
