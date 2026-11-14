/**
 * Run one turn on a sandbox world for resume rehearsals.
 *
 *   MONGODB_URI=... MONGODB_DB=ahdspeed_x npx tsx scripts/turn/rehearsal-turn.ts [--stage 2] [--age-lock]
 *
 * Unlike scripts/perf/one-turn.ts it never clears a held processing lock. With
 * --age-lock a held lock gets an old heartbeat first, which is exactly what a
 * killed holder leaves behind, so the next turn takes over and resumes it.
 * Fault injection for the journaled corporation turn steps comes from
 * AHD_CORP_TURN_FAULT (see resume/journal.ts). Sandbox databases only.
 */
import { connectDb, closeDb } from "../utils/db";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const uri = process.env.MONGODB_URI ?? "";
  const dbName = process.env.MONGODB_DB ?? uri.match(/\/([^/?]+)(\?|$)/)?.[1] ?? "";
  if (!/^(ahdspeed_|sandbox)/.test(dbName) || !/127\.0\.0\.1|localhost/.test(uri))
    throw new Error(`refusing non-sandbox target (${dbName || "unset"})`);
  const db = await connectDb();
  const config = db.collection<{ _id: string; simSandbox?: boolean }>("gameConfig");
  const stage = argValue("--stage");
  await config.updateOne(
    { _id: "default" },
    {
      $set: {
        simSandbox: true,
        ...(stage !== undefined ? { turnResilienceStage: Number(stage) } : {}),
      },
    },
    { upsert: true }
  );
  const state = db.collection<{ _id: string; isProcessing?: boolean }>("gameState");
  if (process.argv.includes("--age-lock"))
    await state.updateOne(
      { _id: "current", isProcessing: true },
      { $set: { processingHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000) } as never }
    );
  const { processTurn } = await import("@/lib/turnSystem");
  const started = Date.now();
  const result = await processTurn();
  console.log(
    `turn ${result.turn} success=${result.success}: ${((Date.now() - started) / 1000).toFixed(1)}s ${result.message}`
  );
  const { drainDeferredTurnWork } = await import("@/lib/turn/deferredTurnWork");
  await drainDeferredTurnWork();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
    process.exit(process.exitCode ?? 0);
  });
