/**
 * Sandbox rehearsal of turn resilience stage 1. Sandbox databases only.
 *
 *   run     one turn through processTurn plus the automatic retry controller
 *           (what the worker's scheduler path does), optionally with
 *           AHD_TURN_FAULT_INJECT set in the environment.
 *   pause   SIGSTOP the holder for `--pause-sec` (default 240) while emulating the
 *           watchdog, which must not take over a live holder; then SIGCONT it and
 *           report whether the turn completed.
 *   kill    spawn `run` as a child, SIGKILL it when the lock shows the named
 *           phase, then emulate the worker watchdog tick (every 10 s) until it
 *           takes the stale lock over, and run the resumed turn.
 *
 *   npx tsx scripts/turn/rehearse-resilience.ts run
 *   npx tsx scripts/turn/rehearse-resilience.ts kill --phase bondTurn
 *
 * Prints one JSON line with wall times. Connection: MONGODB_URI, MONGODB_DB.
 */
import { spawn } from "node:child_process";
import { MongoClient } from "mongodb";

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};

async function runWithRetry(): Promise<{ attempts: number; ok: boolean; ms: number }> {
  const { processTurn } = await import("@/lib/turnSystem");
  const { createTurnRetryController } = await import("@/lib/turn/turnRetry");
  const t0 = Date.now();
  let attempts = 0;
  let done: (v: { attempts: number; ok: boolean; ms: number }) => void = () => {};
  const finished = new Promise<{ attempts: number; ok: boolean; ms: number }>((r) => (done = r));
  let last = { success: false } as { success: boolean; failure?: unknown; turn?: number };
  const controller = createTurnRetryController({
    run: async (attempt) => {
      attempts = attempt.attempt;
      const r = await processTurn({ retryAttempt: attempt });
      if (r.success) done({ attempts, ok: true, ms: Date.now() - t0 });
      return r as never;
    },
    record: (e) => console.log("[retry-record]", JSON.stringify(e)),
    alert: (m) => {
      console.log("[retry-alert]", m);
      done({ attempts, ok: false, ms: Date.now() - t0 });
    },
  });
  const wrapped = async () => {
    const r = await processTurn();
    last = r;
    await controller.onResult(r as never);
    return r;
  };
  const first = await wrapped();
  if (first.success || !first.failure) return { attempts, ok: first.success, ms: Date.now() - t0 };
  // Retries run on timers; wait for the loop to settle (success, or alert).
  const res = await Promise.race([
    finished,
    new Promise<{ attempts: number; ok: boolean; ms: number }>((r) =>
      setTimeout(() => r({ attempts, ok: false, ms: Date.now() - t0 }), 20 * 60_000)
    ),
  ]);
  void last;
  return res;
}

async function killRun(phase: string, pause = false, pauseSec = 240) {
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const gs = client.db(process.env.MONGODB_DB).collection("gameState");
  const t0 = Date.now();
  const child = spawn("npx", ["tsx", "scripts/turn/rehearse-resilience.ts", "run"], {
    stdio: ["ignore", "inherit", "inherit"],
    detached: true,
  });
  let killedAt = 0;
  for (let i = 0; i < 6000 && !killedAt; i++) {
    const doc = (await gs.findOne({ _id: "current" as never })) as {
      isProcessing?: boolean;
      processingPhase?: string;
      processingPhaseStatuses?: Record<string, { status: string }>;
    } | null;
    const running =
      phase === "turn_bootstrap"
        ? doc?.isProcessing === true && doc.processingPhase === "turn_bootstrap"
        : doc?.processingPhaseStatuses?.[phase]?.status === "running";
    if (running) {
      process.kill(-child.pid!, pause ? "SIGSTOP" : "SIGKILL");
      killedAt = Date.now();
    } else await new Promise((r) => setTimeout(r, 25));
  }
  if (!killedAt) throw new Error(`never saw phase ${phase} running`);
  console.log(`[kill] ${pause ? "SIGSTOP" : "SIGKILL"} at ${phase}`);
  const { tryFastStaleLockTakeover } = await import("@/lib/turn/turnLockHolder");
  const { processTurn } = await import("@/lib/turnSystem");
  const { getDb } = await import("@/lib/mongodb");
  const db = await getDb();
  if (pause) {
    // The holder is alive but stopped: the watchdog must leave it alone.
    let tookOver = false;
    const until = Date.now() + pauseSec * 1000;
    while (Date.now() < until) {
      if (await tryFastStaleLockTakeover(db, 1)) tookOver = true;
      await new Promise((r) => setTimeout(r, 10_000));
    }
    const exited = new Promise<number | null>((r) => child.on("exit", (code) => r(code)));
    process.kill(-child.pid!, "SIGCONT");
    console.log("[pause] SIGCONT holder");
    const code = await exited;
    await client.close();
    return {
      phase,
      pausedSec: pauseSec,
      watchdogTookOver: tookOver,
      holderExitCode: code,
      totalSec: Math.round((Date.now() - t0) / 1000),
    };
  }
  let tookOverAt = 0;
  for (let i = 0; i < 60 && !tookOverAt; i++) {
    if (await tryFastStaleLockTakeover(db, 1)) tookOverAt = Date.now();
    else await new Promise((r) => setTimeout(r, 10_000));
  }
  if (!tookOverAt) throw new Error("watchdog never took the lock over");
  const r = await processTurn();
  const doneAt = Date.now();
  await client.close();
  return {
    phase,
    takeoverSec: Math.round((tookOverAt - killedAt) / 1000),
    resumeSec: Math.round((doneAt - tookOverAt) / 1000),
    totalSec: Math.round((doneAt - t0) / 1000),
    success: r.success,
    message: r.message,
  };
}

async function main() {
  const db = process.env.MONGODB_DB ?? "";
  if (!db.startsWith("ahdspeed_")) throw new Error("sandbox databases only");
  const mode = process.argv[2];
  if (mode === "run") {
    const r = await runWithRetry();
    const { drainDeferredTurnWork } = await import("@/lib/turn/deferredTurnWork");
    await drainDeferredTurnWork();
    console.log("[result]", JSON.stringify(r));
    process.exit(0);
  } else if (mode === "kill" || mode === "pause") {
    const r = await killRun(
      arg("--phase") ?? "bondTurn",
      mode === "pause",
      Number(arg("--pause-sec") ?? 240)
    );
    console.log("[result]", JSON.stringify(r));
    process.exit(0);
  }
  throw new Error("usage: run | kill|pause --phase <phase>");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
