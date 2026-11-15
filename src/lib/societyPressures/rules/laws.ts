/**
 * The 2027 and 2030 laws that move society pressures, read as option indexes
 * on their seven-option ladders (index 3 is the no-statute centre). Plain data
 * in, plain data out: the shell loads enacted rows and hands them here.
 */

export const PENSION_AGE_INDEXATION_SLUG = "pension_age_indexation";
export const HOUSING_SUPPLY_REFORM_SLUG = "housing_supply_reform";
export const WAGE_INSURANCE_SLUG = "wage_insurance";

export const SOCIETY_LAW_SLUGS = [
  PENSION_AGE_INDEXATION_SLUG,
  HOUSING_SUPPLY_REFORM_SLUG,
  WAGE_INSURANCE_SLUG,
] as const;

/** Enacted option index (0-6) per law; null where no statute is on the book. */
export interface SocietyLawPositions {
  pensionIndexation: number | null;
  zoning: number | null;
  wageInsurance: number | null;
}

export const NO_SOCIETY_LAWS: Readonly<SocietyLawPositions> = {
  pensionIndexation: null,
  zoning: null,
  wageInsurance: null,
};

export interface EnactedLawRow {
  legislationTypeId: string;
  policyOptionIndex?: number | null;
}

const validIndex = (index: number | null | undefined): number | null =>
  typeof index === "number" && Number.isInteger(index) && index >= 0 && index <= 6 ? index : null;

/**
 * Law type ids are `<country prefix>_<slug>`. Rows must already be deduped to
 * the latest active enactment per type.
 */
export function societyLawPositionsByCountry(
  rows: readonly EnactedLawRow[]
): Map<string, SocietyLawPositions> {
  const out = new Map<string, SocietyLawPositions>();
  for (const row of rows) {
    const underscore = row.legislationTypeId.indexOf("_");
    if (underscore <= 0) continue;
    const countryId = row.legislationTypeId.slice(0, underscore).toUpperCase();
    const slug = row.legislationTypeId.slice(underscore + 1);
    const index = validIndex(row.policyOptionIndex);
    const positions = out.get(countryId) ?? { ...NO_SOCIETY_LAWS };
    if (slug === PENSION_AGE_INDEXATION_SLUG) positions.pensionIndexation = index;
    else if (slug === HOUSING_SUPPLY_REFORM_SLUG) positions.zoning = index;
    else if (slug === WAGE_INSURANCE_SLUG) positions.wageInsurance = index;
    else continue;
    out.set(countryId, positions);
  }
  return out;
}

/**
 * Years added to the pension age by the indexation law, given the life
 * expectancy gained since 2027. Left of centre fixes or lowers the age; right
 * of centre ties it to longevity.
 */
export function pensionAgeShiftYears(index: number | null, lifeExpectancyGain: number): number {
  const gain = Math.max(0, Number.isFinite(lifeExpectancyGain) ? lifeExpectancyGain : 0);
  switch (index) {
    case 0:
      return -2; // Earlier Pension Age
    case 2:
      return -0.5; // early retirement for long physical careers
    case 4:
      return 0.5 * gain; // half of every year gained
    case 5:
      return gain; // full indexation
    case 6:
      return gain + 1; // full indexation plus an extra year now
    default:
      return 0;
  }
}

/** Share of planned housing that permits turn into finished homes, by zoning option. */
const ZONING_EFFECTIVENESS = [1.5, 1.35, 1.2, 1, 0.9, 0.8, 0.65] as const;

export function zoningConstructionEffectiveness(index: number | null): number {
  return index === null ? 1 : ZONING_EFFECTIVENESS[index];
}

/**
 * How strongly the wage insurance law keeps displaced workers attached to
 * work, 0 to 1. Retraining loans help a little; time limits push people into
 * the first job but do not create one.
 */
const WAGE_INSURANCE_SUPPORT = [1, 0.75, 0.5, 0, 0.3, 0, 0] as const;

export function wageInsuranceSupport(index: number | null): number {
  return index === null ? 0 : WAGE_INSURANCE_SUPPORT[index];
}
