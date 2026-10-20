/**
 * Public-data-calibrated household cohorts model living standards, not survey records.
 * prepareCalibratedHouseholds constructs compact regional distributions only for
 * complete 1991 rosters and recognized laws; incomplete inputs retain legacy metrics.
 */
import type { HouseholdAdapterCountry } from "./householdCountryAdapter";
import type { HouseholdDecodedReference, HouseholdIncomeModel } from "./householdSources";
import type { MetricLawProgram } from "./lawDelivery";
import { resetLawFamilyById } from "@/lib/resetLegislation/catalog";
import { weightedMedian } from "./householdResources";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";

export interface HouseholdCalibrationRegion {
  regionId: string;
  population: number;
  output: number;
  costOfLiving: number;
  medianIncome: number;
}

export const COHORT_ASSUMPTIONS = [
  "Synthetic cohorts calibrated to public aggregates and game regional 1991 opening incomes, not observed household microdata.",
  "Income rank and household composition are independent and fixed. Household counts scale with population; institutional residents are approximated as 2% of population.",
  "Three integer household types (one adult, two adults, two adults with two children) match the stated mean size. The one-person share is assumed to be 25% in every region.",
  "US gross-income decile means supply relative shape only; negative source incomes are zero-floored before aggregation and four zero-weight source records contribute no weight. No individual survey records are installed.",
  "UK national original cash-income decile means supply relative shape in all UK regions; Great Britain mean household size 2.48 approximates the UK.",
  "Japan uses a lognormal shape with assumed sigma 0.60; 1989 multi-person mean income 6653000 yen and size 3.77 are bridged to all households with 1990 mean size 2.99, assuming mean income proportional to size and no real change to 1991. The inferred national median sets the level; game opening income ratios supply regional differences. This is not a 1991 survey observation.",
  "Market-income medians are 85% of opening gross-income medians in US/JP; UK uses the published middle-decile original/gross cash-income ratio. This removes an assumed opening public-transfer component before current benefits are added.",
  "Within every income/composition cell, 80% of households have wage income and 20% have only non-wage market income; wage income is 93.75% for working cohorts, giving 75% overall. Half the combined payroll levy falls on employees. Owner-occupied taxable housing is approximated by 60% ownership times four years of opening household market income.",
  "UK/JP latest annual household tax assessments within the regional budget's scheduled validity window are allocated across modeled adult assessment units, with deductions capped at market income. These are modeled liabilities, not fiscal cash receipts. Indirect consumption taxes enter through the consumer basket rather than a second income deduction.",
  "L01 refundable relief and L02 pooled insurance allocate 90% of actual national outlays to households; 10% is administration. Regional benefits use current funded annual allocations as modeled annual income, not observed cash payments or booked appropriations. Insurance is pooled across people, not an age-specific pension microsimulation.",
  "L01 income ceilings by position are 2, 1, 0.75, 1 and 2 times the opening national median market income per assessment unit, price-indexed; work-credit options require positive modeled wages. Other families are restricted services, capital or regulation, not unrestricted cash.",
] as const;

export const COHORT_SOURCE_URLS = [
  "https://data.nber.org/cps/cpsmar92.zip",
  "https://www.ons.gov.uk/peoplepopulationandcommunity/personalandhouseholdfinances/incomeandwealth/datasets/theeffectsoftaxesandbenefitsonhouseholdincomehistoricaldatasets",
  "https://cy.ons.gov.uk/peoplepopulationandcommunity/personalandhouseholdfinances/incomeandwealth/compendium/generallifestylesurvey/2013-03-07/chapter3householdsfamilesandpeoplegenerallifestylesurveyoverviewareportonthe2011generallifestylesurvey",
  "https://www.e-stat.go.jp/dbview?sid=0000110274",
  "https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2024/T07-04.files/sheet001.htm",
] as const;

// Non-identifying aggregates from CPS March 1992 household weights (income year
// 1991). Raw input SHA256 c9a558723218c69e3d2556667c9aab2b00c8bc9459667a5382fd52eb96f1c050.
const usDeciles = [
  4501.787228, 9924.029786, 15233.618747, 20885.130307, 26768.986156, 33345.355211, 41053.714699,
  50697.711167, 65106.957141, 104499.324403,
];
// ONS 1991 all-household original cash income, excluding benefits in kind.
// Contains public sector information licensed under the Open Government Licence v3.0:
// https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/
// Values-only extract SHA256 56bf0fcc709587ffdfcd797582d53854d547a65dfd6652a1d32cbeed4e644b3a.
const ukDeciles = [974, 1628, 3494, 7471, 11155, 14812, 18617, 22758, 27921, 46461];
const decileNormalScores = [
  -1.644854, -1.036433, -0.67449, -0.38532, -0.125661, 0.125661, 0.38532, 0.67449, 1.036433,
  1.644854,
];

export function prepareCalibratedHouseholds(input: {
  worldId: string;
  countryId: string;
  preset: string;
  regionIds: readonly string[];
  calibration: readonly HouseholdCalibrationRegion[];
  programs: readonly MetricLawProgram[];
}): {
  reference: HouseholdDecodedReference | undefined;
  model: HouseholdIncomeModel | undefined;
  gaps: string[];
} {
  const fail = (gap: string) => ({ reference: undefined, model: undefined, gaps: [gap] });
  if (!["US", "UK", "JP"].includes(input.countryId) || input.preset !== "1991-default")
    return fail("unsupported-cohort-country-or-preset");
  const country = input.countryId as HouseholdAdapterCountry;
  const regions = input.calibration;
  if (
    !input.worldId ||
    !regions.length ||
    new Set(input.regionIds).size !== input.regionIds.length ||
    new Set(regions.map((r) => r.regionId)).size !== regions.length ||
    input.regionIds.length !== regions.length ||
    regions.some(
      (r) =>
        !input.regionIds.includes(r.regionId) ||
        ![r.population, r.output, r.costOfLiving, r.medianIncome].every(
          (v) => Number.isFinite(v) && v > 0
        )
    )
  )
    return fail("incomplete-cohort-calibration-roster");
  const sourceId = `public-calibrated-cohorts-v1:${country}:1991`;
  const size =
    country === COUNTRY_CONFIGS.US.id
      ? 2.5942541705435085
      : country === COUNTRY_CONFIGS.UK.id
        ? 2.48
        : 2.99;
  const pair = (3.25 - size) / 2;
  const compositions = [
    { adults: 1, children: 0, share: 0.25 },
    { adults: 2, children: 0, share: pair },
    { adults: 2, children: 2, share: 0.75 - pair },
  ];
  const curve =
    country === COUNTRY_CONFIGS.US.id
      ? usDeciles
      : country === COUNTRY_CONFIGS.UK.id
        ? ukDeciles
        : decileNormalScores.map(
            (z) => ((6653000 * 2.99) / 3.77) * Math.exp(0.6 * z - 0.6 ** 2 / 2)
          );
  const midpoint = (curve[4]! + curve[5]!) / 2;
  const marketShare = country === COUNTRY_CONFIGS.UK.id ? (11155 + 14812) / (13879 + 16944) : 0.85;
  const openingMedian = weightedMedian(
    regions.map((r) => ({ value: r.medianIncome, weight: r.population }))
  );
  const jpNationalMedian = ((6653000 * 2.99) / 3.77) * Math.exp(-(0.6 ** 2) / 2);
  const cells = regions.flatMap((r) =>
    compositions.flatMap((c, type) =>
      curve.flatMap((income, decile) =>
        [true, false].map((working) => {
          const market =
            (((country === COUNTRY_CONFIGS.JP.id
              ? (jpNationalMedian * r.medianIncome) / openingMedian
              : r.medianIncome) *
              marketShare *
              income) /
              midpoint) *
            Math.sqrt((c.adults + c.children) / size);
          return {
            id: `${type}:${decile}:${working ? "wage" : "non-wage"}`,
            sourceArea: r.regionId,
            households: ((((r.population * 0.98) / size) * c.share) / 10) * (working ? 0.8 : 0.2),
            adults: c.adults,
            children: c.children,
            marketIncome: market,
            labourIncome: working ? market * 0.9375 : 0,
            otherDirectTaxes: 0,
            propertyTaxBase: market * 4 * 0.6,
            cashTransfers: null,
            directTaxes: null,
            employeeContributions: null,
            grossIncome: null,
          };
        })
      )
    )
  );
  const programs = input.programs.filter((p) => p.country === country);
  if (new Set(programs.map((p) => p._id)).size !== programs.length)
    return fail("duplicate-cohort-law-identity");
  const roles: HouseholdIncomeModel["programRoles"][number][] = [];
  const nationalMedian = weightedMedian(
    cells.map((c) => ({ value: c.marketIncome / c.adults, weight: c.households * c.adults }))
  );
  for (const p of programs) {
    const family = resetLawFamilyById(p.familyId);
    const position = p.choice;
    const level = family?.levels.findIndex((l) => l.position === position) ?? -1;
    if (!family || (level < 0 && !(p.choice === "leave_to_states" && family.leaveToStates)))
      return fail("unclassified-cohort-law-option");
    const binding = {
      programId: p._id,
      familyId: p.familyId,
      effectiveTurn: p.effectiveTurn,
      choice: p.choice,
    };
    if (["L01", "L02"].includes(p.familyId)) {
      if (p.scope === "regional" && !input.regionIds.includes(p.regionId ?? ""))
        return fail("invalid-regional-cash-geography");
      roles.push({
        ...binding,
        role: "cash",
        cashShare: 0.9,
        recipients: (p.scope === "regional"
          ? cells.filter((c) => c.sourceArea === p.regionId)
          : cells
        ).map((c) => ({
          id: c.id,
          sourceArea: c.sourceArea,
          eligibility:
            p.familyId === "L02"
              ? (c.adults + c.children) / 4
              : level >= 3 && c.labourIncome <= 0
                ? 0
                : 1,
        })),
        eligibilityModel:
          p.familyId === "L02"
            ? { kind: "fixed-reference-groups" }
            : {
                kind: "maximum-modeled-market-income",
                annualPerAssessmentUnit: nationalMedian * [2, 1, 0.75, 1, 2][level]!,
                indexedToPrices: true,
              },
      });
    } else roles.push({ ...binding, role: "service" });
  }
  return {
    gaps: [],
    reference: {
      version: 1,
      countryId: country,
      sourceId,
      incomeYear: 1991,
      currency:
        country === COUNTRY_CONFIGS.US.id
          ? "USD"
          : country === COUNTRY_CONFIGS.UK.id
            ? "GBP"
            : "JPY",
      population: "all-household-residents",
      distribution: "joint-household-groups",
      gaps: [],
      cells,
      calibration: {
        kind: "public-data-calibrated-cohorts",
        version: 1,
        assumptions: [...COHORT_ASSUMPTIONS],
        sourceUrls: [...COHORT_SOURCE_URLS],
      },
    },
    model: {
      employeePayrollShare: 0.5,
      worldId: input.worldId,
      countryId: country,
      referenceSourceId: sourceId,
      sourceId,
      preset: input.preset,
      year: 1991,
      programRoles: roles,
      regions: regions.map((r) => ({ ...r, sourceAreas: [r.regionId] })),
    },
  };
}
