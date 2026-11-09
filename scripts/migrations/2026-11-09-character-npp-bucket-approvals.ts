/**
 * Renames `archetypeApprovals` to `bucketApprovals` on characters and NPPs.
 * Keys are already "dim:bucket", so this is a plain
 * field rename. Dry run unless `--apply` is passed.
 */
import { connectDb, closeDb } from "../utils/db";

const apply = process.argv.includes("--apply");
const COLLECTIONS = ["characters", "npps"] as const;

async function main() {
  const db = await connectDb();
  for (const name of COLLECTIONS) {
    const col = db.collection(name);
    const filter = { archetypeApprovals: { $exists: true } };
    const affected = await col.countDocuments(filter);
    console.log(`${name}: ${affected} documents with archetypeApprovals`);
    if (!apply || affected === 0) continue;
    const result = await col.updateMany(filter, {
      $rename: { archetypeApprovals: "bucketApprovals" },
    });
    console.log(`${name}: renamed on ${result.modifiedCount} documents`);
  }
  if (!apply) console.log("Dry run. Re-run with --apply to migrate.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
