/**
 * Japan's political-legislation book: 63 primary laws (one per political
 * metric), 41 secondary laws and 6 tax laws. Topology and cost terms live in
 * deLawStructure.ts, prose in the deLawText* modules; this file joins them and
 * fails loudly at import time if a row has no text or a text has no row.
 */

import type { PoliticalLaw, LawLevel } from "@/lib/politicalLegislation/types";
import type { PoliticalMetricCategoryId } from "@/lib/politicalMetrics/types";
import { JP_LAW_STRUCTURE, type JpLevelCost } from "./jpLawStructure";
import type { JpLawText } from "./jpLawTextTypes";
import { JP_LAW_TEXT_DEFENSE } from "./jpLawTextDefense";
import { JP_LAW_TEXT_ECONOMY } from "./jpLawTextEconomy";
import { JP_LAW_TEXT_EDUCATION } from "./jpLawTextEducation";
import { JP_LAW_TEXT_ENVIRONMENT } from "./jpLawTextEnvironment";
import { JP_LAW_TEXT_GOVERNANCE } from "./jpLawTextGovernance";
import { JP_LAW_TEXT_HEALTH } from "./jpLawTextHealth";
import { JP_LAW_TEXT_INFRASTRUCTURE } from "./jpLawTextInfrastructure";
import { JP_LAW_TEXT_ORDER } from "./jpLawTextOrder";
import { JP_LAW_TEXT_SOCIETY } from "./jpLawTextSociety";

const JP_LAW_TEXT: Record<string, JpLawText> = {
  ...JP_LAW_TEXT_ECONOMY,
  ...JP_LAW_TEXT_EDUCATION,
  ...JP_LAW_TEXT_HEALTH,
  ...JP_LAW_TEXT_INFRASTRUCTURE,
  ...JP_LAW_TEXT_ORDER,
  ...JP_LAW_TEXT_ENVIRONMENT,
  ...JP_LAW_TEXT_SOCIETY,
  ...JP_LAW_TEXT_GOVERNANCE,
  ...JP_LAW_TEXT_DEFENSE,
};

function level(name: string, description: string, cost?: JpLevelCost): LawLevel {
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
    id: `jp.tax.${slug}`,
    countryId: "JP",
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

const JP_TAX_LAWS: PoliticalLaw[] = [
  tax(
    "incomeTax",
    "Income Tax and Resident Tax Act",
    "The progressive national income tax and the resident tax levied alongside it.",
    "incomeTax",
    0,
    60,
    1,
    33,
    [
      [0, "No Income Taxation"],
      [10, "Flat Minimal Schedule"],
      [22, "Moderate Schedule"],
      [33, "Progressive Schedule with Resident Tax"],
      [45, "Elevated Top Rate"],
      [55, "Confiscatory Schedule"],
    ]
  ),
  tax(
    "domesticCorporateTax",
    "Corporation Tax and Enterprise Tax Act",
    "The levy on domestic company profits, national and prefectural.",
    "domesticCorporateTax",
    0,
    60,
    1,
    30,
    [
      [0, "No Profits Levy"],
      [15, "Light Corporate Levy"],
      [30, "Corporation and Enterprise Tax"],
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
    "Social Insurance Premiums Act",
    "Employer and employee premiums funding pensions, health and employment insurance.",
    "payrollTax",
    0,
    20,
    0.2,
    15,
    [
      [0, "No Premiums"],
      [5, "Foundation Premiums"],
      [10, "Standard Premiums"],
      [15, "Full Premium System"],
      [18, "Very High Premiums"],
    ]
  ),
  tax(
    "salesTax",
    "Consumption Tax Act",
    "The national tax on goods and services.",
    "salesTax",
    0,
    30,
    1,
    10,
    [
      [0, "No Consumption Tax"],
      [5, "Low Rate"],
      [10, "Standard Rate"],
      [15, "High Standard Rate"],
      [22, "Very High Rate"],
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
    0,
    [
      [0, "Free Trade Schedule"],
      [4, "Revenue Duties"],
      [10, "Protective Duties"],
      [18, "Heavy Protection"],
    ]
  ),
];

function program(row: (typeof JP_LAW_STRUCTURE)[number]): PoliticalLaw {
  const [slug, kind, category, scope, budgetKeyOverride, targets, costs] = row;
  const text = JP_LAW_TEXT[slug];
  if (!text) throw new Error(`jp law ${slug}: no text`);
  const [title, description, baselineLevel, levels] = text;
  const law: PoliticalLaw = {
    id: `jp.${slug}`,
    countryId: "JP",
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

const structureSlugs = new Set(JP_LAW_STRUCTURE.map((row) => row[0]));
for (const slug of Object.keys(JP_LAW_TEXT)) {
  if (!structureSlugs.has(slug)) throw new Error(`jp law text ${slug}: no structure row`);
}

/**
 * Primary ids follow the "{cc}.{metricId}.primary" convention, so the metric id
 * is the slug minus its suffix; secondaries are "{cc}.sec.{slug}".
 */
export const JP_LAWS: PoliticalLaw[] = [...JP_TAX_LAWS, ...JP_LAW_STRUCTURE.map(program)];
