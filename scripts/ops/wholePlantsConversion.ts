/**
 * WHOLE PLANTS CONVERSION — recount every sector to whole plants.
 *
 * DRY RUN BY DEFAULT. Without --apply this script only reads: it prints what
 * the conversion would do and writes nothing (not even a heal token).
 *
 *   MONGODB_URI='mongodb://...' npx tsx scripts/ops/wholePlantsConversion.ts
 *   MONGODB_URI='mongodb://...' npx tsx scripts/ops/wholePlantsConversion.ts --apply --env prod --confirm-prod
 *
 *   --apply          run it, through the heal runner: plan, confirm token,
 *                    per-document snapshot to healBackups, apply, verify
 *   --env <env>      dev | sandbox | prod (default sandbox), recorded on the run
 *   --confirm-prod   required with --env prod
 *   --json           print the dry-run report as JSON
 *
 * Refuses while gameState.isProcessing is set. Run it between turns, then
 * switch gameConfig.wholePlantsStage to 1 before the next turn starts. A turn
 * that runs with the stage off erodes the stock back to part-plants.
 *
 * Rollback: `npx tsx scripts/remediation/cli.ts rollback <runId>` restores
 * every snapshotted sector and owner; then delete the tx rows with
 * `meta.wholePlantConversion: true` and `meta.conversionTurn` = the run's turn.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { MongoClient } from "mongodb";
import { resolveMongoDbName } from "@/lib/mongodb";
import { runApply, runPlan } from "@/lib/remediation/runner";
import {
  buildConversionReport,
  defect,
  type ConversionReport,
} from "@/lib/remediation/defects/AHD-whole-plants-conversion";
import type { HealEnv } from "@/lib/remediation/types";

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function option(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const money = (anchor: number) => `₳${Math.round(anchor).toLocaleString("en-US")}`;

function printReport(report: ConversionReport): void {
  const t = report.totals;
  console.log(`Whole plants conversion, turn ${report.turn}`);
  console.log(`  sectors scanned (stock or queue): ${report.sectorsScanned}`);
  console.log(`  sectors to recount:               ${report.conversions.length}`);
  console.log(`  plants before (floored) / after:  ${t.plantsBefore} / ${t.plantsAfter}`);
  console.log(`  sectors below one plant (round up to 1, free): ${t.roundedUpSectors}`);
  console.log(
    `    player ${t.roundedUpByCohort.player}, npp ${t.roundedUpByCohort.npp}, state ${t.roundedUpByCohort.state}`
  );
  console.log(`  free capacity from round-ups:     ${Math.round(t.roundUpUnits)} units`);
  for (const [type, units] of Object.entries(t.roundUpUnitsBySectorType).sort(
    (x, y) => y[1] - x[1]
  ))
    console.log(`    ${type.padEnd(22)} ${Math.round(units)} units`);
  console.log(`  sectors credited:                 ${t.sectorsCredited}`);
  console.log(`  total credit:                     ${money(t.creditAnchor)}`);
  console.log(`    part-plant stock at book:       ${money(t.stockCreditAnchor)}`);
  console.log(`    in-flight order refunds:        ${money(t.orderRefundAnchor)}`);
  console.log(
    `  orders rewritten ${t.ordersRewritten}, folded into another order or refunded ${t.ordersCancelled}, ` +
      `starters rounded up ${t.starterRoundedUp}, financed left as is ${t.financedOrdersKept}`
  );
  const cohorts = ["player", "npp", "state"] as const;
  console.log("  in-flight orders by owner (AI rounds to nearest plant, players floor):");
  for (const cohort of cohorts)
    console.log(
      `    ${cohort.padEnd(7)} refunded ${String(t.orderRefundSectors[cohort]).padStart(5)} sectors ` +
        `${money(t.orderRefundByCohort[cohort])}  rounded up ${t.orderRoundUpSectors[cohort]} sectors  ` +
        `free ${Math.round(t.orderFreeUnits[cohort])} units`
    );
  console.log("  credit by owner:");
  for (const [cohort, row] of Object.entries(report.byCohort))
    console.log(
      `    ${cohort.padEnd(7)} ${String(row.sectors).padStart(5)} sectors  ${money(row.creditAnchor)}`
    );
  console.log("  credit by country:");
  for (const [country, row] of Object.entries(report.byCountry).sort(
    (a, b) => b[1].creditAnchor - a[1].creditAnchor
  ))
    console.log(
      `    ${(country || "?").padEnd(4)} ${String(row.sectors).padStart(5)} sectors  ${money(row.creditAnchor)}`
    );
  const top = [...report.conversions].sort((a, b) => b.creditAnchor - a.creditAnchor).slice(0, 10);
  console.log("  largest credits:");
  for (const c of top)
    console.log(
      `    ${c.sectorId} ${c.cohort.padEnd(6)} ${c.countryId.padEnd(3)} size ${c.size} ` +
        `stock ${(c.priorStock ?? 0).toFixed(2)} -> ${c.plantsAfter} plants  ${money(c.creditAnchor)}`
    );
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  const env = (option("--env") ?? "sandbox") as HealEnv;
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(
      resolveMongoDbName(process.env as Parameters<typeof resolveMongoDbName>[0])
    );
    const report = await buildConversionReport(db);
    if (flag("--json")) console.log(JSON.stringify({ ...report, conversions: undefined }, null, 2));
    else printReport(report);
    if (report.isProcessing) {
      console.log("\nREFUSED: a turn is processing. Run between turns.");
      process.exitCode = 2;
      return;
    }
    if (!flag("--apply")) {
      console.log("\nDry run. Nothing written. Re-run with --apply to convert.");
      return;
    }
    const operator = process.env.USER ?? "operator";
    const planned = await runPlan(db, defect, { env, operator });
    for (const w of planned.warnings) console.log(`warning: ${w}`);
    if (!planned.token) {
      console.log(`\nNo token: ${planned.tokenWithheld}`);
      process.exitCode = planned.plan.affected === 0 ? 0 : 2;
      return;
    }
    const applied = await runApply(db, defect, {
      env,
      operator,
      tokenId: planned.token.id,
      confirmProd: flag("--confirm-prod"),
    });
    console.log(JSON.stringify(applied, null, 2));
    if (!applied.ok) process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
