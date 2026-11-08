/**
 * Turn shell that reads the country readings the wave families gate on. Two
 * reads cover every country and every family; a per-turn cache lets all the
 * families share them.
 */
import type { Db } from "mongodb";
import type { PoliticalMetricsDoc } from "@/lib/db/types/politicalMetrics";
import { EMPTY_WAVE_SIGNALS } from "./rules/waveFamilies";
import type { WaveSignals } from "./rules/waveFamilyTables";

export interface WaveSignalCache {
  byCountry?: Promise<Map<string, WaveSignals>>;
}

interface MacroRow {
  countryId?: string;
  economic?: {
    rdIntensity?: { value?: number };
    unemploymentRate?: { value?: number };
    gdpGrowth?: { value?: number };
  };
  population?: { urbanizationRate?: { value?: number }; migrationRate?: { value?: number } };
  governance?: { debtToGdp?: { value?: number } };
}

const BOARD_KEYS: Array<[keyof WaveSignals, string]> = [
  ["healthPrevention", "health.prevention"],
  ["healthEfficiency", "health.systemEfficiency"],
  ["utilities", "infrastructure.utilities"],
  ["stewardship", "environment.stewardship"],
  ["integration", "society.integration"],
  ["openness", "governance.openness"],
  ["integrity", "governance.integrity"],
  ["energySecurity", "environment.energySecurity"],
];

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const mean = (values: Array<number | undefined>): number | null => {
  const kept = values.filter(finite);
  return kept.length === 0 ? null : kept.reduce((sum, value) => sum + value, 0) / kept.length;
};

async function readSignals(db: Db, countryIds: string[]): Promise<Map<string, WaveSignals>> {
  const [macro, boards] = await Promise.all([
    db
      .collection<MacroRow>("macroMetrics")
      .find(
        { countryId: { $in: countryIds } },
        {
          projection: {
            _id: 0,
            countryId: 1,
            "economic.rdIntensity.value": 1,
            "economic.unemploymentRate.value": 1,
            "economic.gdpGrowth.value": 1,
            "population.urbanizationRate.value": 1,
            "population.migrationRate.value": 1,
            "governance.debtToGdp.value": 1,
          },
        }
      )
      .toArray(),
    // Board values are keyed by dotted ids, so read the whole values record.
    db
      .collection<Pick<PoliticalMetricsDoc, "countryId" | "values">>("politicalMetrics")
      .find({ countryId: { $in: countryIds } } as never, {
        projection: { _id: 0, countryId: 1, values: 1 },
      })
      .toArray(),
  ]);
  const result = new Map<string, WaveSignals>();
  for (const countryId of countryIds) {
    const rows = macro.filter((row) => row.countryId === countryId);
    const local = boards.filter((row) => row.countryId === countryId);
    const signals: WaveSignals = {
      ...EMPTY_WAVE_SIGNALS,
      rdIntensity: mean(rows.map((row) => row.economic?.rdIntensity?.value)),
      unemployment: mean(rows.map((row) => row.economic?.unemploymentRate?.value)),
      gdpGrowth: mean(rows.map((row) => row.economic?.gdpGrowth?.value)),
      urbanization: mean(rows.map((row) => row.population?.urbanizationRate?.value)),
      migrationRate: mean(rows.map((row) => row.population?.migrationRate?.value)),
      debtToGdp: mean(rows.map((row) => row.governance?.debtToGdp?.value)),
    };
    for (const [name, boardKey] of BOARD_KEYS) {
      signals[name] = mean(
        local.map((row) => (row.values as Record<string, number> | undefined)?.[boardKey])
      );
    }
    result.set(countryId, signals);
  }
  return result;
}

/** Readings per country, read once per turn however many families ask. */
export function loadWaveSignals(
  db: Db,
  countryIds: string[],
  cache: WaveSignalCache
): Promise<Map<string, WaveSignals>> {
  cache.byCountry ??=
    countryIds.length === 0 ? Promise.resolve(new Map()) : readSignals(db, countryIds);
  return cache.byCountry;
}
