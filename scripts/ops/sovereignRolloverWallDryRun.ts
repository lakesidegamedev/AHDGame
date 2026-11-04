/**
 * SOVEREIGN ROLLOVER WALL DRY RUN: how many split sovereign series would the
 * AHD-sovereign-rollover-wall heal fold, and what the next maturity walls
 * look like before and after.
 *
 * DRY RUN ONLY. Calls the heal's read-only plan directly, so unlike the
 * remediation CLI it does not even write a confirm token. Safe on prod,
 * between or during turns.
 *
 *   MONGODB_URI='mongodb://...' npx tsx scripts/ops/sovereignRolloverWallDryRun.ts [--json]
 *
 * Apply goes through the remediation CLI (plan, then apply with the token),
 * between turns, after `sovereignRolloverConsolidationEnabled` is on so new
 * refinancing stops splitting series again.
 */
import type { Db } from "mongodb";
import { connectDb, closeDb } from "../utils/db";
import { defect } from "@/lib/remediation/defects/AHD-sovereign-rollover-wall";

async function maturityProfile(db: Db, fromTurn: number) {
  return db
    .collection("bonds")
    .aggregate<{ _id: number; bonds: number }>([
      {
        $match: {
          issuerType: "sovereign",
          matured: false,
          defaulted: false,
          maturityTurn: { $gte: fromTurn },
        },
      },
      { $group: { _id: "$maturityTurn", bonds: { $sum: 1 } } },
      { $match: { bonds: { $gte: 100 } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();
}

async function main() {
  const json = process.argv.includes("--json");
  const db = await connectDb();
  try {
    const ctx = { env: "prod" as const, dryRun: true, now: new Date() };
    const [detected, plan] = [await defect.detect(db, ctx), await defect.plan(db, ctx)];
    const turn = (plan.payload as { turn?: number } | undefined)?.turn ?? 0;
    const live = await db
      .collection("bonds")
      .countDocuments({ issuerType: "sovereign", matured: false, defaulted: false });
    const profile = await maturityProfile(db, turn);
    const report = {
      turn,
      liveSovereignBonds: live,
      bondsAbsorbed: plan.affected,
      liveAfter: live - plan.affected,
      moneyDelta: plan.moneyDelta,
      summary: plan.summary,
      maturityWallsNow: profile,
      notes: plan.notes,
      sample: detected.sample,
    };
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(report.summary);
      console.log(
        `turn ${turn}: ${live} live sovereign bonds -> ${report.liveAfter} after folding`
      );
      console.log("maturity turns with 100+ bonds today:");
      for (const row of profile) console.log(`  t${row._id}: ${row.bonds}`);
      for (const note of plan.notes ?? []) console.log(`  ${note}`);
    }
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
