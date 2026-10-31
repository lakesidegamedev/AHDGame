/**
 * Corporation detail payload byte measurement.
 *
 * The corporation detail page is the highest-traffic route family in the game
 * (67k pageviews / 30 days), and its payload is built by
 * `loadCorporationDetailView`. This script loads that payload straight from a
 * benchmark database and reports its JSON size, broken down by top-level key,
 * so a payload change can be proven instead of estimated.
 *
 * Usage:
 *   MONGODB_URI=mongodb://127.0.0.1:27018/perf_turn_baseline \
 *     npx tsx scripts/perf/corporation-payload.ts [sequentialId|objectId] [--sectors=3]
 *
 * Reports raw and gzip/brotli sizes: the API sends the body compressed at the
 * origin, so the wire number is the compressed one.
 */
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { MongoClient, ObjectId } from "mongodb";
import type { Corporation } from "../../src/lib/db/types";
import { loadCorporationDetailView } from "../../src/lib/corporations/queries/corporationDetail";

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  const target = process.argv.find(
    (a) => !a.startsWith("-") && a !== process.argv[0] && a !== process.argv[1]
  );
  const sectorLimitArg = process.argv.find((a) => a.startsWith("--sectors="));
  const sectorLimit = sectorLimitArg ? Number(sectorLimitArg.split("=")[1]) : 0;

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const db = client.db();

  const filter =
    target && /^[0-9a-f]{24}$/.test(target)
      ? { _id: new ObjectId(target) }
      : { sequentialId: Number(target ?? 1) };
  const corporation = await db.collection<Corporation>("corporations").findOne(filter);
  if (!corporation) throw new Error(`corporation not found: ${JSON.stringify(filter)}`);

  const gameState = await db.collection("gameState").findOne({ _id: "current" as never });
  const currentTurn = Number((gameState as { currentTurn?: number } | null)?.currentTurn ?? 0);

  const started = Date.now();
  const view = await loadCorporationDetailView({ db, corporation, currentTurn });
  const elapsed = Date.now() - started;

  const payload = view as unknown as Record<string, unknown>;
  let sectors = payload.sectors as Array<Record<string, unknown>> | undefined;
  if (sectorLimit > 0 && Array.isArray(sectors)) sectors = sectors.slice(0, sectorLimit);

  const body = JSON.stringify({ ...payload, sectors });
  const bytes = Buffer.byteLength(body);
  const gz = gzipSync(body).byteLength;
  const br = brotliCompressSync(body, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
  }).byteLength;

  console.log(
    `corporation=${String(corporation.sequentialId)} "${corporation.name}" sectors=${
      Array.isArray(payload.sectors) ? (payload.sectors as unknown[]).length : 0
    } loadMs=${elapsed}`
  );
  console.log(`payload raw=${kb(bytes)} gzip=${kb(gz)} brotli=${kb(br)}`);
  console.log("top-level keys by size:");
  const rows = Object.entries({ ...payload, sectors })
    .map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value ?? null))] as const)
    .sort((a, b) => b[1] - a[1]);
  for (const [key, size] of rows.slice(0, 12)) {
    console.log(`  ${kb(size).padStart(9)}  ${key}`);
  }
  if (Array.isArray(payload.sectors) && (payload.sectors as unknown[]).length > 0) {
    const first = (payload.sectors as Array<Record<string, unknown>>)[0];
    const rowsInSector = Object.entries(first)
      .map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value ?? null))] as const)
      .sort((a, b) => b[1] - a[1]);
    console.log("largest sector-row fields (sector 0):");
    for (const [key, size] of rowsInSector.slice(0, 6)) {
      console.log(`  ${kb(size).padStart(9)}  ${key}`);
    }
  }

  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
