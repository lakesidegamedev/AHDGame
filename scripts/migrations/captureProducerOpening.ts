/**
 * Read-only, repeatable census for the unified producer opening plan.
 *
 * This command never writes to Mongo. It requires an explicit expected world
 * generation, records the live turn fence and writes a mode-0600 local artifact.
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { captureProducerOpening } from "@/lib/market/producerMarket/openingCapture";

export { captureProducerOpening };

function cliSetup() {
  const args = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) throw new Error(`Expected --name=value, got ${arg}`);
    args.set(match[1], match[2]);
  }

  const expectedWorldEpoch = args.get("expected-world-epoch");
  const approvalReference = args.get("approval-reference");
  const outputPath = args.get("output");
  const envPath = args.get("env-file");
  if (!expectedWorldEpoch || !approvalReference || !outputPath || !envPath)
    throw new Error(
      "Usage: captureProducerOpening.ts --expected-world-epoch=<id> --approval-reference=<decision> --env-file=<path> --output=<private-json>"
    );
  const expectedWorldEpochValue = expectedWorldEpoch as string;
  const approvalReferenceValue = approvalReference as string;
  const outputPathValue = outputPath as string;
  const envPathValue = envPath as string;

  const requireFromProject = createRequire(resolve(process.cwd(), "package.json"));
  const { MongoClient } = requireFromProject("mongodb") as typeof import("mongodb");
  const dotenv = requireFromProject("dotenv") as typeof import("dotenv");
  const env = dotenv.parse(readFileSync(envPathValue, "utf8"));
  const uriKey = args.get("uri-key") ?? "HEAL_MONGODB_URI_PROD";
  const uri = env[uriKey];
  if (!uri) throw new Error(`The explicit connection ${uriKey} is missing`);
  const databaseName =
    env.MONGODB_DB ||
    env.MONGO_DB_NAME ||
    decodeURIComponent(
      (uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/) ?? [])[1] ?? "a-house-divided"
    );
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  return {
    expectedWorldEpochValue,
    approvalReferenceValue,
    outputPathValue,
    client,
    databaseName,
  };
}

async function main() {
  const { expectedWorldEpochValue, approvalReferenceValue, outputPathValue, client, databaseName } =
    cliSetup();
  try {
    await client.connect();
    const db = client.db(databaseName);
    const artifact = await captureProducerOpening(db, {
      expectedWorldEpoch: expectedWorldEpochValue,
      approvalReference: approvalReferenceValue,
      requireActive: true,
    });
    const destination = resolve(outputPathValue);
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFileSync(destination, `${JSON.stringify(artifact, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    console.log(JSON.stringify(artifact.result));
  } finally {
    await client.close();
  }
}

if (process.argv[1]?.endsWith("captureProducerOpening.ts"))
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message.replace(/mongodb[^\s]*/gi, "[connection]")
        : "Read-only producer opening capture failed"
    );
    process.exitCode = 1;
  });
