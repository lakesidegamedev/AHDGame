/** Compare fertility ceilings on aggregate external snapshots, without database access. */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { RESET_V2_COUNTRIES } from "../../src/lib/resetVersions/rules";
import { demographicReceiptInputSchema, simulateReceiptTiming } from "./demographicReceiptTiming";

const countryInputs = z.array(
  z.object({
    country: z.enum(RESET_V2_COUNTRIES),
    basis: z.string().min(1),
    input: demographicReceiptInputSchema,
  })
);

export function compareFertilityCeilings(raw: unknown, years = 50) {
  const countries = countryInputs.parse(raw);
  if (
    countries.length !== RESET_V2_COUNTRIES.length ||
    new Set(countries.map((c) => c.country)).size !== countries.length
  )
    throw Error("Supply every supported country exactly once");
  if (new Set(countries.map((c) => c.input.turn)).size !== 1) throw Error("Source turns differ");
  return {
    years,
    sourceTurn: countries[0]!.input.turn,
    assumptions: [
      "Paired runs share identical starting cohorts, mortality, migration and economic inputs.",
      "Current-pressure arms hold captured funded pressure fixed; maximum-pressure arms assume sustained +1.2 pressure, not additional enacted laws.",
      "Independent successor countries without live inputs use explicitly labeled inherited-territory sensitivities.",
      "Positive ceiling changes do not alter negative-pressure penalties, the 2% per-turn response or the absolute fertility bounds.",
      "This is a cohort sensitivity, not an integrated fiscal, labour, housing or migration-policy forecast.",
    ],
    countries: countries.map((country) => ({
      country: country.country,
      basis: country.basis,
      regions: country.input.regions.length,
      migrationPct: country.input.observedMigrationPct,
      pressureRange: [
        Math.min(...country.input.regions.map((r) => r.currentPressure)),
        Math.max(...country.input.regions.map((r) => r.currentPressure)),
      ],
      arms: ["current", "maximum"].flatMap((pressure) =>
        [0.24, 0.32, 0.4].map((maxBoost) => {
          const input =
            pressure === "current"
              ? country.input
              : {
                  ...country.input,
                  regions: country.input.regions.map((r) => ({ ...r, currentPressure: 1.2 })),
                };
          const scenario = simulateReceiptTiming(input, years, { maxBoost, currentOnly: true })
            .scenarios[0]!;
          return { pressure, maxBoost, ...scenario };
        })
      ),
    })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output, years = "50"] = process.argv.slice(2);
  if (!input || !output) throw Error("Supply external input.json and output.json paths");
  const result = compareFertilityCeilings(JSON.parse(readFileSync(input, "utf8")), Number(years));
  writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(
    JSON.stringify(
      result.countries.map((c) => ({
        country: c.country,
        basis: c.basis,
        arms: c.arms.map((a) => ({
          pressure: a.pressure,
          ceiling: a.maxBoost,
          year1: a.annual[0]?.yearGrowthPct,
          year10: a.annual[9]?.yearGrowthPct,
          year50: a.annual[49]?.yearGrowthPct,
          changePct: a.changePct,
          fertilityMin: a.annual.at(-1)?.fertilityMin,
          fertilityMax: a.annual.at(-1)?.fertilityMax,
        })),
      })),
      null,
      2
    )
  );
}
