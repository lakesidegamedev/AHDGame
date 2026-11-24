/**
 * Lifts weekly contest rounds that lag their opening day's shared round number
 * (Kingmaker "Round 6" beside "Round 7"). Changes the label only. Dry run
 * unless --apply is passed.
 */
import type { Db } from "mongodb";
import { connectDb, closeDb } from "../utils/db";
import { alignRoundNumbers } from "../../src/lib/contests/rules/roundNumbers";

export async function alignContestRoundNumbers(db: Db, opts: { dryRun: boolean }) {
  const rounds = db.collection<{
    _id: string;
    kind: string;
    roundNumber: number;
    startedAt: Date;
  }>("contestRounds");
  const rows = (
    await rounds.find({}, { projection: { kind: 1, roundNumber: 1, startedAt: 1 } }).toArray()
  ).map((r) => ({
    id: String(r._id),
    kind: r.kind,
    roundNumber: r.roundNumber,
    startedAtMs: new Date(r.startedAt).getTime(),
  }));
  const fixes = alignRoundNumbers(rows, ["referrals_iteration"]);
  if (!opts.dryRun) {
    for (const f of fixes) await rounds.updateOne({ _id: f.id }, { $set: { roundNumber: f.to } });
  }
  return { scanned: rows.length, changed: fixes.length, fixes: fixes.slice(0, 20) };
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (!apply) console.log("[dry-run] No writes will be made. Pass --apply to write.");
  const db = await connectDb();
  try {
    console.log(JSON.stringify(await alignContestRoundNumbers(db, { dryRun: !apply }), null, 2));
  } finally {
    await closeDb();
  }
}

if (process.argv[1]?.includes("align-contest-round-numbers")) {
  void main();
}
