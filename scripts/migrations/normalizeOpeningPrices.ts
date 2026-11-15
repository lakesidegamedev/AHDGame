/**
 * Puts every commodity price back at base on the current world, once, between
 * turns. Prices, scarcity multipliers and the trailing imbalance windows move;
 * hard pegs and pending nudges stay. Money, inventories and capacity are not
 * touched. It refuses while a turn is processing.
 *
 * Dry run is the default and prints what would change. Add --apply to write.
 *
 * Usage:
 *   npx tsx scripts/migrations/normalizeOpeningPrices.ts \
 *     --expected-world-epoch=<id> --env-file=<path> --uri-key=<ENV KEY> [--apply]
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MongoClient } from "mongodb";

const USAGE =
  "Usage: normalizeOpeningPrices.ts --expected-world-epoch=<id> --env-file=<path> --uri-key=<ENV KEY> [--apply]";

const args = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  if (arg === "--apply") {
    args.set("apply", "true");
    continue;
  }
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (!match) throw new Error(`Expected --name=value, got ${arg}`);
  args.set(match[1], match[2]);
}
const apply = args.get("apply") === "true";
const expectedWorldEpoch = args.get("expected-world-epoch");
const envPath = args.get("env-file");
const uriKey = args.get("uri-key");
if (!expectedWorldEpoch || !envPath || !uriKey) throw new Error(USAGE);

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

/** Keeps app modules on this explicit connection instead of ambient variables. */
function bindAppDatabase(connected: MongoClient) {
  delete process.env.MONGO_URL;
  delete process.env.MONGO_DB_NAME;
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = databaseName;
  for (const key of ["AUTH_SECRET", "ADMIN_REGISTRATION_KEY", "CRON_SECRET"])
    process.env[key] ||= "opening-prices-cli-unused-value";
  (globalThis as { _mongoClientPromise?: Promise<MongoClient> })._mongoClientPromise =
    Promise.resolve(connected);
}

async function main() {
  await client.connect();
  bindAppDatabase(client);
  const db = client.db(databaseName);
  const { normalizeOpeningPrices } = await import("@/lib/market/producerMarket/openingPriceApply");
  const report = await normalizeOpeningPrices(db, {
    dryRun: !apply,
    expectedWorldEpoch,
  });
  console.log(JSON.stringify(report, null, 2));
  if (!apply) console.log("Dry run only. Re-run with --apply to write.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => client.close());
