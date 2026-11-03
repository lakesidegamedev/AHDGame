/** Local synthetic Mongo qualification of the added reset step, not a full-world turn. */
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { MongoClient, BSON, type Document } from "mongodb";
import { resetCompletedSnapConfidence } from "../../src/lib/turn/snapConfidence";
const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1];
async function main() {
  const uri = arg("--uri"),
    out = arg("--out");
  if (!process.argv.includes("--uri") || !process.argv.includes("--out"))
    throw Error("--uri and --out are required");
  const url = new URL(uri);
  if (
    url.protocol !== "mongodb:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "27994" ||
    url.username ||
    url.password
  )
    throw Error("Only the isolated local test server is allowed");
  const client = new MongoClient(uri, {
    directConnection: true,
    monitorCommands: true,
    serverSelectionTimeoutMS: 10000,
  });
  let capture = false;
  let commands: { name: string; requestBytes: number; responseBytes: number }[] = [];
  client.on("commandStarted", (e) => {
    if (capture)
      commands.push({
        name: e.commandName,
        requestBytes: BSON.calculateObjectSize(e.command),
        responseBytes: 0,
      });
  });
  client.on("commandSucceeded", (e) => {
    if (capture && commands.length)
      commands[commands.length - 1]!.responseBytes += BSON.calculateObjectSize(e.reply as Document);
  });
  await client.connect();
  const db = client.db("ahd-snap-confidence-qualification");
  try {
    await db.dropDatabase();
    await db.collection<Document & { _id: string }>("governmentFormations").insertMany(
      ["UK", "JP", "DE", "IE"].map((_id, index) => ({
        _id,
        confidenceGauge: index === 3 ? 90 : 0,
        confidenceGaugeHistory: [],
      }))
    );
    const events = ["UK", "JP", "DE", "IE"].map((countryId) => ({
      countryId,
      startTurn: 3,
      turn: 100,
    }));
    const now = new Date("2026-01-01");
    capture = true;
    await resetCompletedSnapConfidence(db, [], now);
    capture = false;
    const empty = [...commands];
    commands = [];
    capture = true;
    await resetCompletedSnapConfidence(db, events, now);
    capture = false;
    const initial = [...commands];
    commands = [];
    const first = await db
      .collection<Document & { _id: string }>("governmentFormations")
      .find({})
      .sort({ _id: 1 })
      .toArray();
    for (const row of first) {
      assert.equal(row.confidenceGauge, 50);
      assert.equal(row.confidenceGaugeHistory.length, 1);
      assert.equal(row.confidenceSnapStartTurn, 3);
    }
    await db
      .collection<Document & { _id: string }>("governmentFormations")
      .updateMany({}, { $set: { confidenceGauge: 47 } });
    capture = true;
    await Promise.all([1, 2].map(() => resetCompletedSnapConfidence(db, events, now)));
    capture = false;
    const replay = [...commands];
    commands = [];
    const after = await db
      .collection<Document & { _id: string }>("governmentFormations")
      .find({})
      .toArray();
    for (const row of after) {
      assert.equal(row.confidenceGauge, 47);
      assert.equal(row.confidenceGaugeHistory.length, 1);
    }
    assert.equal(empty.length, 0);
    assert.equal(initial.length, 1);
    assert.equal(replay.length, 2);
    const sum = (rows: typeof commands) => ({
      commands: rows.length,
      requestBytes: rows.reduce((s, x) => s + x.requestBytes, 0),
      responseBytes: rows.reduce((s, x) => s + x.responseBytes, 0),
    });
    const report = {
      kind: "isolated local Mongo qualification of confidence reset step",
      countries: events.length,
      baselineWithoutReset: sum(empty),
      initialReset: sum(initial),
      twoConcurrentRetries: sum(replay),
      verified: {
        exactly50: true,
        higherConfidenceAlsoReset: true,
        retriesPreserveLaterDrift: true,
        historyRecordedOnce: true,
      },
      scope:
        "Only the added reset step is measured. No complete-world phase timing or multiplayer latency claim.",
    };
    writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report));
  } finally {
    await db.dropDatabase();
    await client.close();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Qualification failed");
  process.exitCode = 1;
});
