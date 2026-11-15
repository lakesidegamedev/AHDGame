/**
 * Replays a settled turn's producer economy offline and prints stage timings
 * and content digests, so a speedup can be shown to leave the result
 * byte-identical. Reads the stored receipt only; writes nothing.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:<port>/... REPLAY_TURN=<n> \
 *     npx tsx scripts/perf/producer-economy-replay.ts
 *
 * Local databases only. Set SKIP_ADVANCE=1 to time receipt encoding alone.
 */
import { MongoClient } from "mongodb";
import { decodeReceipt, encodeReceipt } from "@/lib/market/producerMarket/receiptStorage";
import { advanceProducerEconomy } from "@/lib/market/producerMarket/production";

const sha = (v: unknown) => encodeReceipt(v).digest;
async function main() {
  const uri = process.env.MONGODB_URI ?? "";
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri))
    throw new Error("Refusing to run against a non-local database.");
  const client = await MongoClient.connect(uri);
  const db = client.db("a-house-divided");
  const turn = Number(process.env.REPLAY_TURN ?? 774);
  const rec = await db.collection("producerEconomyTurns").findOne({ turn });
  let t = performance.now();
  const frozen: any = await decodeReceipt(db, rec as any);
  console.log("decode ms", Math.round(performance.now() - t));
  await client.close();
  const timings: Record<string, any> = {};
  t = performance.now();
  if (process.env.SKIP_ADVANCE !== "1") {
    const result = advanceProducerEconomy(frozen.request, undefined, timings);
    console.log("advance ms", Math.round(performance.now() - t));
    console.log(JSON.stringify(timings));
    console.log("result digest", sha(result));
  }
  t = performance.now();
  const enc = encodeReceipt(frozen);
  console.log(
    "encode ms",
    Math.round(performance.now() - t),
    "digest",
    enc.digest,
    "chunks",
    enc.chunks.length
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
