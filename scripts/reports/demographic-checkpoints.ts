/**
 * Long-run demographic checkpoint tables for US, UK, DE, JP and CN.
 *
 * Run: npx tsx scripts/reports/demographic-checkpoints.ts [--json]
 *
 * Opening, 2030, 2035, 2040, 2045 and 2050 population, median age,
 * dependency ratio and workforce, from the seeded 2027 regions advanced
 * through the demographic flow rules. Deterministic, no database, no world
 * simulation. The pass/fail version is
 * `src/lib/demographics/rules/longRunCheckpoints.test.ts`.
 */
import {
  CHECKPOINT_COUNTRIES,
  loadOpeningRegions,
} from "../../src/lib/demographics/longRunCheckpointInputs";
import {
  projectCheckpoints,
  renderCheckpointTable,
} from "../../src/lib/demographics/rules/longRunCheckpoints";

async function main(): Promise<void> {
  const runs = [];
  for (const country of CHECKPOINT_COUNTRIES) {
    const { regions } = await loadOpeningRegions(country);
    runs.push(projectCheckpoints({ countryId: country, regions }));
  }
  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify(
        runs.map((r) => ({ countryId: r.countryId, national: r.national })),
        null,
        2
      )
    );
    return;
  }
  for (const run of runs) process.stdout.write(`${renderCheckpointTable(run)}\n\n`);
}

void main();
