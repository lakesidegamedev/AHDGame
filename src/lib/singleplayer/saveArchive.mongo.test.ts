/**
 * Real-mongod round trip for singleplayer save archives. Opt-in: runs when
 * `AHD_TEST_REAL_MONGO=1` (see realMongoFixture); otherwise the suite is a
 * no-op so the default test run spawns nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Binary, Decimal128, Double, Int32, Long, ObjectId, type Db } from "mongodb";
import { initializeLocalReplicaSet } from "@/lib/singleplayer/prepareManagedMongo";
import {
  REAL_MONGO_ENABLED,
  startIsolatedMongod,
  stopIsolatedMongod,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import {
  restoreSaveArchive,
  verifySaveArchive,
  writeSaveArchive,
} from "@/lib/singleplayer/saveArchive";

const describeReal = REAL_MONGO_ENABLED ? describe : describe.skip;

async function snapshot(db: Db) {
  const out: Record<string, { docs: unknown[]; indexes: string[] }> = {};
  for (const entry of await db.listCollections().toArray()) {
    const col = db.collection(entry.name);
    out[entry.name] = {
      docs: (await col.find({}, { sort: { _id: 1 } }).toArray()).map((d) => JSON.stringify(d)),
      indexes: (await col.indexes()).map((i) => i.name as string).sort(),
    };
  }
  return out;
}

describeReal("save archive round trip", () => {
  let mongo: IsolatedMongod;
  let dir: string;

  beforeAll(async () => {
    mongo = await startIsolatedMongod("ahd-save-archive-", { replicaSet: "ahd-local" });
    await initializeLocalReplicaSet(mongo.client.db("admin").admin(), new URL(mongo.uri).host);
    dir = await mkdtemp(path.join(tmpdir(), "ahd-save-files-"));
  }, 60_000);

  afterAll(async () => {
    await stopIsolatedMongod(mongo);
    await rm(dir, { recursive: true, force: true });
  });

  async function seed(db: Db) {
    await db.dropDatabase();
    await db.collection("gameState").insertOne({
      _id: "current" as never,
      currentTurn: 7,
      big: Long.fromString("9007199254740993"),
      whole: new Int32(3),
      fraction: new Double(2),
      money: Decimal128.fromString("12.34"),
      at: new Date("1991-01-01T00:00:00Z"),
      blob: new Binary(Buffer.from([1, 2, 3])),
      nested: { list: [1, "a", null, { x: new ObjectId("504c41594552000000000001") }] },
    });
    await db
      .collection("characters")
      .insertMany(
        Array.from({ length: 2500 }, (_, i) => ({ name: `c${i}`, funds: i, tag: `t${i % 5}` }))
      );
    await db.collection("characters").createIndex({ name: 1 }, { unique: true });
    await db.collection("characters").createIndex({ tag: 1, funds: -1 }, { name: "tag_funds" });
    await db.createCollection("empty");
    await db.collection("emptyIndexed").createIndex({ a: 1 });
    await db.createCollection("capped", { capped: true, size: 4096 });
    await db.collection("capped").insertOne({ n: 1 });
  }

  it("restores exactly what was saved, over a world that has moved on", async () => {
    const db = mongo.db;
    await seed(db);
    const before = await snapshot(db);
    const file = path.join(dir, "a.ahdsave");

    const written = await writeSaveArchive(db, file);
    expect(written.documents).toBe(2502);
    expect(await verifySaveArchive(file)).toEqual(written);

    // The world moves on: edited documents, a deleted one, an extra collection,
    // a dropped index and a changed index.
    await db
      .collection("gameState")
      .updateOne({ _id: "current" as never }, { $set: { currentTurn: 9 } });
    await db.collection("characters").deleteMany({ funds: { $lt: 100 } });
    await db.collection("characters").dropIndex("tag_funds");
    await db.collection("extra").insertOne({ later: true });
    await db.collection("emptyIndexed").dropIndexes();

    const restored = await restoreSaveArchive(db, file);
    expect(restored.documents).toBe(2502);
    expect(await snapshot(db)).toEqual(before);
    const raw = await db.collection("gameState").findOne({ _id: "current" as never });
    expect(raw?.currentTurn).toBe(7);
    expect(Long.isLong(raw?.big)).toBe(true);
    expect((await db.collection("capped").options()).capped).toBe(true);
  }, 120_000);

  it("rebuilds a database that is empty", async () => {
    const db = mongo.db;
    await seed(db);
    const before = await snapshot(db);
    const file = path.join(dir, "b.ahdsave");
    await writeSaveArchive(db, file);
    await db.dropDatabase();
    await restoreSaveArchive(db, file);
    expect(await snapshot(db)).toEqual(before);
  }, 120_000);

  it("refuses a save that is cut short or damaged, before anything is dropped", async () => {
    const db = mongo.db;
    await seed(db);
    const file = path.join(dir, "c.ahdsave");
    await writeSaveArchive(db, file);
    const bytes = await readFile(file);
    const cut = path.join(dir, "cut.ahdsave");
    await writeFile(cut, bytes.subarray(0, Math.floor(bytes.length / 2)));
    await expect(verifySaveArchive(cut)).rejects.toThrow(/save/i);
    const flipped = Buffer.from(bytes);
    flipped[Math.floor(flipped.length / 2)] ^= 0xff;
    const bad = path.join(dir, "bad.ahdsave");
    await writeFile(bad, flipped);
    await expect(verifySaveArchive(bad)).rejects.toThrow(/save/i);
  }, 60_000);
});
