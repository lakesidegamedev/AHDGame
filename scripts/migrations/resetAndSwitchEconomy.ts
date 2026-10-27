/**
 * One command that rebuilds the economy and switches it to the funded market.
 *
 * 1. `--plan` runs the read-only economy reset census and writes its plan
 *    artifact to the output directory, then prints the digest to review.
 * 2. `--apply` runs the reset with that digest, then in one pass the producer
 *    opening census, the opening apply, the funded switch, and optionally the
 *    economy pause horizon. Each step is recorded on its marker, so a run that
 *    failed half way resumes from the step that did not land. It never resumes
 *    turns; an operator does that.
 *
 * Usage:
 *   npx tsx scripts/migrations/resetAndSwitchEconomy.ts --plan --output=<dir> \
 *     --expected-world-epoch=<id> --approval-reference=<decision> \
 *     --env-file=<path> --uri-key=<ENV KEY>
 *   npx tsx scripts/migrations/resetAndSwitchEconomy.ts --apply \
 *     --approved-digest=<sha> [--economy-pause-turns=<n>] \
 *     --expected-world-epoch=<id> --approval-reference=<decision> \
 *     --env-file=<path> --uri-key=<ENV KEY>
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Db, Document, MongoClient } from "mongodb";
import type { GameState } from "@/lib/db/types/gameState";

const USAGE =
  "Usage: resetAndSwitchEconomy.ts (--plan --output=<dir> | --apply --approved-digest=<sha> [--economy-pause-turns=<n>]) --expected-world-epoch=<id> --approval-reference=<decision> --env-file=<path> --uri-key=<ENV KEY>";

const PLAN_ARTIFACT = "reset-plan.json";

const args = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  if (arg === "--plan" || arg === "--apply") {
    args.set(arg.slice(2), "true");
    continue;
  }
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (!match) throw new Error(`Expected --name=value, got ${arg}`);
  args.set(match[1], match[2]);
}
const plan = args.get("plan") === "true";
const apply = args.get("apply") === "true";
const expectedWorldEpoch = args.get("expected-world-epoch");
const approvalReference = args.get("approval-reference");
const envPath = args.get("env-file");
const uriKey = args.get("uri-key");
const outputDir = args.get("output");
const approvedDigest = args.get("approved-digest");
const pauseTurnsArg = args.get("economy-pause-turns");
const pauseTurns = pauseTurnsArg === undefined ? null : Number(pauseTurnsArg);
if (plan === apply || !expectedWorldEpoch || !approvalReference || !envPath || !uriKey)
  throw new Error(USAGE);
if (plan && !outputDir) throw new Error(USAGE);
if (apply && !/^[0-9a-f]{64}$/.test(approvedDigest ?? "")) throw new Error(USAGE);
if (pauseTurns !== null && (!Number.isSafeInteger(pauseTurns) || pauseTurns < 0))
  throw new Error(USAGE);

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
 * The reset apply reaches seeders that resolve the shared app client through
 * getDb(). Bind that client to this explicit connection before any app module
 * loads, so no code path can open a connection from ambient environment
 * variables.
 */
function bindAppDatabase(connected: MongoClient) {
  delete process.env.MONGO_URL;
  delete process.env.MONGO_DB_NAME;
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = databaseName;
  // The app's env schema also requires these; this command never reads them.
  for (const key of ["AUTH_SECRET", "ADMIN_REGISTRATION_KEY", "CRON_SECRET"])
    process.env[key] ||= "economy-reset-cli-unused-value";
  (globalThis as { _mongoClientPromise?: Promise<MongoClient> })._mongoClientPromise =
    Promise.resolve(connected);
}

function log(line: string) {
  console.log(line);
}

async function readState(db: Db) {
  return db.collection<GameState>("gameState").findOne(
    { _id: "current" },
    {
      projection: {
        worldEpochId: 1,
        currentTurn: 1,
        isActive: 1,
        economyReset: 1,
        producerOpening: 1,
      },
    }
  );
}

async function applyAll(db: Db) {
  const epoch = expectedWorldEpoch!;
  const state = await readState(db);
  if (!state) throw new Error("The live world gameState document is missing");
  if (state.worldEpochId !== epoch) throw new Error("The expected world is not the live world");

  // Step 1: economy reset apply. The marker carries the digest and the phases
  // done, so a resumed run finishes the same plan instead of repeating it.
  const recordedReset = state.economyReset;
  if (recordedReset && recordedReset.digest !== approvedDigest)
    throw new Error("A different economy reset is recorded on this world");
  if (recordedReset?.completedAt) log("step 1/5 economy reset: already complete");
  else {
    log("step 1/5 economy reset: apply");
    const { applyEconomyReset } = await import("@/lib/admin/economyReset/apply");
    const result = await applyEconomyReset(db, {
      expectedWorldEpoch: epoch,
      approvalReference: approvalReference!,
      approvedDigest: approvedDigest!,
      log,
    });
    log(
      `step 1/5 economy reset: ${result.noop ? "already complete" : `applied ${result.phasesRun.join(", ")}`}`
    );
    const after = await readState(db);
    if (!after?.economyReset?.completedAt)
      throw new Error(
        "step 1/5 economy reset did not record completion; re-run the same command to resume"
      );
  }

  // Steps 2 and 3: the producer opening. Its marker names the world and the
  // last legacy turn, and the funded path refuses to start without it.
  const beforeOpening = await readState(db);
  if (!beforeOpening) throw new Error("The live world gameState document is missing");
  const openingBefore = beforeOpening.producerOpening;
  if (openingBefore && openingBefore.worldEpoch !== epoch)
    throw new Error("A different producer opening is recorded on this world");
  if (openingBefore) log("step 2/5 producer opening: already applied");
  else {
    log("step 2/5 producer opening: census");
    const { captureProducerOpening } = await import("./captureProducerOpening");
    const census = await captureProducerOpening(db, {
      expectedWorldEpoch: epoch,
      approvalReference: approvalReference!,
      requireActive: false,
    });
    if (!census.plan || !census.planDigest)
      throw new Error(
        `step 2/5 producer opening has blockers: ${census.result.blockers.join(", ") || "no plan"}`
      );
    log(`step 2/5 producer opening: census digest ${census.planDigest}`);
    log("step 3/5 producer opening: apply");
    const { applyProducerOpening } = await import("@/lib/market/producerMarket/openingApply");
    const applied = await applyProducerOpening(db, {
      plan: census.plan,
      planDigest: census.planDigest,
      approvedDigest: census.planDigest,
    });
    log(`step 3/5 producer opening: ${applied.status}`);
  }
  const afterOpening = await readState(db);
  if (!afterOpening?.producerOpening || afterOpening.producerOpening.worldEpoch !== epoch)
    throw new Error(
      "step 3/5 producer opening marker did not land; re-run the same command to resume"
    );

  // Step 4: the funded rules, at the same turn as the opening.
  log("step 4/5 funded switch: apply");
  const { applyFundedSwitch } = await import("@/lib/admin/economyReset/fundedSwitch");
  const switched = await applyFundedSwitch(db, { expectedWorldEpoch: epoch });
  log(
    `step 4/5 funded switch: ${switched.status}, funded from turn ${switched.producerMarketLiveFromTurn}, ${switched.transitionStampsCleared} transition stamp(s) cleared`
  );

  // Step 5: the economy pause horizon, only when the operator asked for it.
  if (pauseTurns === null) log("step 5/5 economy pause horizon: not requested");
  else {
    const current = await readState(db);
    if (!current) throw new Error("The live world gameState document is missing");
    const untilTurn = current.currentTurn + 1 + pauseTurns;
    // Written as a raw field: its GameConfig typing lands with the pause branch.
    const written = await db
      .collection<{ _id: string } & Document>("gameConfig")
      .updateOne({ _id: "default" }, { $set: { economyPauseUntilTurn: untilTurn } });
    if (written.matchedCount !== 1)
      throw new Error("step 5/5 gameConfig is missing; the economy pause horizon was not written");
    log(`step 5/5 economy pause horizon: turn ${untilTurn}`);
  }

  const finalState = await readState(db);
  const config = await db
    .collection<{ _id: string } & Document>("gameConfig")
    .findOne(
      { _id: "default" },
      { projection: { producerMarketLiveFromTurn: 1, economyPauseUntilTurn: 1 } }
    );
  if (!finalState) throw new Error("The live world gameState document is missing");
  const summary = {
    turn: finalState.currentTurn,
    worldEpoch: finalState.worldEpochId ?? null,
    producerOpening: finalState.producerOpening ?? null,
    producerMarketLiveFromTurn:
      typeof config?.producerMarketLiveFromTurn === "number"
        ? config.producerMarketLiveFromTurn
        : null,
    economyPauseUntilTurn:
      typeof config?.economyPauseUntilTurn === "number" ? config.economyPauseUntilTurn : null,
    isActive: finalState.isActive === true,
  };
  const opening = summary.producerOpening;
  const verified =
    summary.worldEpoch === epoch &&
    opening !== null &&
    opening.worldEpoch === epoch &&
    opening.turn === summary.turn &&
    summary.producerMarketLiveFromTurn === summary.turn + 1;
  if (!verified)
    throw new Error(`The funded switch did not verify: ${JSON.stringify(summary, null, 2)}`);
  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  await client.connect();
  bindAppDatabase(client);
  const db = client.db(databaseName);
  if (plan) {
    const { captureEconomyResetPlan } = await import("@/lib/admin/economyReset/census");
    const result = await captureEconomyResetPlan(db, {
      expectedWorldEpoch: expectedWorldEpoch!,
      approvalReference: approvalReference!,
      lock: "idle",
    });
    const destination = resolve(outputDir!, PLAN_ARTIFACT);
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    console.log(
      JSON.stringify({
        planDigest: result.planDigest,
        artifact: destination,
        blockers: result.plan.blockers,
        warnings: result.plan.warnings,
        wipe: result.plan.wipe,
        partialWipe: result.plan.partialWipe,
        reseed: result.plan.reseed,
        characters: result.plan.characters.length,
        sovereignBondsRehomed: result.plan.sovereignBonds.length,
        couponClaimsPatched: result.plan.couponClaims.length,
        centralBanks: result.plan.centralBanks,
        money: result.plan.money,
      })
    );
    return;
  }
  await applyAll(db);
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error
        ? error.message.replace(/mongodb[^\s]*/gi, "[connection]")
        : "Economy reset and funded switch failed"
    );
    process.exitCode = 1;
  })
  .finally(() => client.close());
