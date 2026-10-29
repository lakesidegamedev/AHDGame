/** Explicit dry-run-first operator tool. Reports and backups must stay outside the repository. */
import { writeFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { MongoClient } from "mongodb";
import {
  loadRecoverySnapshot,
  buildRecovery,
  applyLegacyRecovery,
} from "../../src/lib/resetLegislation/recovery/runner";

async function main() {
  const { values } = parseArgs({
    options: {
      "env-file": { type: "string" },
      "uri-key": { type: "string", default: "MONGODB_URI" },
      out: { type: "string" },
      apply: { type: "boolean", default: false },
      "expected-hash": { type: "string" },
      "catch-up": { type: "boolean", default: false },
    },
  });
  if (values["env-file"]) config({ path: values["env-file"], quiet: true });
  const uri = process.env[values["uri-key"]!];
  if (!uri) throw new Error("Requested database environment key is missing");
  if (!values.out) throw new Error("A private --out report path is required");
  const out = resolve(values.out);
  const rel = relative(process.cwd(), out);
  if (!rel.startsWith("..") && !isAbsolute(rel))
    throw new Error("Recovery reports may not be stored in the repository");
  const client = new MongoClient(uri, {
    directConnection: true,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 120000,
  });
  try {
    await client.connect();
    const db = client.db("a-house-divided");
    const snapshot = await loadRecoverySnapshot(db);
    const recovery = buildRecovery(snapshot);
    writeFileSync(out, JSON.stringify(recovery, null, 2), { mode: 0o600 });
    const counts: Record<string, number> = {};
    for (const d of recovery.plan.decisions) counts[d.reason] = (counts[d.reason] ?? 0) + 1;
    console.log(
      JSON.stringify({
        mode: values.apply ? "apply" : "dry-run",
        world: recovery.worldId,
        turn: recovery.turn,
        economyPauseUntilTurn: recovery.economyPauseUntilTurn,
        hash: recovery.hash,
        decisions: counts,
        programs: recovery.programs.length,
        catchUpCandidates: recovery.catchUp.length,
        report: out,
      })
    );
    if (values.apply) {
      if (!values["expected-hash"] || values["expected-hash"] !== recovery.hash)
        throw new Error("Apply needs the reviewed dry-run --expected-hash");
      console.log(
        JSON.stringify(
          await applyLegacyRecovery(db, client, values["expected-hash"], values["catch-up"])
        )
      );
    }
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.name === "Error"
        ? error.message
        : error.name
      : "Recovery failed"
  );
  process.exitCode = 1;
});
