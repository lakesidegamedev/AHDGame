/**
 * The seed dataset registry. Every dataset that varies by preset names the
 * provider that returns its authored value for a preset, and the presets that
 * must provide one. Datasets that genuinely do not vary by era are declared
 * once with the reason.
 *
 * Regional datasets are required and checked only where their country runs
 * the full simulation: a background country simulates no regions, so it needs
 * national figures only.
 *
 * Server-only: providers import every era's data as values.
 */

import { SEED_PRESET_IDS, type SeedPresetId } from "@/lib/constants/turnTime";
import { AUTHORED_ALIGNMENT } from "@/lib/constants/alignmentSeeds";
import { INITIAL_RATES_BY_PRESET } from "@/lib/constants/currencies";
import { seatGroupsFor } from "@/lib/constants/historicalSeats";
import { CANONICAL_REAL_ELECTION_YEARS_BY_PRESET } from "@/lib/elections/cycleAnchorContext";
import {
  getNationalBudgetSeedConfigsForPreset,
  type NationalBudgetSeedConfig,
} from "@/lib/seeds/reference/budgets";
import { CENSUS_BUNDLES } from "@/lib/seeds/regionCensusData";
import { METRIC_PRESET_BUNDLES } from "@/lib/seeds/metricPresets";
import { POPULATION_ANCHOR_BUNDLES } from "@/lib/seeds/populationAnchors";
import { COHORT_NATIONAL_SOURCE_1991 } from "@/lib/seeds/reference/cohortAgeSources1991";
import { backgroundCountriesFor, isBackgroundInPreset } from "@/lib/world/eraRoster";
import { background2027Scale, isAuthoredBackground2027 } from "@/lib/world/macro/background2027";
import { REGION_TABLES } from "./regionTables";

export interface PresetDataset {
  readonly id: string;
  /** Presets that must provide an authored value. */
  readonly requiredIn: readonly SeedPresetId[];
  /** The authored value for `preset`, or undefined when there is none. */
  readonly provide: (preset: SeedPresetId) => unknown;
  /**
   * Reduces the value before the duplicate guard compares it with other
   * presets', for data whose money is in a different unit in each era.
   * `preset` is the preset being checked.
   */
  readonly fingerprint?: (value: unknown, preset: SeedPresetId) => unknown;
  /** The country a regional dataset describes. */
  readonly regionalCountry?: string;
}

export interface EraInvariantDataset {
  readonly id: string;
  readonly reason: string;
}

const ALL_PRESETS: readonly SeedPresetId[] = SEED_PRESET_IDS;

/** False where the preset holds `countryId` as a background country. */
export function simulatesRegions(preset: SeedPresetId, countryId: string): boolean {
  return !isBackgroundInPreset(preset, countryId);
}

function tryProvide<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/**
 * A national budget row reduced to GDP shares, so a currency change is not a
 * new budget. A background country is compared on its national figures only.
 */
function budgetFingerprint(value: unknown, preset: SeedPresetId): unknown {
  const config = value as NationalBudgetSeedConfig;
  const share = (amount: number) => Number((amount / config.gdp).toPrecision(9));
  if (!simulatesRegions(preset, config.countryId)) {
    const spending = Object.values(config.baselineSpendingByCategory).reduce((a, b) => a + b, 0);
    return {
      population: config.population,
      spending: share(spending + config.baselineStateGrants),
      otherRevenue: share(config.otherRevenue),
      debt: share(config.debt.principal),
      interestRate: config.debt.interestRate,
      economicFactors: config.economicFactors,
    };
  }
  return {
    population: config.population,
    spending: Object.fromEntries(
      Object.entries(config.baselineSpendingByCategory).map(([key, amount]) => [key, share(amount)])
    ),
    stateGrants: share(config.baselineStateGrants),
    otherRevenue: share(config.otherRevenue),
    debt: share(config.debt.principal),
    interestRate: config.debt.interestRate,
    taxBaseRatios: config.taxBaseRatios,
    economicFactors: config.economicFactors,
  };
}

function budgetFor(countryId: string) {
  return (preset: SeedPresetId) =>
    getNationalBudgetSeedConfigsForPreset(preset).find((row) => row.countryId === countryId);
}

const BUDGET_COUNTRIES = [
  ...new Set(
    ALL_PRESETS.flatMap((preset) =>
      getNationalBudgetSeedConfigsForPreset(preset).map((row) => row.countryId as string)
    )
  ),
].sort();

/** Countries some preset holds outside the full simulation. */
const BACKGROUND_COUNTRIES = [
  ...new Set(ALL_PRESETS.flatMap((preset) => backgroundCountriesFor(preset) as string[])),
].sort();

/** Presets that seed `countryId`'s regions, which are the presets that read its overlays. */
function seededPresets(countryId: string): readonly SeedPresetId[] {
  return REGION_TABLES[countryId]?.seededIn ?? [];
}

/**
 * Per-country regional overlays (census, metric presets, population anchors).
 * A country with a 2019 overlay needs its own in every preset `readIn` returns,
 * because no preset may read the 2019 one; a country without any needs none.
 */
function overlayDatasets(
  kind: string,
  bundles: Readonly<Record<string, Partial<Record<string, unknown>> | undefined>>,
  readIn: (countryId: string) => readonly SeedPresetId[]
): PresetDataset[] {
  return Object.entries(bundles).map(([countryId, byPreset]) => ({
    id: `${kind}:${countryId}`,
    requiredIn: byPreset?.["2019-default"]
      ? readIn(countryId).filter((preset) => simulatesRegions(preset, countryId))
      : [],
    provide: (preset) => byPreset?.[preset],
    regionalCountry: countryId,
  }));
}

/** A dated 1991 age source replaces the census for cohort stocks. */
function censusReadIn(countryId: string): readonly SeedPresetId[] {
  const proxied = COHORT_NATIONAL_SOURCE_1991[countryId] !== undefined;
  return seededPresets(countryId).filter((preset) => !(proxied && preset === "1991-default"));
}

/** Population anchors only drive the 1991 era adjustment. */
function anchorReadIn(countryId: string): readonly SeedPresetId[] {
  return seededPresets(countryId).filter((preset) => preset === "1991-default");
}

export const PRESET_DATASETS: readonly PresetDataset[] = [
  ...overlayDatasets("census", CENSUS_BUNDLES, censusReadIn),
  ...overlayDatasets("metricPresets", METRIC_PRESET_BUNDLES, seededPresets),
  ...overlayDatasets("populationAnchors", POPULATION_ANCHOR_BUNDLES, anchorReadIn),
  ...Object.entries(REGION_TABLES).map(([countryId, entry]): PresetDataset => ({
    id: `regions:${countryId}`,
    requiredIn: entry.seededIn,
    provide: (preset) => entry.table[preset],
    regionalCountry: countryId,
  })),
  ...BUDGET_COUNTRIES.map((countryId): PresetDataset => ({
    id: `budget:${countryId}`,
    requiredIn: [],
    provide: budgetFor(countryId),
    fingerprint: budgetFingerprint,
  })),
  ...BACKGROUND_COUNTRIES.map((countryId): PresetDataset => ({
    id: `national:${countryId}`,
    requiredIn: ALL_PRESETS.filter((preset) => isBackgroundInPreset(preset, countryId)),
    provide: (preset) =>
      isAuthoredBackground2027(preset, countryId) ? background2027Scale(countryId) : undefined,
  })),
  {
    id: "fxRates",
    requiredIn: ALL_PRESETS,
    provide: (preset) => INITIAL_RATES_BY_PRESET[preset],
  },
  {
    id: "alignment",
    requiredIn: ALL_PRESETS,
    provide: (preset) => AUTHORED_ALIGNMENT[preset],
  },
  {
    id: "electionAnchors",
    requiredIn: ALL_PRESETS,
    provide: (preset) => CANONICAL_REAL_ELECTION_YEARS_BY_PRESET[preset],
  },
  {
    id: "seatRoster",
    requiredIn: ALL_PRESETS,
    provide: (preset) => tryProvide(() => seatGroupsFor(preset)),
  },
];

export const ERA_INVARIANT_DATASETS: readonly EraInvariantDataset[] = [
  {
    id: "nppNamePools",
    reason: "Names follow a country's languages, not its era; modern given names are era-gated.",
  },
  {
    id: "commodityBasePrices",
    reason:
      "One relative price table, scaled to each era's price level and checked by the scale guard.",
  },
  {
    id: "currencyCodes",
    reason:
      "One code per country, overridden per preset where it changed; checked against legal-tender windows.",
  },
];
