/**
 * SOVEREIGN COUPON ARREARS DRY RUN: how many open per-bond coupon claims the
 * AHD-sovereign-coupon-arrears heal would fold, and how many claims remain.
 *
 * DRY RUN ONLY. Calls the heal's read-only plan directly, so unlike the
 * remediation CLI it does not even write a confirm token. Safe on prod,
 * between or during turns.
 *
 *   MONGODB_URI='mongodb://...' npx tsx scripts/ops/sovereignCouponArrearsDryRun.ts [--json]
 *
 * Apply goes through the remediation CLI (plan, then apply with the token),
 * between turns, after `sovereignCouponGroupedAccrualEnabled` is on so new
 * accrual stops adding one claim per bond.
 */
import { connectDb, closeDb } from "../utils/db";
import { defect } from "@/lib/remediation/defects/AHD-sovereign-coupon-arrears";

async function main() {
  const json = process.argv.includes("--json");
  const db = await connectDb();
  try {
    const ctx = { env: "prod" as const, dryRun: true, now: new Date() };
    const started = Date.now();
    const plan = await defect.plan(db, ctx);
    const payload = plan.payload as
      | {
          turn: number;
          openBefore: number;
          owned: string[];
          pending: number;
          mixedQuoteGroups: number;
          groups: Array<{ claims: number; folded: number }>;
        }
      | undefined;
    const folded = payload?.groups.reduce((sum, row) => sum + row.claims, 0) ?? 0;
    const after = payload?.groups.reduce((sum, row) => sum + row.folded, 0) ?? 0;
    const report = {
      turn: payload?.turn,
      openBefore: payload?.openBefore,
      openAfter: (payload?.openBefore ?? 0) - folded + after,
      claimsFolded: folded,
      claimsCreated: after,
      groups: payload?.groups.length ?? 0,
      receiptOwnedLeftAlone: payload?.owned.length ?? 0,
      publishingLeftAlone: payload?.pending ?? 0,
      mixedQuoteGroupsLeftAlone: payload?.mixedQuoteGroups ?? 0,
      moneyDelta: plan.moneyDelta,
      planSeconds: (Date.now() - started) / 1000,
      summary: plan.summary,
      notes: plan.notes,
    };
    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(report.summary);
      for (const [key, value] of Object.entries(report))
        if (key !== "notes" && key !== "summary") console.log(`  ${key}: ${String(value)}`);
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
