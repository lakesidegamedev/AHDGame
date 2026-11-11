/**
 * National minimum wage laws set the plant wage floor (Kaitz ratio).
 *
 * The ratio is derived from the law every turn rather than stored, so
 * enactment, repeal, court ruling or world reset cannot leave it stale.
 *
 * - Enacting or amending the law changes the ratio from the next turn.
 * - Repealing it or an abolition option clears the floor.
 * - An admin-set `federalBudget.minimumWageKaitzRatio` overrides, including
 *   explicit 0. Clearing it hands the country back to its law.
 *
 * Laws whose options carry an hourly rate map rate / reference median hourly
 * wage. Reference medians are present-day full-time medians in the option's
 * own currency, chosen so each country's current statutory option lands on
 * its real OECD Kaitz ratio. Option rates are nominal present-day amounts, so
 * the ratio is too.
 *
 * Laws without a rate (China monthly amounts, Nigeria none) use an explicit
 * ratio per option. Real floors sit between about 0.3 and 0.6 of the median;
 * player options may exceed that and are capped by `MIN_WAGE_KAITZ_MAX`.
 *
 * State-scope laws are not national floors.
 */

/** Same ceiling as `MIN_WAGE_KAITZ_MAX` in laborCost.ts (a floor at the median itself). */
export const MINIMUM_WAGE_LAW_KAITZ_MAX = 1.0;

export interface MinimumWageLawScale {
  /**
   * Present-day full-time median wage in the unit the option rates use. Set
   * together with `optionRates`.
   */
  referenceMedianWage?: number;
  /** The rate each option sets, by option index, in the same unit. */
  optionRates?: readonly number[];
  /** Explicit Kaitz ratio per option index, for laws whose options carry no rate. */
  optionKaitz?: readonly number[];
}

/**
 * Every national minimum wage law, by legislation type id. A test checks the
 * rates against the seed catalogs, so a reworded or repriced option fails the
 * build instead of drifting.
 */
export const MINIMUM_WAGE_LAW_SCALES: Readonly<Record<string, MinimumWageLawScale>> = {
  // Worker protections level 0 to 4. Level 1 is a $7.25 floor (0.28 of a $26
  // median, OECD 2023); levels 2 to 4 are $12, $17 and $20.
  "us.economy.workerSecurity.primary": {
    referenceMedianWage: 26,
    optionRates: [0, 7.25, 12, 17, 20],
  },
  // EUR/hour, levels 0 to 4. EUR 12 is 0.55 of the median.
  "de.economy.workerSecurity.primary": {
    referenceMedianWage: 22,
    optionRates: [0, 9, 12, 15, 18],
  },
  // EUR/hour. The EUR 15 option is named after the two-thirds-of-median target.
  ie_minimum_wage: {
    referenceMedianWage: 22.5,
    optionRates: [20, 17, 15, 13.5, 11, 9, 0],
  },
  // JPY/hour, levels 0 to 4. JPY 1,000 is 0.45 of the median.
  "jp.economy.workerSecurity.primary": {
    referenceMedianWage: 2200,
    optionRates: [0, 800, 1000, 1250, 1500],
  },
  // Levels 0 to 4. Monthly floors (CNY 1,500 to 2,700) over an urban median near
  // CNY 5,500 a month; level 0 removes the national floor.
  "cn.economy.workerSecurity.primary": {
    optionKaitz: [0, 0.27, 0.35, 0.4, 0.49],
  },
  // No amounts on the options: living wage, raised floor, statutory, frozen,
  // minimal.
  ng_minimum_wage: {
    optionKaitz: [0.6, 0.5, 0.4, 0.3, 0.15],
  },
};

/**
 * Old-generation laws that saved worlds still have enacted after their country
 * moved to the one law book. New worlds never seed them, so no catalog lists
 * them; without these a saved world's enacted floor would silently vanish.
 * Only for local singleplayer saves, which are never reset. A reset replaces
 * every such id and the residue scan fails on any that survive.
 */
export const SAVED_WORLD_MINIMUM_WAGE_LAW_SCALES: Readonly<Record<string, MinimumWageLawScale>> = {
  // EUR/hour. EUR 12 is 0.55 of the median.
  de_minimum_wage: { referenceMedianWage: 22, optionRates: [0, 5, 9, 12, 14, 16, 18] },
  // JPY/hour. JPY 1,000 is 0.45 of the median.
  jp_minimum_wage: {
    referenceMedianWage: 2200,
    optionRates: [1800, 1500, 1250, 1000, 800, 500, 0],
  },
  // Monthly floors of CNY 2,700, 2,200, 1,900 and about 1,500 over an urban
  // median near CNY 5,500. The last three options remove the national floor.
  cn_minimum_wage: { optionKaitz: [0.49, 0.4, 0.35, 0.27, 0, 0, 0] },
};

function scaleFor(legislationTypeId: string): MinimumWageLawScale | undefined {
  return (
    MINIMUM_WAGE_LAW_SCALES[legislationTypeId] ??
    SAVED_WORLD_MINIMUM_WAGE_LAW_SCALES[legislationTypeId]
  );
}

/** The legislation type ids read for national floors. */
export const MINIMUM_WAGE_LAW_TYPE_IDS: readonly string[] = [
  ...Object.keys(MINIMUM_WAGE_LAW_SCALES),
  ...Object.keys(SAVED_WORLD_MINIMUM_WAGE_LAW_SCALES),
];

/** gameConfig.minimumWageLawStage: >= 1 lets the law in force set the floor. */
export function minimumWageLawOn(stage: number | null | undefined): boolean {
  return (stage ?? 0) >= 1;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MINIMUM_WAGE_LAW_KAITZ_MAX, Math.max(0, value));
}

/** The option index of a national policy row, from its index or its `_opt_<n>` or `l<n>` id. */
export function policyOptionIndexOf(row: {
  policyOptionIndex?: number | null;
  policyOptionId?: string | null;
}): number | null {
  if (typeof row.policyOptionIndex === "number" && Number.isInteger(row.policyOptionIndex)) {
    return row.policyOptionIndex;
  }
  const match = /(?:_opt_|^l)(\d+)$/.exec(row.policyOptionId ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * The Kaitz ratio a law option sets, rounded to two places. 0 for an unknown
 * law, an unknown option or an abolition option.
 */
export function minimumWageLawKaitz(legislationTypeId: string, optionIndex: number | null): number {
  const scale = scaleFor(legislationTypeId);
  if (!scale || optionIndex === null || optionIndex < 0) return 0;
  let ratio = 0;
  if (scale.optionKaitz) {
    ratio = scale.optionKaitz[optionIndex] ?? 0;
  } else if (scale.optionRates && scale.referenceMedianWage && scale.referenceMedianWage > 0) {
    ratio = (scale.optionRates[optionIndex] ?? 0) / scale.referenceMedianWage;
  }
  return Math.round(clampRatio(ratio) * 100) / 100;
}

export interface NationalMinimumWagePolicy {
  /** Country the national policy row belongs to (federal budget country id). */
  countryId: string;
  legislationTypeId: string;
  policyOptionIndex?: number | null;
  policyOptionId?: string | null;
}

export interface MinimumWageBudget {
  countryId?: string | null;
  /** Admin override. Any number, including 0, wins over the law. */
  minimumWageKaitzRatio?: number | null;
}

/**
 * The per-country Kaitz map the turn passes in the LabourContext, with laws.
 * Only countries with a positive ratio are included (absent means no floor),
 * as `buildMinWageRatioByCountry` does.
 */
export function buildMinWageRatioWithLaws(
  budgets: ReadonlyArray<MinimumWageBudget>,
  policies: ReadonlyArray<NationalMinimumWagePolicy>
): Map<string, number> {
  const lawRatio = new Map<string, number>();
  for (const p of policies) {
    if (!scaleFor(p.legislationTypeId)) continue;
    // One national law per country; if two ever coexist the higher floor binds.
    const ratio = minimumWageLawKaitz(p.legislationTypeId, policyOptionIndexOf(p));
    lawRatio.set(p.countryId, Math.max(lawRatio.get(p.countryId) ?? 0, ratio));
  }
  const overridden = new Set<string>();
  const out = new Map<string, number>();
  for (const b of budgets) {
    if (!b.countryId || typeof b.minimumWageKaitzRatio !== "number") continue;
    overridden.add(b.countryId);
    const ratio = clampRatio(b.minimumWageKaitzRatio);
    if (ratio > 0) out.set(b.countryId, ratio);
  }
  for (const [countryId, ratio] of lawRatio) {
    if (!overridden.has(countryId) && ratio > 0) out.set(countryId, ratio);
  }
  return out;
}

/**
 * Law picker annotation: with the stage on, each option of a national minimum
 * wage law carries `wageFloorKaitz`, the floor it would set (0 = none), so the
 * picker can state the effect. Other types pass through unchanged.
 */
export function annotateMinimumWageLawOptions<T extends { _id?: unknown; policyOptions?: unknown }>(
  types: readonly T[]
): T[] {
  return types.map((type) => {
    const id = String(type._id);
    if (!scaleFor(id) || !Array.isArray(type.policyOptions)) return type;
    return {
      ...type,
      policyOptions: type.policyOptions.map((option: Record<string, unknown>, index: number) => ({
        ...option,
        wageFloorKaitz: minimumWageLawKaitz(id, index),
      })),
    };
  });
}
