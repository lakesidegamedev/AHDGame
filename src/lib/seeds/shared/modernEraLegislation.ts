import type {
  DemographicEffect,
  EffectTargetWeighted,
  LegislationPolicyOption,
  LegislationType,
} from "@/lib/db/types/legislation";

type CountryScope = NonNullable<LegislationType["countryScope"]>;
type ChamberKey = LegislationType["positions"][number]["chamber"];

/**
 * Law types that first become fileable in 2027, 2030, 2035, 2040, 2045 or 2050, generated
 * for every legacy-catalog legislature that runs the full simulation in a
 * modern world. A law with an `until` year stops taking new bills that year
 * (LEGISLATION_ERA_UNTIL); one already enacted stays in force.
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
type BudgetLine = "technology" | "housing" | "industry" | "security" | "welfare" | "environment";

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
      environment: "environment",
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
      environment: "environment",
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
      environment: "infrastructure",
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
      environment: "other",
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
  from: 2027 | 2030 | 2035 | 2040 | 2045 | 2050;
  /** First year no new bill may file the law; an enacted one stays in force. */
  until?: number;
  /** Slug of the law that takes over new filing when this one closes. */
  successor?: string;
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
    until: 2050,
    successor: "advanced_ai_oversight",
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
    until: 2045,
    successor: "digital_self_ownership",
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
    until: 2045,
    successor: "fossil_fuel_sunset",
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
    until: 2050,
    successor: "zero_carbon_economy",
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
    // The automation dividend replaces it for new bills from 2040.
    until: 2040,
    successor: "automation_dividend",
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
    until: 2050,
    successor: "lifelong_pension_account",
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
  // ── 2035 ──────────────────────────────────────────────────────────────────
  {
    slug: "climate_adaptation_fund",
    from: 2035,
    name: "Climate Adaptation Fund",
    description:
      "Pays for flood defences, cooler cities and water storage so the country can live with a hotter climate",
    explanation:
      "This act decides how much the state spends preparing for floods, droughts, fires and heatwaves that are now certain to come. A large fund protects towns, farms and infrastructure and cuts the damage each disaster does, but it is paid for by taxpayers and gives the state a bigger role in where and how things are built.",
    policyDomain: "environment",
    subCategory: "Climate adaptation",
    committee: "Energy and Environment",
    budgetLine: "environment",
    gdpCostFractions: [0.005, 0.0028, 0.0012, 0, 0, 0, 0],
    // Both targets are engine roots, not readouts of the environment channel.
    effects: [
      { metricCategoryId: "environment", metricId: "climateResilience", weight: 0.6 },
      { metricCategoryId: "environment", metricId: "naturalDisasterPreparedness", weight: 0.4 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.2 },
    ],
    demographicEffects: [{ dim: "age", bucket: "young", target: "economicLean", direction: 0.2 }],
    options: [
      {
        name: "Climate Ready Nation",
        explanation:
          "A long-term fund rebuilds roads, rail, power and homes to cope with the climate expected later in the century.",
      },
      {
        name: "National Defence Works",
        explanation:
          "The state builds sea walls, flood barriers and reservoirs to a national standard.",
      },
      {
        name: "Adaptation Grants",
        explanation:
          "A fund matches what regions and towns spend on flood defences and heat shelters.",
      },
      {
        name: "No Adaptation Fund",
        explanation: "Places protect themselves with the budgets they already have.",
      },
      {
        name: "Insurance-Led Adaptation",
        explanation:
          "Insurers price climate risk and owners pay to protect their own property. The state only publishes risk maps.",
      },
      {
        name: "Local Responsibility",
        explanation: "Adaptation is left to regions and towns, with no national money.",
      },
      {
        name: "Disaster Relief Only",
        explanation:
          "The state spends nothing on preparation and pays only for emergency relief after a disaster.",
      },
    ],
  },
  {
    slug: "managed_retreat",
    from: 2035,
    name: "Managed Retreat Programme",
    description: "Buys out homes on coasts and floodplains that can no longer be defended",
    explanation:
      "This act decides whether the state helps people leave land that floods again and again, and whether it can make them go. Moving out of harm's way saves lives and ends the cost of rebuilding after every flood, but homeowners lose value, old coastal and riverside towns empty out, and the buyouts cost taxpayers.",
    policyDomain: "housing",
    subCategory: "Climate relocation",
    committee: "Housing",
    budgetLine: "housing",
    gdpCostFractions: [0.004, 0.0025, 0.0012, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "environment", metricId: "naturalDisasterPreparedness", weight: 0.5 },
      { metricCategoryId: "environment", metricId: "climateResilience", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "propertyValueIndex", weight: -0.4 },
      { metricCategoryId: "economic", metricId: "ruralRevitalization", weight: -0.2 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.2 },
    ],
    demographicEffects: [
      { dim: "age", bucket: "senior", target: "economicLean", direction: -0.2 },
      { dim: "urbanization", bucket: "rural", target: "economicLean", direction: -0.2 },
    ],
    options: [
      {
        name: "Compulsory Retreat",
        explanation:
          "The state may require people to leave land it judges indefensible, paying less than the old market value.",
      },
      {
        name: "Planned Relocation",
        explanation:
          "Whole communities on failing coasts and floodplains are moved to new homes on safer ground at public cost.",
      },
      {
        name: "Voluntary Buyouts",
        explanation:
          "Owners of homes flooded again and again may sell them to the state, and new building on the worst land is banned.",
      },
      {
        name: "No Retreat Policy",
        explanation: "Owners rebuild after every flood under the existing rules.",
      },
      {
        name: "Rebuild in Place",
        explanation:
          "Flooded homes may be rebuilt on the same land if they are raised or flood-proofed.",
      },
      {
        name: "Owner's Right to Rebuild",
        explanation:
          "Owners may always rebuild on their own land, and planners may not refuse because of flood risk.",
      },
      {
        name: "Coastal Development Freedom",
        explanation:
          "Building is allowed on any coast or floodplain, and the state makes no buyout offers.",
      },
    ],
  },
  {
    slug: "basic_income_pilot",
    from: 2035,
    until: 2045,
    successor: "automation_dividend",
    name: "Universal Basic Income Pilot",
    description: "Tests paying a regular cash income with no conditions",
    explanation:
      "This act decides whether the state pays a regular income with no conditions to some or all adults as a trial. People in the pilot gain security and time, and spend more in their local economy, but the trial costs taxpayers and some people work fewer hours.",
    policyDomain: "labor",
    subCategory: "Basic income",
    committee: "Labour and Social Affairs",
    budgetLine: "welfare",
    gdpCostFractions: [0.005, 0.002, 0.0005, 0, 0, 0, 0],
    // Poverty and inequality relief arrives through the welfare spending
    // channel this law books to; targeting them directly would double count.
    effects: [
      { metricCategoryId: "social", metricId: "workLifeBalance", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "consumerConfidence", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "laborParticipation", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.2 },
    ],
    demographicEffects: [
      { dim: "income", bucket: "low", target: "economicLean", direction: 0.4 },
      { dim: "age", bucket: "young", target: "economicLean", direction: 0.2 },
    ],
    options: [
      {
        name: "National Basic Income Trial",
        explanation:
          "Every adult gets a modest basic income as a national trial, replacing some smaller benefits.",
      },
      {
        name: "Youth and Carer Income",
        explanation:
          "Every young adult and every unpaid carer gets a basic income with no conditions.",
      },
      {
        name: "Local Basic Income Trials",
        explanation: "A few towns pay a small monthly income to every adult for two years.",
      },
      {
        name: "No Basic Income Pilot",
        explanation: "Cash support comes only through means-tested benefits.",
      },
      {
        name: "Conditional Cash Trials",
        explanation: "Trials pay extra cash only to people who work or train.",
      },
      {
        name: "Work-First Benefits",
        explanation: "Benefits are tied more tightly to looking for and taking work.",
      },
      {
        name: "Basic Income Ban",
        explanation:
          "No public body may pay an unconditional income, and existing local trials end.",
      },
    ],
  },
  {
    slug: "gene_editing_regulation",
    from: 2035,
    name: "Gene Editing Regulation",
    description:
      "Sets which gene therapies may be licensed and whether human embryos may be edited",
    explanation:
      "This act decides how the state licenses and pays for editing human genes. A licensed and funded system brings cures for inherited diseases to patients safely and keeps public trust, but costs money and slows research with rules. Light rules let private clinics move fast, with more risk and less public confidence.",
    policyDomain: "technology",
    subCategory: "Biotechnology",
    committee: "Health",
    budgetLine: "technology",
    gdpCostFractions: [0.0012, 0.0006, 0.0002, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "healthcare", metricId: "lifeExpectancy", weight: 0.3 },
      { metricCategoryId: "governance", metricId: "publicTrust", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "regulatoryBurden", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "rdIntensity", weight: -0.15 },
    ],
    options: [
      {
        name: "Public Gene Medicine Service",
        explanation:
          "Licensed gene therapies are free through public health care, and a national regulator runs every trial. Editing embryos for birth is banned.",
      },
      {
        name: "Licensed Gene Therapies",
        explanation:
          "Gene therapies for serious inherited diseases may be licensed and prescribed under strict oversight.",
      },
      {
        name: "Research Licences",
        explanation:
          "Laboratories may edit human cells under licence, and editing embryos for birth is banned.",
      },
      {
        name: "No Gene Editing Statute",
        explanation: "Gene editing falls under general medicines law.",
      },
      {
        name: "Light-Touch Approval",
        explanation: "Gene therapies are approved on the same fast track as ordinary medicines.",
      },
      {
        name: "Open Biotech Market",
        explanation:
          "Private clinics may offer gene therapies once safety data is published, with no state licence.",
      },
      {
        name: "Biotech Freedom Act",
        explanation:
          "Gene editing needs no licence, including on embryos, and regulators may not add new rules.",
      },
    ],
  },
  {
    slug: "space_traffic_act",
    from: 2035,
    name: "Space Traffic Act",
    description: "Tracks satellites and debris and sets rules for crowded orbits",
    explanation:
      "This act decides how the state manages the satellites and debris crowding the orbits that internet, navigation and defence depend on. Strong rules keep services running and protect military satellites, but cost a regulator and add duties for launch firms.",
    policyDomain: "technology",
    subCategory: "Space",
    committee: "Digital Affairs",
    budgetLine: "technology",
    gdpCostFractions: [0.001, 0.0006, 0.0003, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "infrastructure", metricId: "broadbandAccess", weight: 0.3 },
      { metricCategoryId: "governance", metricId: "militaryReadiness", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "regulatoryBurden", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "investorConfidence", weight: -0.15 },
    ],
    options: [
      {
        name: "Orbital Clean-Up Duty",
        explanation:
          "Operators pay into a fund that removes old debris, and the armed forces may clear threats to key satellites.",
      },
      {
        name: "Orbital Traffic Control",
        explanation:
          "A regulator assigns orbits, can order manoeuvres and fines operators who leave debris behind.",
      },
      {
        name: "Debris Rules",
        explanation: "Every new satellite must carry a plan to leave orbit at the end of its life.",
      },
      {
        name: "No Space Traffic Law",
        explanation:
          "Operators launch under old licensing rules, and nobody manages crowded orbits.",
      },
      {
        name: "Industry Space Codes",
        explanation: "Operators agree their own codes for sharing orbits, endorsed by the state.",
      },
      {
        name: "Open Launch Licensing",
        explanation: "Launch licences are granted quickly with only basic safety checks.",
      },
      {
        name: "Space Deregulation Act",
        explanation:
          "Launches need no licence beyond flight safety, and operators carry no debris duties.",
      },
    ],
  },
  // ── 2040 ──────────────────────────────────────────────────────────────────
  {
    slug: "automation_dividend",
    from: 2040,
    name: "Automation Dividend",
    description: "Taxes the output of machines and software and pays it back to every resident",
    explanation:
      "This act decides whether a levy on automated output is paid back to every resident as a regular dividend. Households share in the wealth machines create and inequality narrows, but the firms that automate pay, and investors grow wary. From the year this act opens it replaces the automation tax for new bills. The levy and the dividend are regulatory here: they do not yet appear as separate budget lines.",
    policyDomain: "economic",
    subCategory: "Automation",
    committee: "Economic Affairs",
    effects: [
      { metricCategoryId: "social", metricId: "incomeInequality", weight: 0.4 },
      { metricCategoryId: "economic", metricId: "consumerConfidence", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "investorConfidence", weight: -0.3 },
      { metricCategoryId: "governance", metricId: "roboticsAdoption", weight: -0.2 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.2 },
    ],
    demographicEffects: [
      { dim: "income", bucket: "low", target: "economicLean", direction: 0.4 },
      { dim: "income", bucket: "high", target: "economicLean", direction: -0.3 },
    ],
    options: [
      {
        name: "Full Automation Dividend",
        explanation:
          "A heavy levy on automated output pays a dividend large enough to live on for many households.",
      },
      {
        name: "Citizens Share",
        explanation:
          "Every resident holds a share in a national automation fund that pays a dividend every quarter.",
      },
      {
        name: "Shared Gains Dividend",
        explanation: "A small levy on automated output is paid out as an annual dividend.",
      },
      {
        name: "No Automation Dividend",
        explanation: "The gains from automation go to the firms that own the machines.",
      },
      {
        name: "Voluntary Profit Sharing",
        explanation: "Firms that share automation profits with staff get a small tax relief.",
      },
      {
        name: "Employee Share Incentives",
        explanation:
          "Workers may buy shares in their employer on generous tax terms instead of a dividend.",
      },
      {
        name: "Automation Ownership Freedom",
        explanation:
          "Automated output may never be taxed as a separate base, and any automation levy is repealed.",
      },
    ],
  },
  {
    slug: "four_day_week",
    from: 2040,
    name: "Four-Day Work Week",
    description: "Sets whether the standard working week shrinks to four days on full pay",
    explanation:
      "This act decides the length of the standard working week. A four-day week on full pay gives workers and families more time and better health, but employers pay for the lost hours, and small firms feel it most.",
    policyDomain: "labor",
    subCategory: "Working time",
    committee: "Labour and Social Affairs",
    effects: [
      { metricCategoryId: "social", metricId: "workLifeBalance", weight: 0.6 },
      { metricCategoryId: "population", metricId: "birthRate", weight: 0.2 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "smallBusinessFormation", weight: -0.25 },
    ],
    demographicEffects: [
      { dim: "age", bucket: "young", target: "economicLean", direction: 0.3 },
      { dim: "income", bucket: "low", target: "economicLean", direction: 0.2 },
    ],
    options: [
      {
        name: "Four-Day Week Mandate",
        explanation:
          "A four-day week on full pay is the legal standard for every employer, enforced by inspectors.",
      },
      {
        name: "Thirty-Two Hour Standard",
        explanation:
          "Overtime pay starts after thirty-two hours a week, so most employers move to four days.",
      },
      {
        name: "Right to Request",
        explanation:
          "Workers may ask for a four-day week, and employers must give a reason to refuse.",
      },
      {
        name: "No Working Week Law",
        explanation: "The working week is whatever employers and workers agree under existing law.",
      },
      {
        name: "Flexible Hours Opt-Outs",
        explanation: "Workers may sign away limits on their weekly hours.",
      },
      {
        name: "Longer Hours Freedom",
        explanation: "Weekly hour limits are relaxed and overtime pay starts later.",
      },
      {
        name: "Working Time Deregulation",
        explanation: "Statutory limits on weekly working hours are repealed.",
      },
    ],
  },
  {
    slug: "digital_currency_legal_tender",
    from: 2040,
    name: "Digital Currency Legal Tender Act",
    description: "Sets whether a central bank digital currency is legal tender alongside cash",
    explanation:
      "This act decides whether the central bank issues a digital currency that every shop must accept. Digital money makes payments cheaper and harder to hide from tax and corruption, but every payment leaves a record the state can see, and banks lose deposits.",
    policyDomain: "technology",
    subCategory: "Digital money",
    committee: "Economic Affairs",
    budgetLine: "technology",
    gdpCostFractions: [0.0006, 0.0004, 0.0002, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "governance", metricId: "corruptionIndex", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "tradeGrowth", weight: 0.2 },
      { metricCategoryId: "governance", metricId: "civilLiberties", weight: -0.4 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.2 },
    ],
    options: [
      {
        name: "Cashless Digital Currency",
        explanation:
          "Digital currency becomes the main form of money, cash is phased out, and every payment leaves a record.",
      },
      {
        name: "Digital Legal Tender",
        explanation:
          "Digital currency is legal tender alongside cash, and every shop must accept it.",
      },
      {
        name: "Retail Digital Pilot",
        explanation:
          "Households may hold a capped amount of digital currency in a central bank wallet.",
      },
      {
        name: "No Digital Currency",
        explanation:
          "Money is cash and bank deposits. The central bank issues no digital currency.",
      },
      {
        name: "Cash Guarantee",
        explanation:
          "Shops must keep accepting cash, and the central bank studies digital money only.",
      },
      {
        name: "Private Stablecoin Licensing",
        explanation:
          "Licensed private firms may issue digital money backed by reserves, and the state issues none.",
      },
      {
        name: "Digital Currency Ban",
        explanation: "The central bank is barred from issuing any digital currency to the public.",
      },
    ],
  },
  {
    slug: "sovereign_wealth_fund_mandate",
    from: 2040,
    name: "Sovereign Wealth Fund Mandate",
    description: "Sets up a national investment fund paid into from the budget",
    explanation:
      "This act decides whether the state builds a national investment fund and what it may buy. A large fund backs strategic industry and research and leaves future generations an asset, but taxpayers pay in today and private investors face a state rival. The fund's returns are not yet booked as a separate budget line.",
    policyDomain: "economic",
    subCategory: "Public investment",
    committee: "Economic Affairs",
    budgetLine: "industry",
    gdpCostFractions: [0.005, 0.003, 0.0012, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "economic", metricId: "manufacturingCompetitiveness", weight: 0.4 },
      { metricCategoryId: "economic", metricId: "rdIntensity", weight: 0.2 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "smallBusinessFormation", weight: -0.15 },
    ],
    options: [
      {
        name: "National Ownership Fund",
        explanation:
          "The fund takes large stakes in major companies and pays a share of its returns into the budget.",
      },
      {
        name: "Strategic Investment Fund",
        explanation:
          "The fund is paid into every year and backs domestic industries the state judges strategic.",
      },
      {
        name: "Seed Wealth Fund",
        explanation: "A small fund invests windfall revenue and reports its returns each year.",
      },
      {
        name: "No Wealth Fund",
        explanation: "The state owns no investment fund.",
      },
      {
        name: "Debt Repayment Rule",
        explanation: "Any budget surplus must go to paying down public debt instead of investing.",
      },
      {
        name: "Surplus Tax Rebates",
        explanation: "Any budget surplus is returned to taxpayers as a rebate.",
      },
      {
        name: "State Holdings Sell-Off",
        explanation:
          "Any state investment holdings are sold, and the state is barred from building new ones.",
      },
    ],
  },
  // ── 2045 ──────────────────────────────────────────────────────────────────
  {
    slug: "longevity_care_act",
    from: 2045,
    name: "Longevity Care Act",
    description: "Sets how the state pays for care in a very long old age",
    explanation:
      "This act decides who pays for care in the last decades of life, when many people live past ninety. A public care system gives older people good care and eases the load on families, but it costs taxpayers and employers. Leaving care to families and private insurance costs the state little, but the cost lands on children and on the oldest and poorest.",
    policyDomain: "healthcare",
    subCategory: "Elder care",
    committee: "Health",
    budgetLine: "welfare",
    gdpCostFractions: [0.005, 0.003, 0.0013, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "healthcare", metricId: "elderCareQuality", weight: 0.4 },
      { metricCategoryId: "healthcare", metricId: "lifeExpectancy", weight: 0.25 },
      { metricCategoryId: "economic", metricId: "laborParticipation", weight: -0.2 },
      { metricCategoryId: "economic", metricId: "investorConfidence", weight: -0.15 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.15 },
    ],
    demographicEffects: [{ dim: "age", bucket: "senior", target: "economicLean", direction: 0.3 }],
    options: [
      {
        name: "Universal Long-Term Care",
        explanation:
          "Care at home and in care homes is free for everyone who needs it, paid for from general taxes.",
      },
      {
        name: "Care Insurance for All",
        explanation:
          "Everyone pays into a national care insurance fund that covers most of the cost of care.",
      },
      {
        name: "Means-Tested Care Cap",
        explanation:
          "The state caps what any person pays for care in a lifetime and pays the rest for people with little savings.",
      },
      {
        name: "No Care Statute",
        explanation: "Care is paid for under existing health and welfare rules.",
      },
      {
        name: "Family Care Allowances",
        explanation: "Families who care for an older relative at home get a small tax allowance.",
      },
      {
        name: "Private Care Insurance",
        explanation: "People buy their own care insurance, and the state sets only minimum terms.",
      },
      {
        name: "Care Market Freedom",
        explanation: "The state pays for no long-term care, and care homes set their own prices.",
      },
    ],
  },
  {
    slug: "fossil_fuel_sunset",
    from: 2045,
    name: "Fossil Fuel Sunset Act",
    description: "Sets a date after which fossil fuels may no longer be burned for power and heat",
    explanation:
      "This act decides whether the country sets a final date for burning coal, oil and gas for electricity and heating. A hard date ends most carbon emissions and pushes clean power to finish the job, but bills rise for households and firms that depend on fossil fuels. From the year this act opens it replaces the coal power phase-out for new bills.",
    policyDomain: "environment",
    subCategory: "Fossil fuels",
    committee: "Environment and Energy",
    budgetLine: "environment",
    gdpCostFractions: [0.004, 0.0025, 0.001, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "environment", metricId: "carbonEmissions", weight: 0.4 },
      { metricCategoryId: "environment", metricId: "energyTransitionProgress", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "costOfLiving", weight: -0.25 },
      { metricCategoryId: "economic", metricId: "manufacturingCompetitiveness", weight: -0.15 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.15 },
    ],
    options: [
      {
        name: "Immediate Fossil Ban",
        explanation:
          "Burning fossil fuels for power and heat is banned within a few years, with a state fund helping households switch.",
      },
      {
        name: "Fixed Sunset Date",
        explanation:
          "A fixed date ends fossil fuel use for power and heat, with help for affected workers and regions.",
      },
      {
        name: "Declining Fossil Quota",
        explanation: "Each year the amount of fossil fuel that may be burned for power falls.",
      },
      {
        name: "No Sunset Statute",
        explanation: "Fossil fuels fall under existing climate and energy law.",
      },
      {
        name: "Gas Bridge Rule",
        explanation: "Gas plants may keep running as backup with no end date.",
      },
      {
        name: "Fossil Capacity Guarantee",
        explanation:
          "The state guarantees enough fossil backup capacity to keep power on at all times.",
      },
      {
        name: "Fuel Freedom Act",
        explanation: "No public body may set a closing date for any power plant or heating fuel.",
      },
    ],
  },
  {
    slug: "digital_self_ownership",
    from: 2045,
    name: "Digital Self-Ownership Act",
    description: "Gives people ownership of their data, identity and likeness online",
    explanation:
      "This act decides whether people own their personal data, their digital identity and their image and voice, and can move or withdraw them at will. Strong ownership protects people from tracking and from fake copies of themselves, but it burdens firms that build services on data. From the year this act opens it replaces the data protection overhaul for new bills.",
    policyDomain: "technology",
    subCategory: "Digital rights",
    committee: "Digital Affairs",
    budgetLine: "technology",
    gdpCostFractions: [0.0008, 0.0005, 0.0002, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "governance", metricId: "civilLiberties", weight: 0.4 },
      { metricCategoryId: "governance", metricId: "publicTrust", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "rdIntensity", weight: -0.25 },
      { metricCategoryId: "economic", metricId: "investorConfidence", weight: -0.15 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.15 },
    ],
    demographicEffects: [{ dim: "age", bucket: "young", target: "socialLean", direction: 0.2 }],
    options: [
      {
        name: "Personal Data Ownership",
        explanation:
          "Every person owns their data, face and voice. Firms need paid consent to use them and must delete them on request.",
      },
      {
        name: "Portable Digital Identity",
        explanation:
          "Each person holds a digital identity they control and can carry from one service to another.",
      },
      {
        name: "Likeness Protection",
        explanation:
          "Faking a person's face or voice without consent is a civil and criminal wrong.",
      },
      {
        name: "No Ownership Statute",
        explanation: "Personal data is covered by existing data protection and privacy law.",
      },
      {
        name: "Consent Through Terms",
        explanation: "Firms may use data on the terms people accept when they sign up.",
      },
      {
        name: "Data Licensing Market",
        explanation: "People may sell the right to use their data, and firms trade it freely.",
      },
      {
        name: "Data Freedom Act",
        explanation: "No rule may limit how firms collect or share data that people made public.",
      },
    ],
  },
  {
    slug: "water_security_act",
    from: 2045,
    name: "Water Security Act",
    description: "Plans for droughts, floods and shrinking water supplies",
    explanation:
      "This act decides how the state secures drinking and farm water as rainfall becomes less reliable. A national plan builds storage, repairs leaking pipes and protects rivers, so towns and farms keep water in dry years, but bills rise and projects take land. Leaving water to local suppliers costs less now and leaves the country exposed in a long drought.",
    policyDomain: "environment",
    subCategory: "Water",
    committee: "Environment and Energy",
    budgetLine: "environment",
    gdpCostFractions: [0.005, 0.003, 0.0012, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "environment", metricId: "climateResilience", weight: 0.35 },
      { metricCategoryId: "environment", metricId: "naturalDisasterPreparedness", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "costOfLiving", weight: -0.2 },
      { metricCategoryId: "economic", metricId: "propertyValueIndex", weight: -0.1 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.15 },
    ],
    options: [
      {
        name: "National Water Grid",
        explanation:
          "The state builds reservoirs, recycling plants and a national grid that moves water between regions.",
      },
      {
        name: "River Basin Authorities",
        explanation:
          "Regional authorities plan water for each river basin and may order cuts in a drought.",
      },
      {
        name: "Leakage and Reuse Targets",
        explanation: "Suppliers must cut leaks and reuse more water by set dates.",
      },
      {
        name: "No Water Statute",
        explanation: "Water follows existing utility and environment law.",
      },
      {
        name: "Tradable Water Rights",
        explanation: "Farms and firms may buy and sell their water allowances.",
      },
      {
        name: "Supplier Self-Regulation",
        explanation: "Water companies set their own drought plans and report them yearly.",
      },
      {
        name: "Water Market Freedom",
        explanation: "Water is priced by the market, and the state sets no supply targets.",
      },
    ],
  },
  // ── 2050 ──────────────────────────────────────────────────────────────────
  {
    slug: "advanced_ai_oversight",
    from: 2050,
    name: "Advanced AI Oversight Act",
    description: "Sets rules for the most capable AI systems",
    explanation:
      "This act decides how the state oversees AI systems that can plan and act on their own. A strong regulator tests the most capable systems before release and can switch them off, which protects trust and security, but it slows research and drives some firms away. From the year this act opens it replaces the AI liability act for new bills.",
    policyDomain: "technology",
    subCategory: "Artificial intelligence",
    committee: "Digital Affairs",
    budgetLine: "technology",
    gdpCostFractions: [0.0015, 0.0009, 0.0004, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "governance", metricId: "publicTrust", weight: 0.35 },
      { metricCategoryId: "governance", metricId: "militaryReadiness", weight: 0.25 },
      { metricCategoryId: "economic", metricId: "rdIntensity", weight: -0.3 },
      { metricCategoryId: "economic", metricId: "investorConfidence", weight: -0.15 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.15 },
    ],
    options: [
      {
        name: "Public AI Safety Authority",
        explanation:
          "A national authority tests every highly capable system before release and may order it shut down.",
      },
      {
        name: "Mandatory Safety Testing",
        explanation:
          "Developers of highly capable systems must pass independent safety tests before release.",
      },
      {
        name: "Incident Reporting",
        explanation: "Developers must report serious failures of capable systems within days.",
      },
      {
        name: "No Oversight Statute",
        explanation: "Capable AI systems are covered by general liability and consumer law.",
      },
      {
        name: "Voluntary Safety Pledges",
        explanation:
          "Developers publish their own safety commitments, backed by state endorsement.",
      },
      {
        name: "Open Research Licence",
        explanation:
          "AI research is free of state testing, and the state only reviews completed harm.",
      },
      {
        name: "AI Freedom Act",
        explanation:
          "No public body may test, license or restrict an AI system before it causes harm.",
      },
    ],
  },
  {
    slug: "lifelong_pension_account",
    from: 2050,
    name: "Lifelong Pension Account Act",
    description:
      "Replaces a fixed retirement age with a personal account that people draw on when they choose",
    explanation:
      "This act decides whether pensions are built around a personal account that every worker carries for life and can start drawing from at an age they choose. Flexible retirement suits people who live and work much longer, and a funded account is more secure for the young, but the state tops up the accounts of low earners, and some workers retire poorer. From the year this act opens it replaces pension age indexation for new bills.",
    policyDomain: "social",
    subCategory: "Pensions",
    committee: "Labour and Social Affairs",
    budgetLine: "welfare",
    gdpCostFractions: [0.005, 0.003, 0.0012, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "healthcare", metricId: "elderCareQuality", weight: 0.35 },
      { metricCategoryId: "economic", metricId: "consumerConfidence", weight: 0.25 },
      { metricCategoryId: "economic", metricId: "laborParticipation", weight: -0.2 },
      { metricCategoryId: "economic", metricId: "investorConfidence", weight: -0.15 },
    ],
    demographicEffects: [
      { dim: "income", bucket: "low", target: "economicLean", direction: 0.3 },
      { dim: "age", bucket: "young", target: "economicLean", direction: 0.2 },
    ],
    options: [
      {
        name: "Guaranteed Lifelong Account",
        explanation:
          "Every worker gets a state-backed account with a guaranteed minimum, drawn at any age from sixty on.",
      },
      {
        name: "Topped-Up Personal Account",
        explanation: "The state adds to the accounts of low earners and carers every year.",
      },
      {
        name: "Flexible Retirement Window",
        explanation:
          "Workers may retire within a wide age window, with a smaller pension if they leave early.",
      },
      {
        name: "No Pension Account Statute",
        explanation: "Pensions follow the existing retirement age and funding rules.",
      },
      {
        name: "Opt-In Personal Accounts",
        explanation: "Workers may pay part of their pension tax into a private account.",
      },
      {
        name: "Private Pension Choice",
        explanation:
          "Workers choose between the state pension and a private account, with no top-ups.",
      },
      {
        name: "Pension Privatisation",
        explanation:
          "The state pension is replaced by compulsory private accounts with no guarantee.",
      },
    ],
  },
  {
    slug: "zero_carbon_economy",
    from: 2050,
    name: "Zero Carbon Economy Act",
    description: "Makes net zero emissions a legal limit for the whole economy",
    explanation:
      "This act decides whether the last emissions from industry, transport, farming and buildings are capped by law. A binding zero limit finishes the energy transition and cleans the air, but it adds cost to nearly everything. From the year this act opens it replaces the clean power standard for new bills.",
    policyDomain: "environment",
    subCategory: "Climate",
    committee: "Environment and Energy",
    budgetLine: "environment",
    gdpCostFractions: [0.005, 0.003, 0.0013, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "environment", metricId: "carbonEmissions", weight: 0.4 },
      { metricCategoryId: "environment", metricId: "energyTransitionProgress", weight: 0.3 },
      { metricCategoryId: "economic", metricId: "costOfLiving", weight: -0.25 },
      { metricCategoryId: "economic", metricId: "manufacturingCompetitiveness", weight: -0.2 },
      { metricCategoryId: "economic", metricId: "economicFreedom", weight: -0.15 },
    ],
    options: [
      {
        name: "Binding Zero Limit",
        explanation:
          "A legal limit of zero net emissions applies to every sector, with fines on firms that miss it.",
      },
      {
        name: "Sector Carbon Budgets",
        explanation: "Each sector gets a falling carbon budget that reaches zero by a fixed date.",
      },
      {
        name: "Transition Grants",
        explanation: "The state pays firms and farms to clean up their last emissions.",
      },
      {
        name: "No Zero Carbon Statute",
        explanation: "Emissions follow existing climate law.",
      },
      {
        name: "Net Zero Aspiration",
        explanation: "The state states a goal of net zero but sets no limit.",
      },
      {
        name: "Offset Market Rule",
        explanation: "Firms may meet any target by buying carbon offsets at home or abroad.",
      },
      {
        name: "Emissions Cap Ban",
        explanation: "No public body may set a legal limit on emissions from the whole economy.",
      },
    ],
  },
  {
    slug: "space_resources_act",
    from: 2050,
    name: "Space Resources Act",
    description: "Sets who may mine the Moon and asteroids and who owns what they bring back",
    explanation:
      "This act decides whether firms and the state may mine the Moon and asteroids and who owns the metals and water they bring back. A licensing system opens a new industry and secures supplies of rare metals, but it costs a regulator and risks disputes with other powers. Leaving space mining unregulated is cheap now and invites conflict later.",
    policyDomain: "technology",
    subCategory: "Space",
    committee: "Digital Affairs",
    budgetLine: "technology",
    gdpCostFractions: [0.003, 0.0018, 0.0008, 0, 0, 0, 0],
    effects: [
      { metricCategoryId: "economic", metricId: "rdIntensity", weight: 0.35 },
      { metricCategoryId: "economic", metricId: "tradeGrowth", weight: 0.25 },
      { metricCategoryId: "economic", metricId: "regulatoryBurden", weight: -0.25 },
      { metricCategoryId: "governance", metricId: "publicTrust", weight: -0.1 },
    ],
    options: [
      {
        name: "State Space Mining Corporation",
        explanation:
          "A state corporation mines the Moon and asteroids and sells what it brings back.",
      },
      {
        name: "Licensed Public Partnerships",
        explanation:
          "Firms mine under state licence and share part of their output with a public fund.",
      },
      {
        name: "Claims Registry",
        explanation:
          "Firms may register claims to mine and keep what they bring back, with safety duties.",
      },
      {
        name: "No Space Mining Statute",
        explanation: "Space mining falls under general space and trade law.",
      },
      {
        name: "Treaty-Only Approach",
        explanation:
          "The state allows mining only under international agreements still to be made.",
      },
      {
        name: "Open Space Claims",
        explanation: "Firms may claim and sell space resources with basic safety checks.",
      },
      {
        name: "Space Mining Freedom",
        explanation:
          "Space mining is unregulated, and the state takes no share and sets no duties.",
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

/** Filing close years (LEGISLATION_ERA_UNTIL entries) for laws a later one replaces. */
export const MODERN_ERA_LEGISLATION_UNTIL_ENTRIES: Record<string, number> = Object.fromEntries(
  MODERN_ERA_LEGISLATURE_SPECS.flatMap((spec) =>
    MODERN_ERA_LAWS.filter((law) => law.until !== undefined).map((law) => [
      `${spec.prefix}_${law.slug}`,
      law.until!,
    ])
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
