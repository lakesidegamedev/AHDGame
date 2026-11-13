/**
 * Runs the seed contract for a preset: coverage (every required dataset is
 * authored), the duplicate guard (no dataset is a copy of another preset's),
 * the scale guard (money sits in bands for the preset's own economy) and the
 * schemas of the generated data files.
 * Pure: reads authored data only, never the database.
 */

import {
  SEED_PRESET_IDS,
  getStartingYearForPreset,
  type SeedPresetId,
} from "@/lib/constants/turnTime";
import {
  getCountryIdForCurrency,
  getSeedCurrencyCode,
  INITIAL_RATES_BY_PRESET,
} from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";
import type { CurrencyCode } from "@/lib/constants/currencyCodes";
import { NATIONAL_SCOPE_IDS } from "@/lib/constants/nationalScope";
import { getEraNominalScale } from "@/lib/constants/sectorSeedEra";
import { eraPriceLevelFor } from "@/lib/campaigns/rules/priceLevel";
import { shouldReconcileStateGdpForPreset } from "@/lib/admin/seed/reconcileStateGdp";
import { getNationalBudgetSeedConfigsForPreset } from "@/lib/seeds/reference/budgets";
import { GDP_DENOMINATION_1953 } from "@/lib/seeds/reference/gdpDenomination";
import { dataPresetFor } from "@/lib/seeds/presetSelector";
import { PRESET_DATASETS, simulatesRegions, type PresetDataset } from "./registry";
import { REGION_TABLES, type CountryRegionTable } from "./regionTables";
import { SeedContractError, type SeedContractGap } from "./seedContractError";
import { checkSeedDataFiles } from "./dataFiles";
import { DUPLICATE_SIMILARITY_THRESHOLD, numericSimilarity } from "./rules/similarity";
import {
  checkBudgetScale,
  checkCommodityPriceLevel,
  checkDollarIncome,
  checkRegionalTotals,
  type BudgetScaleInput,
  type ScaleFinding,
} from "./rules/scale";
import { CURRENCY_UNIT_EXCEPTIONS, isCurrencyValidAt } from "./rules/currencyValidity";

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function coverageGaps(preset: SeedPresetId): SeedContractGap[] {
  return PRESET_DATASETS.filter(
    (dataset) => dataset.requiredIn.includes(preset) && dataset.provide(preset) == null
  ).map((dataset) => ({
    dataset: dataset.id,
    detail: `no authored value for ${preset}`,
  }));
}

function duplicateGap(dataset: PresetDataset, preset: SeedPresetId): SeedContractGap | null {
  if (dataset.regionalCountry && !simulatesRegions(preset, dataset.regionalCountry)) return null;
  const own = dataset.provide(preset);
  if (isEmpty(own)) return null;
  const year = getStartingYearForPreset(preset);
  const reduce = (value: unknown) =>
    dataset.fingerprint ? dataset.fingerprint(value, preset) : value;
  const mine = reduce(own);
  for (const other of SEED_PRESET_IDS) {
    if (getStartingYearForPreset(other) >= year) continue;
    const theirs = dataset.provide(other);
    if (isEmpty(theirs)) continue;
    const similarity = own === theirs ? 1 : numericSimilarity(mine, reduce(theirs));
    if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD) {
      return {
        dataset: dataset.id,
        detail: `${(similarity * 100).toFixed(0)}% identical to ${other}; author values for ${preset}`,
      };
    }
  }
  return null;
}

function scaleGap(dataset: string, finding: ScaleFinding): SeedContractGap {
  return {
    dataset: `${dataset}:${finding.countryId}`,
    detail: `${finding.check}: ${finding.detail}`,
  };
}

/**
 * Campaign income and cost scalars divide by a state's GDP and population, so
 * every state of every country the preset simulates must carry finite positive
 * figures of its own.
 */
export function stateFigureGaps(
  preset: SeedPresetId,
  tables: Readonly<Record<string, CountryRegionTable>> = REGION_TABLES
): SeedContractGap[] {
  const gaps: SeedContractGap[] = [];
  for (const [countryId, entry] of Object.entries(tables)) {
    if (!entry.seededIn.includes(preset) || !simulatesRegions(preset, countryId)) continue;
    const rows = entry.table[preset];
    if (!rows) continue;
    for (const row of rows) {
      const bad = (["gdp", "population"] as const).filter(
        (field) =>
          !(typeof row[field] === "number" && Number.isFinite(row[field]) && row[field] > 0)
      );
      if (bad.length === 0) continue;
      gaps.push({
        dataset: `stateFigures:${countryId}`,
        detail: `${String(row._id)} has no finite positive ${bad.join(" and ")} for ${preset}`,
      });
    }
  }
  return gaps;
}

function scaleGaps(preset: SeedPresetId): SeedContractGap[] {
  const gaps: SeedContractGap[] = [];
  const startingYear = getStartingYearForPreset(preset);
  const rates = INITIAL_RATES_BY_PRESET[preset];
  const configs = getNationalBudgetSeedConfigsForPreset(preset);

  const inputs: BudgetScaleInput[] = configs.map((config) => ({
    countryId: config.countryId,
    gdp: config.gdp,
    population: config.population,
    spendingByCategory: config.baselineSpendingByCategory,
    stateGrants: config.baselineStateGrants,
    debtPrincipal: config.debt.principal,
    revenuePerCapitaByLaw: Object.fromEntries(
      (config.policyRevenueConfigs ?? [])
        .filter((row) => row.annualRevenuePerCapitaByOptionIndex)
        .map((row) => [row.legislationTypeId, row.annualRevenuePerCapitaByOptionIndex ?? []])
    ),
    // Euro members trade at the euro anchor's row, not their legacy one. A 1953
    // country whose GDP is stored in USD (GDP_DENOMINATION_1953) is already in
    // dollars, so dividing it by its local rate would misread it.
    lcuPerUsd:
      startingYear === 1953 && GDP_DENOMINATION_1953[config.countryId] === "usd"
        ? 1
        : rates?.[getCountryIdForCurrency(config.currencyCode as CurrencyCode)],
  }));
  for (const input of inputs) {
    for (const finding of checkBudgetScale(input)) gaps.push(scaleGap("budget", finding));
  }
  for (const finding of checkDollarIncome(inputs)) gaps.push(scaleGap("budget", finding));

  for (const config of configs) {
    const countryId = config.countryId as string;
    if (rates && rates[countryId as CountryId] == null) {
      gaps.push({ dataset: `fxRates:${countryId}`, detail: `no starting rate for ${preset}` });
    }
    const codes = new Set([
      config.currencyCode,
      getSeedCurrencyCode(countryId as CountryId, preset),
    ]);
    for (const code of codes) {
      if (CURRENCY_UNIT_EXCEPTIONS[countryId] || isCurrencyValidAt(code, startingYear)) continue;
      gaps.push({
        dataset: `currency:${countryId}`,
        detail: `${code} was not legal tender in ${startingYear}`,
      });
    }

    if (!simulatesRegions(preset, countryId)) continue;
    const regions = REGION_TABLES[countryId];
    const rows = regions?.seededIn.includes(preset) ? regions.table[preset] : undefined;
    if (!rows || rows.length === 0) continue;
    const scoped = rows.filter((row) => !NATIONAL_SCOPE_IDS.has(String(row._id)));
    for (const finding of checkRegionalTotals({
      countryId,
      nationalGdp: config.gdp,
      nationalPopulation: config.population,
      regionalGdpMillions: scoped.reduce((sum, row) => sum + (row.gdp ?? 0), 0),
      regionalPopulation: scoped.reduce((sum, row) => sum + (row.population ?? 0), 0),
      gdpReconciledAtSeed: shouldReconcileStateGdpForPreset(preset),
    })) {
      gaps.push(scaleGap("regions", finding));
    }
  }

  for (const finding of checkCommodityPriceLevel(
    getEraNominalScale(preset),
    eraPriceLevelFor(preset)
  )) {
    gaps.push({ dataset: "commodityPrices", detail: `${finding.check}: ${finding.detail}` });
  }
  return gaps;
}

/**
 * Every contract gap for `preset`, empty when it may seed. Aliases of the 2019
 * world are checked as 2019; an unknown preset is itself a gap.
 */
export function checkSeedContract(preset: string): SeedContractGap[] {
  const target = dataPresetFor(preset);
  if (!(SEED_PRESET_IDS as readonly string[]).includes(target)) {
    return [{ dataset: "preset", detail: `"${preset}" is not a shipping preset` }];
  }
  const id = target as SeedPresetId;
  const duplicates = PRESET_DATASETS.map((dataset) => duplicateGap(dataset, id)).filter(
    (gap): gap is SeedContractGap => gap !== null
  );
  return [
    ...coverageGaps(id),
    ...duplicates,
    ...scaleGaps(id),
    ...stateFigureGaps(id),
    ...checkSeedDataFiles(),
  ];
}

/** Throws `SeedContractError` listing every gap when `preset` may not seed. */
export function assertSeedContract(preset: string): void {
  const gaps = checkSeedContract(preset);
  if (gaps.length > 0) throw new SeedContractError(preset, gaps);
}
