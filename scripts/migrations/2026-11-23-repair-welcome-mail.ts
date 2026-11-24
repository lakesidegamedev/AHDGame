/**
 * Rewrites stored Game Guide welcome mails so the funds and actions read as
 * opening figures, not a current balance. Text only. Dry run unless --apply.
 */
import type { Db } from "mongodb";
import { connectDb, closeDb } from "../utils/db";
import { repairWelcomeMailBody } from "../../src/lib/onboarding/welcomeMailRepair";

export async function repairWelcomeMails(db: Db, opts: { dryRun: boolean }) {
  const mail = db.collection<{ _id: unknown; body: string }>("playerMail");
  let scanned = 0;
  let changed = 0;
  for await (const doc of mail.find({
    fromCharacterName: "Game Guide",
    body: /^You have a character, a home /,
  })) {
    scanned++;
    const next = repairWelcomeMailBody(doc.body);
    if (next === doc.body) continue;
    changed++;
    if (!opts.dryRun) await mail.updateOne({ _id: doc._id as never }, { $set: { body: next } });
  }
  return { scanned, changed };
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (!apply) console.log("[dry-run] No writes will be made. Pass --apply to write.");
  const db = await connectDb();
  try {
    console.log(JSON.stringify(await repairWelcomeMails(db, { dryRun: !apply }), null, 2));
  } finally {
    await closeDb();
  }
}

if (process.argv[1]?.includes("repair-welcome-mail")) {
  void main();
}
