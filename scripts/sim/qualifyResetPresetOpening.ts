/**
 * First-turn and retry qualification on an explicitly selected isolated local world.
 * npx tsx scripts/sim/qualifyResetPresetOpening.ts --database <isolated-db> --out <external.json>
 * Run after a reset with all four v2 systems selected. The script advances subsystem state.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import { parse } from "dotenv";
import { MongoClient, BSON, type Document } from "mongodb";
import type { GameState } from "../../src/lib/db/types/gameState";
import type { GameConfig } from "../../src/lib/db/types/gameConfig";

function flag(name: string) {
  const i = process.argv.indexOf(name);
  return i < 0 ? "" : (process.argv[i + 1] ?? "");
}

async function main() {
  const database = flag("--database");
  const output = flag("--out");
  const env = parse(readFileSync(".env.local"));
  const uri = new URL(env.MONGODB_URI);
  const applicationDatabase =
    env.MONGODB_DB ||
    env.MONGO_DB_NAME ||
    decodeURIComponent(uri.pathname.slice(1)) ||
    "a-house-divided";
  if (
    !["localhost", "127.0.0.1"].includes(uri.hostname) ||
    !database ||
    database === applicationDatabase ||
    !output ||
    !relative(process.cwd(), resolve(output)).startsWith("..")
  ) {
    throw new Error("Select an isolated local database and external report path");
  }
  for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
  uri.hostname = "127.0.0.1";
  uri.pathname = "/" + database;
  process.env.MONGODB_URI = uri.toString();
  process.env.MONGODB_DB = database;
  process.env.MONGO_DB_NAME = database;
  const client = new MongoClient(uri.toString(), { family: 4, monitorCommands: true });
  let phase = "setup";
  const counts: Record<string, { commands: number; replyBytes: number }> = {};
  client.on("commandStarted", () => {
    const entry = (counts[phase] ??= { commands: 0, replyBytes: 0 });
    entry.commands++;
  });
  client.on("commandSucceeded", (event) => {
    const entry = (counts[phase] ??= { commands: 0, replyBytes: 0 });
    entry.replyBytes += BSON.calculateObjectSize(event.reply as Document);
  });
  try {
    await client.connect();
    const db = client.db(database);
    const world = await db.collection<GameState>("gameState").findOne({ _id: "current" });
    if (!world?.resetWorldId || !Number.isSafeInteger(world.currentTurn))
      throw new Error("Missing isolated opening");
    const turn = world.currentTurn + 1;
    const { runDemographicFlows } = await import("../../src/lib/demographics/phase");
    const { refreshResetMetricSnapshotsTurn } =
      await import("../../src/lib/resetMetrics/refreshTurn");
    const { collectResetMetricOwnerReadings } =
      await import("../../src/lib/resetMetrics/collectOwnerReadings");
    const { processBondTurn } = await import("../../src/lib/turn/bondTurn");
    const { settleResetTreasuryCashTurn } =
      await import("../../src/lib/resetFinance/settleCashTurn");
    const { resetSystemVersionsFrom } = await import("../../src/lib/resetVersions/rules");
    const { RESET_V2_READY } = await import("../../src/lib/resetVersions/availability");
    const { resolveGameYear } = await import("../../src/lib/era/era");
    const typedWorld = world as unknown as import("../../src/lib/db/types/gameState").GameState;
    if (
      Object.values(resetSystemVersionsFrom(typedWorld, RESET_V2_READY)).some(
        (version) => version !== "v2"
      )
    )
      throw new Error("Qualification requires verified opening receipts for all four v2 systems");
    phase = "cohorts";
    const cohorts = await runDemographicFlows(db, turn, world.worldEpochId);
    phase = "metrics";
    const metricInput = {
      db,
      gameState: typedWorld,
      turn,
      ownerReadings: (
        boards: readonly import("../../src/lib/resetMetrics/rules/snapshot").ResetMetricSnapshot[]
      ) =>
        collectResetMetricOwnerReadings(db, boards, turn, resolveGameYear(typedWorld) ?? undefined),
    };
    const metrics = await refreshResetMetricSnapshotsTurn(metricInput);
    phase = "bonds";
    const config = await db.collection<GameConfig>("gameConfig").findOne({ _id: "main" });
    const bondFlows = await processBondTurn(turn, {
      ...config,
      captureSovereignCashProceeds: true,
    });
    phase = "cash";
    const cash = await settleResetTreasuryCashTurn({ db, gameState: typedWorld, turn, bondFlows });
    phase = "replay";
    const replayState = () =>
      Promise.all([
        db
          .collection("resetNationalTreasuries")
          .find({ worldId: world.resetWorldId })
          .sort({ _id: 1 })
          .toArray(),
        db
          .collection("resetDepartmentAccounts")
          .find({ worldId: world.resetWorldId })
          .sort({ _id: 1 })
          .toArray(),
        db
          .collection("regionDemographics")
          .find({}, { projection: { _id: 1, ages: 1 } })
          .sort({ _id: 1 })
          .toArray(),
      ]);
    const before = await replayState();
    const replay = {
      cohorts: await runDemographicFlows(db, turn, world.worldEpochId),
      metrics: await refreshResetMetricSnapshotsTurn(metricInput),
      cash: await settleResetTreasuryCashTurn({ db, gameState: typedWorld, turn, bondFlows }),
    };
    const after = await replayState();
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error("Replay changed settled accounts or population stocks");
    const report = {
      preset: world.preset,
      openingTurn: world.currentTurn,
      testedTurn: turn,
      versions: resetSystemVersionsFrom(typedWorld, RESET_V2_READY),
      cohorts,
      metrics,
      cash,
      replay,
      counts,
      cashReplayUnchanged: true,
      populationReplayUnchanged: true,
      countScope:
        "Commands and BSON reply bytes observed by this direct client. Helpers using the application client, including bond settlement, have additional I/O.",
      scope:
        "Isolated local first-turn subsystem and retry qualification. Other turn phases are outside this run.",
      implementationSha256: createHash("sha256")
        .update(readFileSync("scripts/sim/qualifyResetPresetOpening.ts"))
        .digest("hex"),
      sourceHashes: [
        "src/lib/resetVersions/rules.ts",
        "src/lib/resetVersions/rules/modeledFinance.ts",
        "src/lib/resetVersions/rules/modeledMetrics.ts",
        "src/lib/resetVersions/seedModeledOpening.ts",
        "src/lib/demographics/phase.ts",
        "src/lib/demographics/migrationLaws.ts",
        "src/lib/resetMetrics/collectOwnerReadings.ts",
      ].map((file) => ({
        file,
        sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
      })),
    };
    writeFileSync(resolve(output), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ output: resolve(output), metrics, cash, replay }));
  } finally {
    await client.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message.replace(/mongodb(?:\+srv)?:\/\/\S+/g, "[redacted]")
        : "Qualification failed"
    );
    process.exit(1);
  });
