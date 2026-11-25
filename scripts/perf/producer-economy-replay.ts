/**
 * Replays a settled turn's producer economy offline and prints stage timings
 * and content digests, so a speedup can be shown to leave the result
 * byte-identical. Reads the stored receipt only; writes nothing.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:<port>/... REPLAY_TURN=<n> \
 *     npx tsx scripts/perf/producer-economy-replay.ts
 *
 * Local databases only. Set SKIP_ADVANCE=1 to time receipt encoding alone.
 * REQUEST=<request.json> [RUNS=n] [RESULT_OUT=<file>] replays an exported
 * request without a database; compare digests across revisions.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { MongoClient } from "mongodb";
import { decodeReceipt, encodeReceipt } from "@/lib/market/producerMarket/receiptStorage";
import { advanceProducerEconomy } from "@/lib/market/producerMarket/production";

const sha = (v: unknown) => encodeReceipt(v).digest;
type Request = Parameters<typeof advanceProducerEconomy>[0];

/** A stored request cannot carry the plant-to-country function; rebuild it from the wage payee scope. */
function withPlantCountries(request: Request): Request {
  const country = new Map(
    request.producers.map((p) => {
      try {
        return [p.id, String((JSON.parse(p.labourRecipientAccountId) as unknown[])[2] ?? "")];
      } catch {
        return [p.id, ""];
      }
    })
  );
  return { ...request, countryOfProducer: (id: string) => country.get(id) || undefined };
}

function replayRequestFile(path: string) {
  const text = readFileSync(path, "utf8");
  const runs = Math.max(1, Number(process.env.RUNS ?? 1));
  for (let run = 0; run < runs; run++) {
    const request = withPlantCountries(JSON.parse(text) as Request);
    const timings: Record<string, any> = {};
    const t = performance.now();
    const cpu = process.cpuUsage();
    const result = advanceProducerEconomy(request, undefined, timings);
    const used = process.cpuUsage(cpu);
    console.log(
      `run ${run + 1} advance ms`,
      Math.round(performance.now() - t),
      "cpu ms",
      Math.round((used.user + used.system) / 1000)
    );
    console.log(JSON.stringify(timings));
    console.log("result digest", sha(result));
    if (run === 0 && process.env.RESULT_OUT)
      writeFileSync(process.env.RESULT_OUT, JSON.stringify(result));
  }
}

async function main() {
  if (process.env.REQUEST) return replayRequestFile(process.env.REQUEST);
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
