/**
 * Applies the producer opening conversion (funded-market cutover, phase B S1).
 *
 * Run the census first (captureProducerOpening.ts) and review its artifact. This
 * command pauses the turn system, rebuilds the plan from the live world with
 * the same code, refuses unless its digest equals the reviewed census digest,
 * applies it idempotently, stamps the opening marker, and restores the turn
 * system only if it was running before.
 *
 * Usage:
 *   npx tsx scripts/migrations/applyProducerOpening.ts \
 *     --expected-world-epoch=<id> --approval-reference=<decision> \
 *     --approved-digest=<planDigest from the census> \
 *     --env-file=<path> --uri-key=<ENV KEY> [--dry-run]
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { captureProducerOpening } from "./captureProducerOpening";
import { applyProducerOpening } from "@/lib/market/producerMarket/openingApply";

const args = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  if (arg === "--dry-run") {
    args.set("dry-run", "true");
    continue;
  }
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (!match) throw new Error(`Expected --name=value, got ${arg}`);
  args.set(match[1], match[2]);
}
const expectedWorldEpoch = args.get("expected-world-epoch");
const approvalReference = args.get("approval-reference");
const approvedDigest = args.get("approved-digest");
const envPath = args.get("env-file");
const uriKey = args.get("uri-key");
const dryRun = args.get("dry-run") === "true";
if (!expectedWorldEpoch || !approvalReference || !approvedDigest || !envPath || !uriKey)
  throw new Error(
    "Usage: applyProducerOpening.ts --expected-world-epoch=<id> --approval-reference=<decision> --approved-digest=<digest> --env-file=<path> --uri-key=<ENV KEY> [--dry-run]"
  );

const requireFromProject = createRequire(resolve(process.cwd(), "package.json"));
const { MongoClient } = requireFromProject("mongodb") as typeof import("mongodb");
const dotenv = requireFromProject("dotenv") as typeof import("dotenv");
const env = dotenv.parse(readFileSync(envPath, "utf8"));
const uri = env[uriKey];
if (!uri) throw new Error(`The explicit connection ${uriKey} is missing`);
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });

async function main() {
  await client.connect();
  const db = client.db();
  const gameState = db.collection<{ _id: string; isActive?: boolean; isProcessing?: boolean }>(
    "gameState"
  );
  const before = await gameState.findOne({ _id: "current" });
  if (!before || before.isProcessing) throw new Error("A turn is processing; try again when idle");
  const wasActive = before.isActive === true;
  if (!dryRun && wasActive)
    await gameState.updateOne(
      { _id: "current", isProcessing: { $ne: true } },
      {
        $set: {
          isActive: false,
          pausedAt: new Date(),
          pauseReason: "Producer opening conversion",
          pauseKind: "manual",
        },
      }
    );
  try {
    const artifact = await captureProducerOpening(db, {
      expectedWorldEpoch: expectedWorldEpoch!,
      approvalReference: approvalReference!,
      requireActive: false,
    });
    if (!artifact.plan || !artifact.planDigest)
      throw new Error(`Opening has blockers: ${artifact.result.blockers.join(", ")}`);
    if (artifact.planDigest !== approvedDigest)
      throw new Error(
        `The live plan (${artifact.planDigest}) differs from the reviewed census (${approvedDigest}); re-run the census`
      );
    if (dryRun) {
      console.log(JSON.stringify({ dryRun: true, planDigest: artifact.planDigest }));
      return;
    }
    const result = await applyProducerOpening(db, {
      plan: artifact.plan,
      planDigest: artifact.planDigest,
      approvedDigest: approvedDigest!,
    });
    console.log(JSON.stringify(result));
  } finally {
    if (!dryRun && wasActive)
      await gameState.updateOne(
        { _id: "current" },
        { $set: { isActive: true, pausedAt: null, pauseReason: null, pauseKind: null } }
      );
    await client.close();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message.replace(/mongodb[^\s]*/gi, "[connection]")
      : "Producer opening apply failed"
  );
  process.exitCode = 1;
});
