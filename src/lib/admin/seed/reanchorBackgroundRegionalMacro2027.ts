import type { Db, Document } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { COUNTRY_ORDER } from "@/lib/constants/countries";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";
import { stateBaselinesCollection } from "@/lib/db/repositories/stateBaselines";
import { statesCollection } from "@/lib/db/repositories/states";
import { isBackgroundInPreset } from "@/lib/world/eraRoster";
import { reanchorRegionalMacro, type RegionMacroInput } from "./rules/reanchorRegionalMacro";

interface MacroRow {
  _id: string;
  economic?: { medianIncome?: { value?: number }; gdpGrowth?: { value?: number } };
}

/**
 * Background countries have national 2027 budgets and regional metric rows from
 * an earlier era. After the budgets exist, bring each country's regional
 * income and growth, and the baselines they drift back to, onto its budget.
 */
export async function reanchorBackgroundRegionalMacro2027(
  db: Db,
  preset: string,
  log: (message: string) => void
): Promise<void> {
  if (preset !== "2027-default") return;
  const countries = COUNTRY_ORDER.filter((countryId) => isBackgroundInPreset(preset, countryId));
  const budgets = await federalBudgetCollection(db)
    .find({ countryId: { $in: countries } })
    .project<{ countryId: CountryId; gdp?: number; economicFactors?: { gdpGrowth?: number } }>({
      countryId: 1,
      gdp: 1,
      "economicFactors.gdpGrowth": 1,
    })
    .toArray();
  const states = await statesCollection<Document>(db)
    .find({ countryId: { $in: countries } })
    .project<{ _id: string; countryId: CountryId; population?: number }>({
      countryId: 1,
      population: 1,
    })
    .toArray();
  const metrics = await macroMetricsCollection<Document>(db)
    .find({ _id: { $in: states.map((state) => String(state._id)) } as never })
    .project<MacroRow>({ "economic.medianIncome.value": 1, "economic.gdpGrowth.value": 1 })
    .toArray();
  const metricById = new Map(metrics.map((row) => [String(row._id), row]));

  const metricWrites = [];
  const baselineWrites = [];
  const touched: string[] = [];
  for (const budget of budgets) {
    const regions: RegionMacroInput[] = states
      .filter((state) => state.countryId === budget.countryId)
      .flatMap((state) => {
        const row = metricById.get(String(state._id));
        const medianIncome = row?.economic?.medianIncome?.value;
        const gdpGrowth = row?.economic?.gdpGrowth?.value;
        if (typeof medianIncome !== "number" || typeof gdpGrowth !== "number") return [];
        return [
          { id: String(state._id), population: state.population ?? 0, medianIncome, gdpGrowth },
        ];
      });
    const patches = reanchorRegionalMacro({
      nationalGdp: budget.gdp ?? 0,
      nationalGrowth: budget.economicFactors?.gdpGrowth ?? null,
      regions,
    });
    if (patches.length === 0) continue;
    touched.push(budget.countryId);
    for (const patch of patches) {
      const metricSet: Record<string, number> = {};
      const baselineSet: Record<string, number> = {};
      if (patch.medianIncome !== undefined) {
        metricSet["economic.medianIncome.value"] = patch.medianIncome;
        baselineSet["baselines.economic.medianIncome"] = patch.medianIncome;
      }
      if (patch.gdpGrowth !== undefined) {
        metricSet["economic.gdpGrowth.value"] = patch.gdpGrowth;
        baselineSet["baselines.economic.gdpGrowth"] = patch.gdpGrowth;
      }
      metricWrites.push({ updateOne: { filter: { _id: patch.id }, update: { $set: metricSet } } });
      baselineWrites.push({
        updateOne: { filter: { _id: patch.id }, update: { $set: baselineSet } },
      });
    }
  }
  if (metricWrites.length > 0) {
    await macroMetricsCollection<Document>(db).bulkWrite(metricWrites as never);
    await stateBaselinesCollection<Document>(db).bulkWrite(baselineWrites as never);
  }
  log(
    `Re-anchored regional income and growth for ${touched.length} background countries` +
      (touched.length > 0 ? ` (${touched.join(", ")})` : "")
  );
}
