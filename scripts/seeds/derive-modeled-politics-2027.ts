/** Regenerate the modeled 2027 opening with: node --import tsx scripts/seeds/derive-modeled-politics-2027.ts --write */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CountryGeography } from "@/lib/countries/contract";
import type { CountryId } from "@/lib/constants/countries";
import type { State, StateMetrics } from "@/lib/db/types";
import { POLITICAL_METRIC_COUNTRY_IDS, type PoliticalMetricId } from "@/lib/politicalMetrics/types";
import { getNonPlayableBoards } from "@/lib/politicalMetrics/seeds/nonPlayableBoards";
import { loadSeededStateMetrics } from "@/lib/states/conditions/seedMetricsLoader";
import { deriveCountryBoard } from "@/lib/politicalMetrics/derive/deriveFamilies";
import { countryLeanFromParties } from "@/lib/politicalMetrics/derive/countryLean";
import { partySeedsForPreset } from "@/lib/seeds/partySeedRegistry";
import { cnRegions2027 } from "@/lib/seeds/cn/cnRegions2027";
import { huStateMetrics2027 } from "@/lib/countries/hu/data/huStateMetrics2027";
import { loadModernTransitionMetricsBundle } from "@/lib/admin/seed/seedModernTransitionCountries";
import {
  APPROVAL_AFFINITY_WEIGHT,
  APPROVAL_OBJECTIVE_WEIGHT,
  affinityScore,
  objectiveScore,
} from "@/lib/politicalLegislation/rules/approval";

const seedRequire = createRequire(resolve("package.json"));
const preset = "2027-default";

async function metricsFor(country: CountryId): Promise<StateMetrics[]> {
  if (country === "PL" || country === "RO" || country === "BG") {
    return loadModernTransitionMetricsBundle(country, preset);
  }
  if (country === "HU") return huStateMetrics2027;
  return loadSeededStateMetrics(country, preset);
}

async function main() {
  const output = {
    basis:
      "Modeled 2027 opening: existing authored regional metrics and party roster, era-aware derivation, nearest authored defense board. Not a certified forecast.",
    boards: {} as Record<string, Record<string, Record<PoliticalMetricId, number>>>,
    neutrals: {} as Record<string, number>,
    populations: {} as Record<string, Record<string, number>>,
  };
  for (const country of Object.keys(getNonPlayableBoards()["2019-default"]) as CountryId[]) {
    if ((POLITICAL_METRIC_COUNTRY_IDS as readonly string[]).includes(country)) continue;
    const countryModule = seedRequire(
      resolve(`src/lib/countries/${country.toLowerCase()}/geography.ts`)
    ) as Record<string, CountryGeography>;
    const geography = countryModule[`${country}_GEOGRAPHY`];
    const regions: State[] =
      country === "CN"
        ? cnRegions2027
        : (geography?.regionBundles[preset] ?? geography?.regionBundles["2019-default"] ?? []);
    const metrics = await metricsFor(country);
    // No authored modern regional substrate means no invented country board.
    if (!regions.length || !metrics.length) continue;
    const populations = new Map(regions.map((r) => [String(r._id), r.population]));
    const boards: Record<string, Record<PoliticalMetricId, number>> = {};
    let weighted = 0;
    let total = 0;
    const lean = countryLeanFromParties(partySeedsForPreset(country, preset), preset);
    for (const metric of metrics) {
      const id = String(metric._id);
      if (!populations.has(id)) continue;
      const flat: Record<string, number> = {};
      for (const [category, values] of Object.entries(metric)) {
        if (!values || typeof values !== "object") continue;
        for (const [key, value] of Object.entries(values)) {
          const n = (value as { value?: number } | null)?.value;
          if (typeof n === "number" && Number.isFinite(n)) flat[`${category}.${key}`] = n;
        }
      }
      const derived = deriveCountryBoard({
        countryId: country,
        legacy: flat,
        macro: flat,
        year: 2027,
        lean,
      });
      if (derived.unauthored.length) throw new Error(`Missing ${country} political inputs`);
      const board = Object.fromEntries(
        Object.entries(derived.values).map(([key, family]) => [
          key,
          Math.round(family.value * 10) / 10,
        ])
      ) as Record<PoliticalMetricId, number>;
      boards[id] = board;
      const population = populations.get(id)!;
      weighted +=
        (APPROVAL_OBJECTIVE_WEIGHT * objectiveScore(board) +
          APPROVAL_AFFINITY_WEIGHT * affinityScore(board, 0)) *
        population;
      total += population;
    }
    if (Object.keys(boards).length !== populations.size)
      throw new Error(`Incomplete ${country} coverage`);
    output.boards[country] = boards;
    output.neutrals[country] = Math.round((weighted / total) * 100) / 100;
    output.populations[country] = Object.fromEntries(populations);
  }
  if (process.argv.includes("--write")) {
    writeFileSync(
      resolve("src/lib/politicalMetrics/seeds/modeledApprovalNeutrals2027.json"),
      JSON.stringify(output.neutrals, null, 2) + "\n"
    );
    writeFileSync(
      resolve("src/lib/politicalMetrics/seeds/modeledOpening2027.json"),
      JSON.stringify(output, null, 2) + "\n"
    );
  }
  console.log(
    JSON.stringify({ countries: Object.keys(output.boards).length, neutrals: output.neutrals })
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
