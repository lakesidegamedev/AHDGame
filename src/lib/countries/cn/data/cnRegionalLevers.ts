import type { LegislationType } from "@/lib/db/types/legislation";
import { taxRateOptions } from "@/lib/seeds/reference/policyOptionHelpers";

/**
 * China's provincial resource tax lever. The one law book has no per-province
 * levers, and the provincial budget phase reads this one by id.
 */

function peoplesCongressCommitteePositions(domainLabel: string): LegislationType["positions"] {
  return [
    {
      positionId: "pc_chair",
      name: `Chair, People's Congress Committee on ${domainLabel}`,
      chamber: "peoplesCongress",
    },
    {
      positionId: "pc_vice",
      name: `Vice-Chair, People's Congress Committee on ${domainLabel}`,
      chamber: "peoplesCongress",
    },
  ];
}

export const cnRegionalLevers: LegislationType[] = [
  {
    _id: "cn_provincial_resource_tax",
    countryScope: "cn",
    name: "Provincial Resource Tax Law",
    description: "Sets the provincial-level ad-valorem rate on natural-resource extraction",
    explanation:
      "Resource Tax (资源税) is a provincial-level levy on extraction of minerals, oil/gas, coal, water, and salt. Statutory ad-valorem rate ~6%, ranging from 1-12% by resource type. This law sets the headline provincial rate.",
    policyDomain: "tax",
    subCategory: "Resource extraction",
    allowedScope: "state",
    effectTarget: {
      metricCategoryId: "environment",
      metricId: "carbonEmissions",
      scope: "state",
    },
    effectTargetsWeighted: [
      { metricCategoryId: "environment", metricId: "carbonEmissions", weight: -1.0 },
      { metricCategoryId: "economic", metricId: "ruralRevitalization", weight: 0.4 },
      { metricCategoryId: "economic", metricId: "manufacturingCompetitiveness", weight: -0.3 },
    ],
    positions: peoplesCongressCommitteePositions("Natural Resources"),
    taxRateChange: { scope: "state", taxType: "salesTax" },
    policyOptions: taxRateOptions("cn_provincial_resource_tax", [
      {
        rate: 0,
        name: "Resource Tax Abolition Law",
        description:
          "_资源税废止法_ — Eliminate Resource Tax entirely, removing extraction friction",
        stance: "right",
        economic: 5,
        social: 0,
      },
      {
        rate: 1,
        name: "Symbolic Extraction Levy Law",
        description: "_象征性开采税法_ — A token rate preserving the legal instrument",
        stance: "right",
        economic: 4,
        social: 0,
      },
      {
        rate: 2,
        name: "Mineral Industry Liberalization Law",
        description:
          "_矿业自由化法_ — Cut Resource Tax to coal-only minimum rate (~1.5%) for all resources",
        stance: "right",
        economic: 3,
        social: 0,
      },
      {
        rate: 4,
        name: "Reduced Standard Rate Law",
        description:
          "_低标准统一税率法_ — Below-statutory Resource Tax supporting industrial-raw-material affordability",
        stance: "right",
        economic: 2,
        social: 0,
      },
      {
        rate: 5,
        name: "Near-Statutory Resource Tax Law",
        description: "_近基本资源税法_ — Slight below-statutory rate easing energy-sector costs",
        stance: "right",
        economic: 1,
        social: 0,
      },
      {
        rate: 6,
        name: "Statutory Resource Tax Law",
        description: "_资源税基本法_ — The statutory ad-valorem rate across mining, oil/gas, water",
        stance: "center",
        economic: 0,
        social: 0,
      },
      {
        rate: 8,
        name: "Resource Conservation Law",
        description:
          "_资源节约法_ — Above-statutory rate funding provincial environmental remediation",
        stance: "left",
        economic: -1,
        social: 0,
      },
      {
        rate: 10,
        name: "Dual Carbon Resource Law",
        description:
          "_双碳资源税法_ — Higher rate aligned with 双碳 (Dual Carbon) emissions-reduction commitments",
        stance: "left",
        economic: -2,
        social: 0,
      },
      {
        rate: 12,
        name: "Resource Restraint Law",
        description:
          "_资源限制法_ — Substantially higher rate to discourage fossil and high-emission extraction",
        stance: "left",
        economic: -3,
        social: 0,
      },
      {
        rate: 16,
        name: "Common Prosperity Resource Law",
        description:
          "_共同富裕资源法_ — Near-maximum rate, revenue routed to provincial 共同富裕 (Common Prosperity) redistribution",
        stance: "left",
        economic: -4,
        social: 0,
      },
      {
        rate: 20,
        name: "Maximum Resource Extraction Tax Law",
        description:
          "_最大资源开采税法_ — The highest provincial Resource Tax, designed to fully internalize environmental costs of extraction",
        stance: "left",
        economic: -5,
        social: 0,
      },
    ]),
  },
];
