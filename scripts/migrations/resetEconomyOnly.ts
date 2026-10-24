/**
 * Economy-only reset: rebuild corporations and sectors from the current era
 * seed and clear private money, keeping politics, budgets, macro state, the
 * clock and the world epoch.
 *
 * 1. Pause the world (and enable maintenance), then run the read-only census.
 *    It writes a mode-0600 plan artifact and prints the plan digest. Nothing is
 *    written to Mongo.
 * 2. Review the artifact. Apply with the reviewed digest. The apply takes the
 *    processing lock, rebuilds the plan, refuses unless the digest matches,
 *    runs idempotent phases recorded on gameState.economyReset, and leaves the
 *    world paused. A failed apply keeps the maintenance lock; re-run the same
 *    apply command to resume from the stored plan.
 *
 * Usage:
 *   npx tsx scripts/migrations/resetEconomyOnly.ts --census \
 *     --expected-world-epoch=<id> --approval-reference=<decision> \
 *     --env-file=<path> --uri-key=<ENV KEY> --output=<private-json>
 *   npx tsx scripts/migrations/resetEconomyOnly.ts --apply \
 *     --expected-world-epoch=<id> --approval-reference=<decision> \
 *     --env-file=<path> --uri-key=<ENV KEY> --approved-digest=<planDigest>
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { MongoClient } from "mongodb";

const USAGE =
  "Usage: resetEconomyOnly.ts (--census --output=<file> | --apply --approved-digest=<sha>) --expected-world-epoch=<id> --approval-reference=<decision> --env-file=<path> --uri-key=<ENV KEY>";

const args = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  if (arg === "--census" || arg === "--apply") {
    args.set(arg.slice(2), "true");
    continue;
  }
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (!match) throw new Error(`Expected --name=value, got ${arg}`);
  args.set(match[1], match[2]);
}
const census = args.get("census") === "true";
const apply = args.get("apply") === "true";
const expectedWorldEpoch = args.get("expected-world-epoch");
const approvalReference = args.get("approval-reference");
const envPath = args.get("env-file");
const uriKey = args.get("uri-key");
const outputPath = args.get("output");
const approvedDigest = args.get("approved-digest");
if (census === apply || !expectedWorldEpoch || !approvalReference || !envPath || !uriKey)
  throw new Error(USAGE);
if (census && !outputPath) throw new Error(USAGE);
if (apply && !/^[0-9a-f]{64}$/.test(approvedDigest ?? "")) throw new Error(USAGE);

const requireFromProject = createRequire(resolve(process.cwd(), "package.json"));
const mongodb = requireFromProject("mongodb") as typeof import("mongodb");
const dotenv = requireFromProject("dotenv") as typeof import("dotenv");
const env = dotenv.parse(readFileSync(envPath, "utf8"));
const uri = env[uriKey];
if (!uri) throw new Error(`The explicit connection ${uriKey} is missing`);
const databaseName =
  env.MONGODB_DB ||
  env.MONGO_DB_NAME ||
  decodeURIComponent(
    (uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/) ?? [])[1] ?? "a-house-divided"
  );
const client = new mongodb.MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });

/**
 * Seeders reached by the apply resolve the shared app client through getDb().
 * Bind that client to this explicit connection before any app module loads,
 * so no code path can open a connection from ambient environment variables.
 */
function bindAppDatabase(connected: MongoClient) {
  delete process.env.MONGO_URL;
  delete process.env.MONGO_DB_NAME;
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = databaseName;
  // The app's env schema also requires these; the reset never reads them.
  for (const key of ["AUTH_SECRET", "ADMIN_REGISTRATION_KEY", "CRON_SECRET"])
    process.env[key] ||= "economy-reset-cli-unused-value";
  (globalThis as { _mongoClientPromise?: Promise<MongoClient> })._mongoClientPromise =
    Promise.resolve(connected);
}

async function main() {
  await client.connect();
  bindAppDatabase(client);
  const db = client.db(databaseName);
  if (census) {
    const { captureEconomyResetPlan } = await import("@/lib/admin/economyReset/census");
    const result = await captureEconomyResetPlan(db, {
      expectedWorldEpoch: expectedWorldEpoch!,
      approvalReference: approvalReference!,
      lock: "idle",
    });
    const destination = resolve(outputPath!);
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    console.log(
      JSON.stringify({
        planDigest: result.planDigest,
        blockers: result.plan.blockers,
        warnings: result.plan.warnings,
        wipe: result.plan.wipe,
        partialWipe: result.plan.partialWipe,
        characters: result.plan.characters.length,
        sovereignBondsRehomed: result.plan.sovereignBonds.length,
        couponClaimsPatched: result.plan.couponClaims.length,
        centralBanks: result.plan.centralBanks,
        money: result.plan.money,
      })
    );
    return;
  }
  const { applyEconomyReset } = await import("@/lib/admin/economyReset/apply");
  const result = await applyEconomyReset(db, {
    expectedWorldEpoch: expectedWorldEpoch!,
    approvalReference: approvalReference!,
    approvedDigest: approvedDigest!,
    log: (line) => console.log(line),
  });
  console.log(JSON.stringify(result));
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error
        ? error.message.replace(/mongodb[^\s]*/gi, "[connection]")
        : "Economy reset failed"
    );
    process.exitCode = 1;
  })
  .finally(() => client.close());
