import type { LegislationType } from "@/lib/db/types/legislation";
import { taxRateOptions } from "@/lib/seeds/reference/policyOptionHelpers";

/**
 * Japan's two prefectural tax levers. The one law book has no per-prefecture levers,
 * and the prefectural budget phase reads these by id.
 */

function standardJPCommitteePositions(domainLabel: string): LegislationType["positions"] {
  return [
    {
      positionId: "shugiin_chair",
      name: `Chair, Shugiin ${domainLabel} Committee`,
      chamber: "shugiin",
    },
    {
      positionId: "shugiin_ranking",
      name: `Ranking Member, Shugiin ${domainLabel} Committee`,
      chamber: "shugiin",
    },
    {
      positionId: "sangiin_chair",
      name: `Chair, Sangiin ${domainLabel} Committee`,
      chamber: "sangiin",
    },
    {
      positionId: "sangiin_ranking",
      name: `Ranking Member, Sangiin ${domainLabel} Committee`,
      chamber: "sangiin",
    },
  ];
}

function weightedTargets(
  primary: { category: string; metric: string },
  secondaries: { category: string; metric: string; weight: number }[]
): LegislationType["effectTargetsWeighted"] {
  return [
    {
      metricCategoryId: primary.category as "economic",
      metricId: primary.metric,
      weight: 1.0,
    },
    ...secondaries.map((s) => ({
      metricCategoryId: s.category as "economic",
      metricId: s.metric,
      weight: s.weight,
    })),
  ];
}

export const jpRegionalLevers: LegislationType[] = [
  {
    _id: "jp_resident_tax",
    countryScope: "jp",
    name: "Prefectural Resident Tax Act",
    description: "Sets the combined prefectural and municipal resident tax rate applied to income",
    policyDomain: "tax",
    subCategory: "Regional taxation",
    nationalOnly: false,
    effectTarget: {
      metricCategoryId: "governance",
      metricId: "publicTrust",
      scope: "state",
    },
    effectTargetsWeighted: weightedTargets({ category: "governance", metric: "publicTrust" }, [
      { category: "education", metric: "educationSpending", weight: 0.4 },
      { category: "publicSafety", metric: "crimeRate", weight: 0.3 },
    ]),
    positions: standardJPCommitteePositions("Finance"),
    taxRateChange: { scope: "state", taxType: "residentTax" },
    policyOptions: taxRateOptions("jp_resident_tax", [
      {
        rate: 0,
        name: "Resident Tax Abolition Act",
        description:
          "Eliminate prefectural resident taxation entirely, removing a key local revenue source",
        stance: "right",
        economic: 5,
        social: 0,
      },
      {
        rate: 2,
        name: "Minimal Resident Levy",
        description: "A token resident tax dramatically reducing household tax burden",
        stance: "right",
        economic: 4,
        social: 0,
      },
      {
        rate: 4,
        name: "Householder Relief Act",
        description: "A low resident tax prioritizing housing affordability over local revenue",
        stance: "right",
        economic: 3,
        social: 0,
      },
      {
        rate: 6,
        name: "Low-Burden Resident Levy",
        description:
          "A modest resident tax keeping household costs low while funding essential services",
        stance: "right",
        economic: 2,
        social: 0,
      },
      {
        rate: 8,
        name: "Affordable Living Tax Act",
        description:
          "A below-average resident tax balancing household costs with local service funding",
        stance: "right",
        economic: 1,
        social: 0,
      },
      {
        rate: 10,
        name: "Balanced Resident Tax Act",
        description:
          "A mid-range resident tax providing reliable funding for local schools, infrastructure, and emergency services",
        stance: "center",
        economic: 0,
        social: 0,
      },
      {
        rate: 12,
        name: "Enhanced Local Services Levy",
        description:
          "An above-average resident tax funding expanded education and public infrastructure",
        stance: "left",
        economic: -1,
        social: 0,
      },
      {
        rate: 14,
        name: "Community Investment Tax Act",
        description:
          "A higher resident tax enabling robust investment in local education and municipal services",
        stance: "left",
        economic: -2,
        social: 0,
      },
      {
        rate: 16,
        name: "Public Infrastructure Priority Act",
        description:
          "Elevated resident tax funding comprehensive local government services and capital improvements",
        stance: "left",
        economic: -3,
        social: 0,
      },
      {
        rate: 18,
        name: "Maximum Local Investment Act",
        description:
          "Among the highest resident tax rates, extracting substantial revenue for public use",
        stance: "left",
        economic: -4,
        social: 0,
      },
      {
        rate: 20,
        name: "Maximum Resident Tax Act",
        description:
          "The highest resident tax rate, maximizing local revenue extraction from resident income",
        stance: "left",
        economic: -5,
        social: 0,
      },
    ]),
    source: "seed",
    isPermanent: true,
  },
  {
    _id: "jp_fixed_asset_tax",
    countryScope: "jp",
    name: "Fixed Asset Tax Act",
    description: "Sets the tax rate on land, buildings, and depreciable business assets",
    policyDomain: "tax",
    subCategory: "Regional taxation",
    nationalOnly: false,
    effectTarget: {
      metricCategoryId: "economic",
      metricId: "costOfLiving",
      scope: "state",
    },
    effectTargetsWeighted: weightedTargets({ category: "economic", metric: "costOfLiving" }, [
      {
        category: "economic",
        metric: "smallBusinessFormation",
        weight: -0.3,
      },
      { category: "governance", metric: "publicTrust", weight: 0.4 },
    ]),
    positions: standardJPCommitteePositions("Finance"),
    taxRateChange: { scope: "state", taxType: "fixedAssetTax" },
    policyOptions: taxRateOptions("jp_fixed_asset_tax", [
      {
        rate: 0,
        name: "Fixed Asset Tax Abolition Act",
        description:
          "Eliminate the fixed asset tax entirely to attract property investment and development",
        stance: "right",
        economic: 5,
        social: 0,
      },
      {
        rate: 0.2,
        name: "Minimal Property Assessment",
        description: "A near-zero rate dramatically reducing landowner and business tax burden",
        stance: "right",
        economic: 4,
        social: 0,
      },
      {
        rate: 0.5,
        name: "Property Owner Relief Act",
        description: "A low rate prioritizing housing and commercial property affordability",
        stance: "right",
        economic: 3,
        social: 0,
      },
      {
        rate: 0.8,
        name: "Low-Burden Asset Levy",
        description:
          "A modest rate keeping property costs low while funding essential local services",
        stance: "right",
        economic: 2,
        social: 0,
      },
      {
        rate: 1.1,
        name: "Affordable Property Tax Act",
        description:
          "A below-average rate balancing property ownership costs with local service funding",
        stance: "right",
        economic: 1,
        social: 0,
      },
      {
        rate: 1.4,
        name: "Balanced Fixed Asset Tax Act",
        description:
          "A mid-range fixed asset tax rate providing reliable funding for local infrastructure and services",
        stance: "center",
        economic: 0,
        social: 0,
      },
      {
        rate: 1.8,
        name: "Enhanced Asset Revenue Levy",
        description:
          "An above-average rate funding expanded local infrastructure and public investment",
        stance: "left",
        economic: -1,
        social: 0,
      },
      {
        rate: 2.2,
        name: "Community Development Tax Act",
        description:
          "A higher rate enabling robust investment in local infrastructure and municipal services",
        stance: "left",
        economic: -2,
        social: 0,
      },
      {
        rate: 3.0,
        name: "Public Asset Revenue Act",
        description:
          "Elevated rates funding comprehensive local government services and capital improvements",
        stance: "left",
        economic: -3,
        social: 0,
      },
      {
        rate: 4.0,
        name: "Maximum Local Asset Tax Act",
        description:
          "Among the highest fixed asset rates, extracting substantial revenue from property owners",
        stance: "left",
        economic: -4,
        social: 0,
      },
      {
        rate: 5.0,
        name: "Maximum Fixed Asset Tax Act",
        description:
          "The highest fixed asset tax rate, maximizing local revenue from land and property holdings",
        stance: "left",
        economic: -5,
        social: 0,
      },
    ]),
    source: "seed",
    isPermanent: true,
  },
];
