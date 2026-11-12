/**
 * Clears party GOTV and suppression targets that name a legacy voter group
 * (or a census bucket the party's country does not have). The turn already
 * skips such targets without charging the treasury, so nothing is refunded:
 * budgets are a percent of hourly revenue, never prepaid. Clearing the target
 * makes the party page ask the officer to pick a census bucket instead of
 * showing a dead one. The percent is kept. Dry run unless `--apply` is passed.
 */
import type { Db } from "mongodb";
import { isValidPartyTurnoutTarget } from "../../src/lib/demographics/partyTurnoutTargetResolver";
import { connectDb, closeDb } from "../utils/db";

interface BudgetRow {
  _id: unknown;
  countryId: string;
  gotvTargetCategory?: string;
  gotvTargetGroup?: string;
  suppressionTargetCategory?: string;
  suppressionTargetGroup?: string;
}

export async function clearLegacyPartyTurnoutTargets(
  db: Db,
  preset: string | null,
  apply: boolean
): Promise<{ scanned: number; cleared: number }> {
  const col = db.collection<BudgetRow>("partyBudget");
  const rows = await col
    .find({
      $or: [
        { gotvTargetCategory: { $exists: true } },
        { suppressionTargetCategory: { $exists: true } },
      ],
    })
    .toArray();
  const ops: Array<{
    updateOne: { filter: { _id: unknown }; update: { $unset: Record<string, ""> } };
  }> = [];
  for (const row of rows) {
    const unset: Record<string, ""> = {};
    const stale = (category?: string, group?: string) =>
      category !== undefined &&
      !(group && isValidPartyTurnoutTarget(row.countryId, category, group, preset));
    if (stale(row.gotvTargetCategory, row.gotvTargetGroup)) {
      unset.gotvTargetCategory = "";
      unset.gotvTargetGroup = "";
    }
    if (stale(row.suppressionTargetCategory, row.suppressionTargetGroup)) {
      unset.suppressionTargetCategory = "";
      unset.suppressionTargetGroup = "";
    }
    if (Object.keys(unset).length > 0)
      ops.push({ updateOne: { filter: { _id: row._id }, update: { $unset: unset } } });
  }
  if (apply && ops.length > 0) await col.bulkWrite(ops as never);
  return { scanned: rows.length, cleared: ops.length };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await connectDb();
  const gameState = await db
    .collection<{ _id: string; preset?: string }>("gameState")
    .findOne({ _id: "current" }, { projection: { preset: 1 } });
  const result = await clearLegacyPartyTurnoutTargets(db, gameState?.preset ?? null, apply);
  console.log(`partyBudget: ${result.scanned} with targets, ${result.cleared} stale`);
  if (!apply) console.log("Dry run. Re-run with --apply to migrate.");
}

if (process.argv[1]?.endsWith("clear-legacy-party-turnout-targets.ts")) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
