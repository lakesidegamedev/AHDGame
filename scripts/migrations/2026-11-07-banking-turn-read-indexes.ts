import type { Db } from "mongodb";
import type { MigrationResult } from "../../src/lib/migrations/types";
import { BANKING_TURN_READ_INDEXES } from "../../src/lib/banking/turnReadIndexes";
import { closeDb, connectDb } from "../utils/db";

/** Existing worlds use the same non-unique index plan as bootstrap. */
export async function runBankingTurnReadIndexes(
  db: Db,
  opts: { dryRun?: boolean } = {}
): Promise<MigrationResult> {
  const dryRun = opts.dryRun ?? true;
  const notes: string[] = [];
  for (const plan of BANKING_TURN_READ_INDEXES) {
    if (!dryRun) {
      await db.collection(plan.collection).createIndex(
        { ...plan.key },
        {
          name: plan.name,
          ...("sparse" in plan ? { sparse: plan.sparse } : {}),
        }
      );
    }
    notes.push(`${dryRun ? "would create" : "created/verified"} ${plan.collection}.${plan.name}`);
  }
  return {
    documentsScanned: BANKING_TURN_READ_INDEXES.length,
    documentsUpdated: dryRun ? 0 : BANKING_TURN_READ_INDEXES.length,
    notes,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await connectDb();
  try {
    const result = await runBankingTurnReadIndexes(db, { dryRun: !apply });
    for (const note of result.notes ?? []) console.log(note);
    console.log(apply ? "Indexes applied." : "Dry run only. Pass --apply to create indexes.");
  } finally {
    await closeDb();
  }
}

if (require.main === module) {
  main().catch(() => {
    console.error("Banking index installation failed.");
    process.exitCode = 1;
  });
}
