/**
 * Loads the technology diffusion snapshot (lib/constants/techTree/diffusion):
 * each country's readiness from its regions' R&D intensity, tertiary
 * attainment and export share plus its energy balance, and the countries
 * where each tiered method already runs.
 *
 * Four projected reads in parallel. Command and query paths pass the one
 * country they price; the NPP turn phases read every country at once and may
 * pass the sector rows they already hold so the operator scan is free.
 */
import type { Db, Filter } from "mongodb";
import type { CommodityPrice, CorporateSector } from "@/lib/db/types";
import type { State } from "@/lib/db/types/state";
import type { StateMetrics } from "@/lib/db/types/stateMetrics";
import { SECTOR_STRATEGIES } from "@/lib/constants/sectorStrategies";
import {
  computeTechReadiness,
  operatorCountriesByStrategy,
  presetUsesTechDiffusion,
  weightedMean,
  type DiffusionAdopter,
  type TechDiffusionSnapshot,
} from "@/lib/constants/techTree/diffusion";
import type { StrategyDiffusionWorld } from "@/lib/constants/techTree/strategyAvailability";
import { statesCollection } from "@/lib/db/repositories/states";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";
import { commodityPricesCollection } from "@/lib/db/repositories/commodityPrices";

/** Every method with a tier: the only ones diffusion can delay. */
const TIERED_STRATEGY_IDS: readonly string[] = [
  ...new Set(
    Object.values(SECTOR_STRATEGIES)
      .flat()
      .filter((strategy) => strategy.minDecade)
      .map((strategy) => strategy.id)
  ),
];

type OperatorRow = Pick<CorporateSector, "strategyId" | "countryId" | "mothballed">;

export async function loadTechDiffusionSnapshot(
  db: Db,
  options: { countryIds?: readonly string[]; sectors?: Iterable<OperatorRow> } = {}
): Promise<TechDiffusionSnapshot> {
  const countryFilter = options.countryIds ? { countryId: { $in: [...options.countryIds] } } : {};
  const [states, metrics, energy, operatorRows] = await Promise.all([
    statesCollection(db)
      .find(countryFilter as Filter<State>, { projection: { countryId: 1, population: 1 } })
      .toArray(),
    macroMetricsCollection(db)
      .find(countryFilter as Filter<StateMetrics>, {
        projection: {
          countryId: 1,
          "economic.rdIntensity.value": 1,
          "economic.exportDependency.value": 1,
          "population.tertiaryAttainment.value": 1,
        },
      })
      .toArray(),
    commodityPricesCollection(db).findOne(
      { commodity: "energy" },
      { projection: { stateSupply: 1, stateDemand: 1 } }
    ),
    options.sectors
      ? Promise.resolve(null)
      : corporateSectorsCollection(db)
          .aggregate<{ _id: { strategyId: string; countryId: string } }>([
            {
              $match: {
                strategyId: { $in: TIERED_STRATEGY_IDS },
                mothballed: { $ne: true },
              },
            },
            { $group: { _id: { strategyId: "$strategyId", countryId: "$countryId" } } },
          ])
          .toArray(),
  ]);

  const metricsById = new Map(metrics.map((doc) => [String(doc._id), doc]));
  const statesByCountry = new Map<string, Pick<State, "_id" | "population">[]>();
  for (const state of states) {
    if (!state.countryId) continue;
    const list = statesByCountry.get(state.countryId) ?? [];
    list.push(state);
    statesByCountry.set(state.countryId, list);
  }

  const readinessByCountry = new Map<string, number>();
  for (const [countryId, countryStates] of statesByCountry) {
    const rows = countryStates.map((state) => ({
      doc: metricsById.get(String(state._id)),
      weight: state.population ?? 0,
    }));
    let supply = 0;
    let demand = 0;
    for (const state of countryStates) {
      supply += energy?.stateSupply?.[state._id] ?? 0;
      demand += energy?.stateDemand?.[state._id] ?? 0;
    }
    readinessByCountry.set(
      countryId,
      computeTechReadiness({
        rdIntensityPct: weightedMean(
          rows.map((row) => ({ value: row.doc?.economic?.rdIntensity?.value, weight: row.weight }))
        ),
        tertiaryAttainmentPct: weightedMean(
          rows.map((row) => ({
            value: row.doc?.population?.tertiaryAttainment?.value,
            weight: row.weight,
          }))
        ),
        exportSharePct: weightedMean(
          rows.map((row) => ({
            value: row.doc?.economic?.exportDependency?.value,
            weight: row.weight,
          }))
        ),
        energySupplyRatio: demand > 0 ? supply / demand : undefined,
      })
    );
  }

  const operators = operatorRows
    ? operatorCountriesByStrategy(
        operatorRows.map((row) => ({
          strategyId: row._id.strategyId,
          countryId: row._id.countryId,
        }))
      )
    : operatorCountriesByStrategy(options.sectors ?? []);

  return { readinessByCountry, operatorCountriesByStrategy: operators };
}

/**
 * The diffusion context for one company's sector, or undefined when the world
 * has not opted in or tech trees are off (one country read).
 */
export async function loadStrategyDiffusionWorld(
  db: Db,
  input: {
    preset: string | undefined;
    techTreesEnabled: boolean;
    countryId: string | undefined;
    adopter: DiffusionAdopter;
  }
): Promise<StrategyDiffusionWorld | undefined> {
  if (!input.techTreesEnabled || !presetUsesTechDiffusion(input.preset) || !input.countryId) {
    return undefined;
  }
  const snapshot = await loadTechDiffusionSnapshot(db, { countryIds: [input.countryId] });
  return { snapshot, countryId: input.countryId, adopter: input.adopter };
}
