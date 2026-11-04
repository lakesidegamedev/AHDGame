/**
 * National minimum wage laws set the plant wage floor.
 *
 * The labour system already floors low-pay sectors' wages with a Kaitz ratio
 * (minimum wage as a share of the median wage, see `minWageFloorMultiplier` in
 * `src/lib/labour/laborCost.ts`). Until this module the only writer of that
 * ratio was the admin route, so the national minimum wage laws players pass
 * only nudged macro metrics. With `minimumWageLawStage` on, the national law in
 * force each turn sets the ratio:
 *
 * - Enacting or amending the law changes the ratio from the next turn.
 * - Repealing it (no national policy row) or enacting an abolition option
 *   clears the floor.
 * - An admin-set `federalBudget.minimumWageKaitzRatio` is an override and wins,
 *   including an explicit 0 (no floor). Clearing the admin value hands the
 *   country back to its law.
 *
 * The ratio is derived from the law every turn rather than stored, so there is
 * no copy that enactment, repeal, a court ruling or a world reset could leave
 * stale.
 *
 * ## How a law maps to a ratio
 *
 * Laws whose options carry an hourly rate map rate / reference median hourly
 * wage. The reference medians are present-day full-time medians in the same
 * currency the option text uses, chosen so each country's current statutory
 * option lands on its real OECD Kaitz ratio (US 0.28 at $7.25, Germany 0.55 at
 * EUR 12, Ireland 0.6 at EUR 13.50, Japan 0.45 at JPY 1,000). The option
 * rates are nominal present-day amounts in every era, so the ratio is too.
 *
 * Laws without a rate on their options (China's are monthly amounts in the
 * text only, Nigeria's carry none) use an explicit ratio per option on the same
 * scale. Real national floors sit between about 0.3 and 0.6 of the median; the
 * strongest player options go above that, and the existing cap
 * (`MIN_WAGE_KAITZ_MAX`) still applies.
 *
 * State-scope laws (`us_state_minimum_wage`) are not national floors and are
 * not read here.
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
  // USD/hour. $7.25 is 0.28 of the median (OECD 2023).
  us_minimum_wage: {
    referenceMedianWage: 26,
    optionRates: [25, 20, 17, 12, 7.25, 5, 0],
  },
  // EUR/hour. EUR 12 is 0.55 of the median.
  de_minimum_wage: {
    referenceMedianWage: 22,
    optionRates: [0, 5, 9, 12, 14, 16, 18],
  },
  // EUR/hour. The EUR 15 option is named after the two-thirds-of-median target.
  ie_minimum_wage: {
    referenceMedianWage: 22.5,
    optionRates: [20, 17, 15, 13.5, 11, 9, 0],
  },
  // JPY/hour. JPY 1,000 is 0.45 of the median.
  jp_minimum_wage: {
    referenceMedianWage: 2200,
    optionRates: [1800, 1500, 1250, 1000, 800, 500, 0],
  },
  // Monthly floors from the option text (CNY 2,700, 2,200, 1,900, a moderate
  // floor of about 1,500) over an urban median near CNY 5,500 a month. The
  // last three options remove the national floor.
  cn_minimum_wage: {
    optionKaitz: [0.49, 0.4, 0.35, 0.27, 0, 0, 0],
  },
  // No amounts on the options: living wage, raised floor, statutory, frozen,
  // minimal.
  ng_minimum_wage: {
    optionKaitz: [0.6, 0.5, 0.4, 0.3, 0.15],
  },
};

/** The legislation type ids read for national floors. */
export const MINIMUM_WAGE_LAW_TYPE_IDS: readonly string[] = Object.keys(MINIMUM_WAGE_LAW_SCALES);

/** gameConfig.minimumWageLawStage: >= 1 lets the law in force set the floor. */
export function minimumWageLawOn(stage: number | null | undefined): boolean {
  return (stage ?? 0) >= 1;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MINIMUM_WAGE_LAW_KAITZ_MAX, Math.max(0, value));
}

/** The option index of a national policy row, from its index or its `_opt_<n>` id. */
export function policyOptionIndexOf(row: {
  policyOptionIndex?: number | null;
  policyOptionId?: string | null;
}): number | null {
  if (typeof row.policyOptionIndex === "number" && Number.isInteger(row.policyOptionIndex)) {
    return row.policyOptionIndex;
  }
  const match = /_opt_(\d+)$/.exec(row.policyOptionId ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * The Kaitz ratio a law option sets, rounded to two places. 0 for an unknown
 * law, an unknown option or an abolition option.
 */
export function minimumWageLawKaitz(legislationTypeId: string, optionIndex: number | null): number {
  const scale = MINIMUM_WAGE_LAW_SCALES[legislationTypeId];
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
    if (!MINIMUM_WAGE_LAW_SCALES[p.legislationTypeId]) continue;
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
    if (!MINIMUM_WAGE_LAW_SCALES[id] || !Array.isArray(type.policyOptions)) return type;
    return {
      ...type,
      policyOptions: type.policyOptions.map((option: Record<string, unknown>, index: number) => ({
        ...option,
        wageFloorKaitz: minimumWageLawKaitz(id, index),
      })),
    };
  });
}
