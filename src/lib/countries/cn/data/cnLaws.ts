/**
 * China's political-legislation book: 63 primary laws (one per political
 * metric), 41 secondary laws and 6 tax laws. Topology and cost terms live in
 * deLawStructure.ts, prose in the deLawText* modules; this file joins them and
 * fails loudly at import time if a row has no text or a text has no row.
 */

import type { PoliticalLaw, LawLevel } from "@/lib/politicalLegislation/types";
import type { PoliticalMetricCategoryId } from "@/lib/politicalMetrics/types";
import { CN_LAW_STRUCTURE, type CnLevelCost } from "./cnLawStructure";
import type { CnLawText } from "./cnLawTextTypes";
import { CN_LAW_TEXT_DEFENSE } from "./cnLawTextDefense";
import { CN_LAW_TEXT_ECONOMY } from "./cnLawTextEconomy";
import { CN_LAW_TEXT_EDUCATION } from "./cnLawTextEducation";
import { CN_LAW_TEXT_ENVIRONMENT } from "./cnLawTextEnvironment";
import { CN_LAW_TEXT_GOVERNANCE } from "./cnLawTextGovernance";
import { CN_LAW_TEXT_HEALTH } from "./cnLawTextHealth";
import { CN_LAW_TEXT_INFRASTRUCTURE } from "./cnLawTextInfrastructure";
import { CN_LAW_TEXT_ORDER } from "./cnLawTextOrder";
import { CN_LAW_TEXT_SOCIETY } from "./cnLawTextSociety";

const CN_LAW_TEXT: Record<string, CnLawText> = {
  ...CN_LAW_TEXT_ECONOMY,
  ...CN_LAW_TEXT_EDUCATION,
  ...CN_LAW_TEXT_HEALTH,
  ...CN_LAW_TEXT_INFRASTRUCTURE,
  ...CN_LAW_TEXT_ORDER,
  ...CN_LAW_TEXT_ENVIRONMENT,
  ...CN_LAW_TEXT_SOCIETY,
  ...CN_LAW_TEXT_GOVERNANCE,
  ...CN_LAW_TEXT_DEFENSE,
};

function level(name: string, description: string, cost?: CnLevelCost): LawLevel {
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
    id: `cn.tax.${slug}`,
    countryId: "CN",
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

const CN_TAX_LAWS: PoliticalLaw[] = [
  tax(
    "incomeTax",
    "Individual Income Tax Act",
    "The progressive tax on wages and other personal income.",
    "incomeTax",
    0,
    60,
    1,
    20,
    [
      [0, "No Income Taxation"],
      [8, "Flat Minimal Schedule"],
      [20, "Progressive Schedule"],
      [32, "Elevated Top Rate"],
      [45, "High Top Rate"],
      [55, "Confiscatory Schedule"],
    ]
  ),
  tax(
    "domesticCorporateTax",
    "Enterprise Income Tax Act",
    "The levy on domestic company profits.",
    "domesticCorporateTax",
    0,
    60,
    1,
    25,
    [
      [0, "No Profits Levy"],
      [12, "Light Corporate Levy"],
      [25, "Enterprise Income Tax"],
      [38, "Heavy Corporate Levy"],
      [52, "Confiscatory Levy"],
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
    25,
    [
      [0, "Exempt Foreign Enterprise"],
      [12, "Preferential Rate"],
      [25, "Parity with Domestic Firms"],
      [40, "Surcharge on Foreign Firms"],
      [55, "Punitive Levy"],
    ]
  ),
  tax(
    "payrollTax",
    "Social Insurance Contributions Act",
    "Employer and employee contributions funding pensions, health and unemployment insurance.",
    "payrollTax",
    0,
    20,
    0.2,
    17,
    [
      [0, "No Contributions"],
      [5, "Foundation Contributions"],
      [10, "Standard Contributions"],
      [17, "Full Contribution System"],
      [19, "Very High Contributions"],
    ]
  ),
  tax(
    "salesTax",
    "Value Added Tax Act",
    "The tax on goods and services.",
    "salesTax",
    0,
    30,
    1,
    13,
    [
      [0, "No Consumption Tax"],
      [6, "Low Rate"],
      [13, "Standard Rate"],
      [18, "High Standard Rate"],
      [25, "Very High Rate"],
    ]
  ),
  tax(
    "tariffs",
    "Customs Tariff Act",
    "Duties on goods entering the country.",
    "tariffs",
    0,
    25,
    0.5,
    2,
    [
      [0, "Free Trade Schedule"],
      [2, "Revenue Duties"],
      [10, "Protective Duties"],
      [18, "Heavy Protection"],
    ]
  ),
];

function program(row: (typeof CN_LAW_STRUCTURE)[number]): PoliticalLaw {
  const [slug, kind, category, scope, budgetKeyOverride, targets, costs] = row;
  const text = CN_LAW_TEXT[slug];
  if (!text) throw new Error(`cn law ${slug}: no text`);
  const [title, description, baselineLevel, levels] = text;
  const law: PoliticalLaw = {
    id: `cn.${slug}`,
    countryId: "CN",
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

const structureSlugs = new Set(CN_LAW_STRUCTURE.map((row) => row[0]));
for (const slug of Object.keys(CN_LAW_TEXT)) {
  if (!structureSlugs.has(slug)) throw new Error(`cn law text ${slug}: no structure row`);
}

/**
 * Primary ids follow the "{cc}.{metricId}.primary" convention, so the metric id
 * is the slug minus its suffix; secondaries are "{cc}.sec.{slug}".
 */
export const CN_LAWS: PoliticalLaw[] = [...CN_TAX_LAWS, ...CN_LAW_STRUCTURE.map(program)];
