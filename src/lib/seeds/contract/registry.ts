/**
 * The seed dataset registry. Every dataset that varies by preset names the
 * provider that returns its authored value for a preset, and the presets that
 * must provide one. Datasets that genuinely do not vary by era are declared
 * once with the reason.
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
import { REGION_TABLES } from "./regionTables";

export interface PresetDataset {
  readonly id: string;
  /** Presets that must provide an authored value. */
  readonly requiredIn: readonly SeedPresetId[];
  /** The authored value for `preset`, or undefined when there is none. */
  readonly provide: (preset: SeedPresetId) => unknown;
  /**
   * Reduces the value before the duplicate guard compares presets, for data
   * whose money is in a different unit in each era.
   */
  readonly fingerprint?: (value: unknown) => unknown;
}

export interface EraInvariantDataset {
  readonly id: string;
  readonly reason: string;
}

const ALL_PRESETS: readonly SeedPresetId[] = SEED_PRESET_IDS;

function tryProvide<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/** A national budget row reduced to GDP shares, so a currency change is not a new budget. */
function budgetFingerprint(value: unknown): unknown {
  const config = value as NationalBudgetSeedConfig;
  const share = (amount: number) => Number((amount / config.gdp).toPrecision(9));
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

/**
 * Per-country regional overlays (census, metric presets, population anchors).
 * A country with a 2019 overlay needs its own in every preset, because no
 * preset may read the 2019 one; a country without any needs none.
 */
function overlayDatasets(
  kind: string,
  bundles: Readonly<Record<string, Partial<Record<string, unknown>> | undefined>>
): PresetDataset[] {
  return Object.entries(bundles).map(([countryId, byPreset]) => ({
    id: `${kind}:${countryId}`,
    requiredIn: byPreset?.["2019-default"] ? ALL_PRESETS : [],
    provide: (preset) => byPreset?.[preset],
  }));
}

export const PRESET_DATASETS: readonly PresetDataset[] = [
  ...overlayDatasets("census", CENSUS_BUNDLES),
  ...overlayDatasets("metricPresets", METRIC_PRESET_BUNDLES),
  ...overlayDatasets("populationAnchors", POPULATION_ANCHOR_BUNDLES),
  ...Object.entries(REGION_TABLES).map(([countryId, entry]): PresetDataset => ({
    id: `regions:${countryId}`,
    requiredIn: entry.seededIn,
    provide: (preset) => entry.table[preset],
  })),
  ...BUDGET_COUNTRIES.map((countryId): PresetDataset => ({
    id: `budget:${countryId}`,
    requiredIn: [],
    provide: budgetFor(countryId),
    fingerprint: budgetFingerprint,
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
