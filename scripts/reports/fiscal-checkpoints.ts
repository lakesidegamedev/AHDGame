/**
 * Long-run fiscal checkpoint tables for US, UK, DE, JP and CN.
 *
 * Run: npx tsx scripts/reports/fiscal-checkpoints.ts [--json]
 *
 * Opening, 2030, 2035, 2040, 2045 and 2050 GDP, growth, inflation, policy
 * rate, debt ratio and interest share of revenue from the opening 2027 books
 * and the authored macro arc. Deterministic, no database, no world
 * simulation. The pass/fail version is
 * `src/lib/budget/rules/fiscalCheckpoints.test.ts`.
 */
import {
  FISCAL_CHECKPOINT_COUNTRIES,
  fiscalOpening,
  macroAtFor,
} from "../../src/lib/budget/fiscalCheckpointInputs";
import {
  projectFiscalCheckpoints,
  renderFiscalTable,
} from "../../src/lib/budget/rules/fiscalCheckpoints";

const runs = FISCAL_CHECKPOINT_COUNTRIES.map((country) => ({
  country,
  run: projectFiscalCheckpoints({ opening: fiscalOpening(country), macroAt: macroAtFor(country) }),
}));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(runs, null, 2));
} else {
  for (const { country, run } of runs) {
    process.stdout.write(`${renderFiscalTable(country, run)}\n`);
    const events = run.events.filter((e) => e.kind === "restructuring");
    if (events.length > 0) {
      process.stdout.write(`\nRestructuring years: ${events.map((e) => e.year).join(", ")}\n`);
    }
    process.stdout.write("\n");
  }
}
