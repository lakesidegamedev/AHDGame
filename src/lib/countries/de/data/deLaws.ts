/**
 * Germany's political-legislation book: 63 primary laws (one per political
 * metric), 41 secondary laws and 6 tax laws. Topology and cost terms live in
 * deLawStructure.ts, prose in the deLawText* modules; this file joins them and
 * fails loudly at import time if a row has no text or a text has no row.
 */

import type { PoliticalLaw, LawLevel } from "@/lib/politicalLegislation/types";
import type { PoliticalMetricCategoryId } from "@/lib/politicalMetrics/types";
import { DE_LAW_STRUCTURE, type DeLevelCost } from "./deLawStructure";
import type { DeLawText } from "./deLawTextTypes";
import { DE_LAW_TEXT_DEFENSE } from "./deLawTextDefense";
import { DE_LAW_TEXT_ECONOMY } from "./deLawTextEconomy";
import { DE_LAW_TEXT_EDUCATION } from "./deLawTextEducation";
import { DE_LAW_TEXT_ENVIRONMENT } from "./deLawTextEnvironment";
import { DE_LAW_TEXT_GOVERNANCE } from "./deLawTextGovernance";
import { DE_LAW_TEXT_HEALTH } from "./deLawTextHealth";
import { DE_LAW_TEXT_INFRASTRUCTURE } from "./deLawTextInfrastructure";
import { DE_LAW_TEXT_ORDER } from "./deLawTextOrder";
import { DE_LAW_TEXT_SOCIETY } from "./deLawTextSociety";

const DE_LAW_TEXT: Record<string, DeLawText> = {
  ...DE_LAW_TEXT_ECONOMY,
  ...DE_LAW_TEXT_EDUCATION,
  ...DE_LAW_TEXT_HEALTH,
  ...DE_LAW_TEXT_INFRASTRUCTURE,
  ...DE_LAW_TEXT_ORDER,
  ...DE_LAW_TEXT_ENVIRONMENT,
  ...DE_LAW_TEXT_SOCIETY,
  ...DE_LAW_TEXT_GOVERNANCE,
  ...DE_LAW_TEXT_DEFENSE,
};

function level(name: string, description: string, cost?: DeLevelCost): LawLevel {
  const out: LawLevel = { name, description };
  if (cost?.g !== undefined) out.gdpCostFraction = cost.g;
  if (cost?.i !== undefined) out.incomeCostFraction = cost.i;
  if (cost?.r !== undefined) out.gdpRevenueFraction = cost.r;
  return out;
}

function tax(
  slug: string,
  title: string,
  description: string,
  taxType: string,
  minRate: number,
  maxRate: number,
  step: number,
  baselineRate: number,
  waypoints: Array<[number, string]>
): PoliticalLaw {
  return {
    id: `de.tax.${slug}`,
    countryId: "DE",
    kind: "tax",
    targets: [],
    taxPolicy: {
      scope: "federal",
      taxType,
      minRate,
      maxRate,
      step,
      baselineRate,
      waypoints: waypoints.map(([rate, label]) => ({ rate, label })),
    },
    title,
    description,
    category: "economy",
    allowedScope: "national",
  };
}

const DE_TAX_LAWS: PoliticalLaw[] = [
  tax(
    "incomeTax",
    "Income Tax and Solidarity Surcharge Act",
    "The progressive income tax and its surcharge, the federal budget's backbone.",
    "incomeTax",
    0,
    60,
    1,
    38,
    [
      [0, "No Income Taxation"],
      [12, "Flat Minimal Schedule"],
      [25, "Moderate Schedule"],
      [38, "Progressive Schedule with Surcharge"],
      [48, "Elevated Top Rate"],
      [56, "Confiscatory Schedule"],
    ]
  ),
  tax(
    "domesticCorporateTax",
    "Corporation and Trade Tax Act",
    "The levy on domestic company profits, federal and municipal.",
    "domesticCorporateTax",
    0,
    60,
    1,
    30,
    [
      [0, "No Profits Levy"],
      [15, "Light Corporate Levy"],
      [30, "Corporation and Trade Tax"],
      [42, "Heavy Corporate Levy"],
      [54, "Confiscatory Levy"],
    ]
  ),
  tax(
    "foreignCorporateTax",
    "Foreign Company Levy Act",
    "The levy on profits earned in the country by foreign owned firms.",
    "foreignCorporateTax",
    0,
    65,
    1,
    30,
    [
      [0, "Exempt Foreign Enterprise"],
      [15, "Treaty Rate"],
      [30, "Parity with Domestic Firms"],
      [45, "Surcharge on Foreign Firms"],
      [58, "Punitive Levy"],
    ]
  ),
  tax(
    "payrollTax",
    "Social Contributions Act",
    "Employer and employee contributions funding the social insurance system.",
    "payrollTax",
    0,
    20,
    0.2,
    12,
    [
      [0, "No Contributions"],
      [4, "Foundation Contributions"],
      [8, "Standard Contributions"],
      [12, "Full Contribution System"],
      [17, "Very High Contributions"],
    ]
  ),
  tax(
    "salesTax",
    "Value Added Tax Act",
    "The consumption tax on goods and services.",
    "salesTax",
    0,
    30,
    1,
    19,
    [
      [0, "No Consumption Tax"],
      [7, "Reduced Rate Only"],
      [13, "Low Standard Rate"],
      [19, "Standard Rate"],
      [25, "High Standard Rate"],
    ]
  ),
  tax(
    "tariffs",
    "Customs Duties Act",
    "Duties on goods entering the country from outside the customs union.",
    "tariffs",
    0,
    25,
    0.5,
    0,
    [
      [0, "Customs Union Schedule"],
      [4, "Revenue Duties"],
      [10, "Protective Duties"],
      [18, "Heavy Protection"],
    ]
  ),
];

function program(row: (typeof DE_LAW_STRUCTURE)[number]): PoliticalLaw {
  const [slug, kind, category, scope, budgetKeyOverride, targets, costs] = row;
  const text = DE_LAW_TEXT[slug];
  if (!text) throw new Error(`de law ${slug}: no text`);
  const [title, description, baselineLevel, levels] = text;
  const law: PoliticalLaw = {
    id: `de.${slug}`,
    countryId: "DE",
    kind,
    targets: targets.map(([metricId, weight]) => ({ metricId, weight })),
    title,
    description,
    category: category as PoliticalMetricCategoryId,
    allowedScope: scope,
    baselineLevel,
    levels: [
      level(levels[0][0], levels[0][1]),
      level(levels[1][0], levels[1][1], costs[0]),
      level(levels[2][0], levels[2][1], costs[1]),
      level(levels[3][0], levels[3][1], costs[2]),
      level(levels[4][0], levels[4][1], costs[3]),
    ],
  };
  if (budgetKeyOverride) law.budgetKeyOverride = budgetKeyOverride;
  return law;
}

const structureSlugs = new Set(DE_LAW_STRUCTURE.map((row) => row[0]));
for (const slug of Object.keys(DE_LAW_TEXT)) {
  if (!structureSlugs.has(slug)) throw new Error(`de law text ${slug}: no structure row`);
}

/**
 * Primary ids follow the "{cc}.{metricId}.primary" convention, so the metric id
 * is the slug minus its suffix; secondaries are "{cc}.sec.{slug}".
 */
export const DE_LAWS: PoliticalLaw[] = [...DE_TAX_LAWS, ...DE_LAW_STRUCTURE.map(program)];
