/**
 * Household earnings and taxes follow regional activity and enacted rates.
 * modelHouseholdIncome scales real reference groups, never adds households,
 * and models liabilities separately from the paid-benefit producer.
 */
import {
  earnedIncomeTier,
  incomeTaxRate,
  type IncomeTaxRates,
  INCOME_TIERS,
} from "@/lib/budget/rules/incomeTaxTiers";
import { HOUSEHOLD_COUNTRY_PROFILES } from "./householdCountryAdapter";
import { householdReferenceGaps } from "./householdSources";
import { weightedMedian } from "./householdResources";
import type {
  HouseholdCurrentState,
  HouseholdDecodedReference,
  HouseholdFiscalControls,
  HouseholdIncomeModel,
} from "./householdSources";

export interface HouseholdModelActivity {
  regionId: string;
  output: number;
  population: number;
  costOfLiving: number;
  /** Current resolved statutory rates, not budget revenue or a political score. */
  regionalTaxes?: IncomeTaxRates & {
    residentTax?: number;
    propertyTax?: number;
    fixedAssetTax?: number;
  };
}

export function modelHouseholdIncome(input: {
  worldId: string;
  countryId: string;
  turn: number;
  year: number;
  preset: string;
  reference: HouseholdDecodedReference | undefined;
  model: HouseholdIncomeModel | undefined;
  activity: readonly HouseholdModelActivity[];
  nationalTaxes: (IncomeTaxRates & { payrollTax?: number }) | undefined;
}): { current?: HouseholdCurrentState; fiscalControls?: HouseholdFiscalControls; gaps: string[] } {
  const fail = (gap: string) => ({ gaps: [gap] });
  const { reference: ref, model, nationalTaxes: taxes } = input;
  const completeRates = (rates: IncomeTaxRates | undefined) =>
    !!rates &&
    (rates.incomeTax !== undefined ||
      [rates.incomeTaxLow, rates.incomeTaxMiddle, rates.incomeTaxHigh].every(
        (v) => v !== undefined
      ));
  if (!ref || !model) return fail("missing-reviewed-income-model");
  if (
    !Object.hasOwn(HOUSEHOLD_COUNTRY_PROFILES, input.countryId) ||
    !Array.isArray(ref.gaps) ||
    !Array.isArray(ref.cells) ||
    householdReferenceGaps(ref, true).length ||
    ref.population !== "all-household-residents" ||
    ref.distribution !== "joint-household-groups"
  )
    return fail("incomplete-income-reference");
  if (
    model.worldId !== input.worldId ||
    !input.worldId.trim() ||
    typeof model.preset !== "string" ||
    !model.preset.trim() ||
    typeof model.sourceId !== "string" ||
    !Array.isArray(model.regions) ||
    !Array.isArray(model.programRoles) ||
    model.regions.some((r) => !r || !Array.isArray(r.sourceAreas)) ||
    ref.version !== 1 ||
    ref.currency !==
      HOUSEHOLD_COUNTRY_PROFILES[input.countryId as keyof typeof HOUSEHOLD_COUNTRY_PROFILES]
        .currency ||
    model.countryId !== input.countryId ||
    ref.countryId !== input.countryId ||
    model.referenceSourceId !== ref.sourceId ||
    !model.sourceId.trim() ||
    model.preset !== input.preset ||
    model.year !== ref.incomeYear ||
    model.year > input.year ||
    !Number.isSafeInteger(input.year) ||
    input.year < 1 ||
    !Number.isSafeInteger(model.year) ||
    model.year < 1 ||
    !Number.isSafeInteger(input.turn) ||
    input.turn < 1
  )
    return fail("incompatible-income-calibration");
  if (
    !Number.isFinite(model.employeePayrollShare) ||
    model.employeePayrollShare < 0 ||
    model.employeePayrollShare > 1
  )
    return fail("missing-employee-payroll-incidence");
  if (
    !taxes ||
    !Number.isFinite(taxes.payrollTax) ||
    taxes.payrollTax! < 0 ||
    taxes.payrollTax! > 100 ||
    !completeRates(taxes)
  )
    return fail("missing-current-income-tax-rates");
  try {
    for (const tier of INCOME_TIERS) incomeTaxRate(taxes, tier);
  } catch {
    return fail("invalid-current-income-tax-rates");
  }
  const activity = new Map(input.activity.map((r) => [r.regionId, r]));
  const areas = new Map<string, HouseholdIncomeModel["regions"][number]>();
  if (
    !model.regions.length ||
    new Set(model.regions.map((r) => r.regionId)).size !== model.regions.length ||
    activity.size !== input.activity.length ||
    activity.size !== model.regions.length
  )
    return fail("incomplete-income-model-regions");
  for (const base of model.regions) {
    const now = activity.get(base.regionId);
    if (
      now?.regionalTaxes &&
      [now.regionalTaxes.propertyTax, now.regionalTaxes.fixedAssetTax].some(
        (v) => v !== undefined && v !== 0
      )
    )
      return fail("unmodeled-current-property-levy");
    if (
      input.countryId === "UK" &&
      now?.regionalTaxes &&
      [
        now.regionalTaxes.incomeTax,
        now.regionalTaxes.incomeTaxLow,
        now.regionalTaxes.incomeTaxMiddle,
        now.regionalTaxes.incomeTaxHigh,
        now.regionalTaxes.residentTax,
      ].some((v) => v !== undefined && v !== 0)
    )
      return fail("unmodeled-UK-regional-income-levy");
    if (
      !now ||
      !base.sourceAreas.length ||
      ![
        base.output,
        base.population,
        base.costOfLiving,
        now.output,
        now.population,
        now.costOfLiving,
      ].every((v) => Number.isFinite(v) && v > 0)
    )
      return fail("invalid-economic-activity");
    for (const area of base.sourceAreas) {
      if (!area || areas.has(area)) return fail("ambiguous-income-geography");
      areas.set(area, base);
    }
    if (input.countryId !== "UK" && !now.regionalTaxes)
      return fail("missing-regional-income-tax-rates");
    if (input.countryId === "JP" && !Number.isFinite(now.regionalTaxes?.residentTax))
      return fail("missing-regional-resident-tax");
    if (input.countryId === "US" && !completeRates(now.regionalTaxes))
      return fail("missing-regional-income-tax-rates");
    if (input.countryId === "US") {
      try {
        for (const tier of INCOME_TIERS) incomeTaxRate(now.regionalTaxes!, tier);
      } catch {
        return fail("invalid-current-income-tax-rates");
      }
    }
  }
  if (
    !ref.cells.length ||
    ref.cells.length > 65_536 ||
    new Set(ref.cells.map((c) => JSON.stringify([c.sourceArea, c.id]))).size !== ref.cells.length ||
    ref.cells.some((c) => !areas.has(c.sourceArea)) ||
    [...areas.keys()].some((a) => !ref.cells.some((c) => c.sourceArea === a))
  )
    return fail("incomplete-income-reference-roster");
  // Other direct levies need their own current bases. Never silently omit them.
  if (ref.cells.some((c) => c.otherDirectTaxes !== 0)) return fail("unmodeled-other-direct-taxes");
  if (
    ref.cells.some(
      (c) =>
        !c.id ||
        ![c.households, c.marketIncome, c.labourIncome].every(
          (v) => v !== null && v !== undefined && Number.isFinite(v) && v >= 0
        ) ||
        c.households! <= 0 ||
        !Number.isSafeInteger(c.adults) ||
        c.adults! < 0 ||
        !Number.isSafeInteger(c.children) ||
        c.children! < 0 ||
        c.adults! + c.children! < 1 ||
        c.labourIncome! > c.marketIncome!
    )
  )
    return fail("incomplete-income-reference-fields");
  const raw = ref.cells.map((c) => {
    const base = areas.get(c.sourceArea)!;
    const now = activity.get(base.regionId)!;
    const weightFactor = now.population / base.population;
    // GDP already reflects employment and productivity. Do not apply unemployment a second time.
    // State.gdp advances with real output growth. Re-price reference earnings
    // with the reviewed local basket ratio, rather than deflating real output twice.
    const incomeFactor =
      (now.output / base.output / weightFactor) * (now.costOfLiving / base.costOfLiving);
    return {
      id: c.id,
      sourceArea: c.sourceArea,
      adults: c.adults!,
      children: c.children!,
      households: c.households! * weightFactor,
      marketIncome: c.marketIncome! * incomeFactor,
      labour: c.labourIncome! * incomeFactor,
      regionId: base.regionId,
    };
  });
  if (
    raw.some(
      (c) => ![c.marketIncome, c.labour, c.households].every(Number.isFinite) || c.households <= 0
    )
  )
    return fail("invalid-modeled-income-distribution");
  const ranked = raw
    // Minor-only households still have one modeled assessment unit; no adult
    // is added to their demographic composition or population weights.
    .map((c) => ({
      value: c.marketIncome / Math.max(1, c.adults),
      weight: c.households * Math.max(1, c.adults),
    }));
  const adults = ranked.reduce((s, c) => s + c.weight, 0);
  if (
    !Number.isFinite(adults) ||
    ranked.some((c) => !Number.isFinite(c.value) || !Number.isFinite(c.weight))
  )
    return fail("invalid-modeled-income-distribution");
  const median = weightedMedian(ranked);
  if (!(median > 0) || !Number.isFinite(adults)) return fail("invalid-modeled-income-distribution");
  let direct = 0,
    payroll = 0,
    market = 0;
  const cells: HouseholdCurrentState["cells"][number][] = [];
  try {
    for (const c of raw) {
      const tier = earnedIncomeTier(c.marketIncome / Math.max(1, c.adults), median);
      const regional = activity.get(c.regionId)!.regionalTaxes;
      const regionalRate =
        input.countryId === "UK"
          ? 0
          : input.countryId === "JP"
            ? regional!.residentTax!
            : incomeTaxRate(regional!, tier);
      if (!Number.isFinite(regionalRate) || regionalRate < 0 || regionalRate > 100)
        return fail("invalid-current-income-tax-rates");
      // Same liability ceiling as the game's player-income tax rules; no debt is labeled a paid deduction.
      const directTaxes = Math.min(
        c.marketIncome,
        (c.marketIncome * (incomeTaxRate(taxes, tier) + regionalRate)) / 100
      );
      const employeeContributions = Math.min(
        c.marketIncome - directTaxes,
        (c.labour * taxes.payrollTax! * model.employeePayrollShare) / 100
      );
      cells.push({
        id: c.id,
        sourceArea: c.sourceArea,
        adults: c.adults,
        children: c.children,
        households: c.households,
        marketIncome: c.marketIncome,
        directTaxes,
        employeeContributions,
      });
      market += c.marketIncome * c.households;
      direct += directTaxes * c.households;
      payroll += employeeContributions * c.households;
    }
  } catch {
    return fail("invalid-current-income-tax-rates");
  }
  const regions = model.regions.map((base) => ({
    regionId: base.regionId,
    householdResidents: raw
      .filter((c) => c.regionId === base.regionId)
      .reduce((s, c) => s + c.households * (c.adults + c.children), 0),
    consumerPriceIndex: (100 * activity.get(base.regionId)!.costOfLiving) / base.costOfLiving,
  }));
  if (
    regions.some(
      (r) =>
        !Number.isFinite(r.householdResidents) ||
        r.householdResidents <= 0 ||
        r.householdResidents > activity.get(r.regionId)!.population ||
        !Number.isFinite(r.consumerPriceIndex) ||
        r.consumerPriceIndex <= 0
    ) ||
    ![market, direct, payroll].every(Number.isFinite)
  )
    return fail("unreconciled-modeled-population-or-income");
  const cellsByKey = new Map(cells.map((c) => [JSON.stringify([c.sourceArea, c.id]), c]));
  const programRoles: HouseholdCurrentState["programRoles"][number][] = [];
  for (const role of model.programRoles) {
    if (role.role !== "cash") {
      programRoles.push(role);
      continue;
    }
    const rule = role.eligibilityModel;
    if (
      !rule ||
      !role.recipients ||
      !["fixed-reference-groups", "maximum-modeled-market-income"].includes(rule.kind)
    )
      return fail("missing-reviewed-benefit-eligibility-model");
    if (
      rule.kind === "maximum-modeled-market-income" &&
      (!Number.isFinite(rule.annualPerAssessmentUnit) ||
        rule.annualPerAssessmentUnit < 0 ||
        typeof rule.indexedToPrices !== "boolean")
    )
      return fail("invalid-benefit-income-threshold");
    const recipients = [];
    for (const recipient of role.recipients) {
      const cell = cellsByKey.get(JSON.stringify([recipient.sourceArea, recipient.id]));
      if (!cell) return fail("invalid-cash-recipient-roster");
      let eligibility = recipient.eligibility;
      if (rule.kind === "maximum-modeled-market-income") {
        const base = areas.get(cell.sourceArea)!;
        const priceFactor = rule.indexedToPrices
          ? activity.get(base.regionId)!.costOfLiving / base.costOfLiving
          : 1;
        if (
          cell.marketIncome / Math.max(1, cell.adults) >
          rule.annualPerAssessmentUnit * priceFactor
        )
          eligibility = 0;
      }
      recipients.push({ ...recipient, eligibility });
    }
    programRoles.push({ ...role, recipients });
  }
  return {
    gaps: [],
    current: {
      incomeBasis: "modeled-economic-income",
      worldId: input.worldId,
      countryId: ref.countryId,
      currency: ref.currency,
      turn: input.turn,
      year: input.year,
      priceBaseYear: model.year,
      ownerId: `${model.sourceId}:income-model-v1`,
      referenceSourceId: ref.sourceId,
      basketSourceId: `${model.sourceId}:regional-price-ratio`,
      regions,
      geography: [...areas].map(([sourceArea, base]) => ({ sourceArea, regionId: base.regionId })),
      cells,
      programRoles,
    },
    fiscalControls: {
      sourceId: `${model.sourceId}:modeled-tax-control-v1`,
      worldId: input.worldId,
      countryId: input.countryId,
      currency: ref.currency,
      turn: input.turn,
      population: "all-household-residents",
      basis: "modeled-household-flows",
      annualMarketIncome: market,
      annualDirectTaxes: direct,
      annualEmployeeContributions: payroll,
    },
  };
}
