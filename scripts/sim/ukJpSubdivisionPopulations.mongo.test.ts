/** Synthetic population qualification on an owned MongoDB process, never a configured database. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, BSON, type Db } from "mongodb";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  REAL_MONGO_ENABLED,
  startIsolatedMongod,
  stopIsolatedMongod,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { seedUKRegions } from "@/lib/countries/uk/seed";
import { seedJPRegions } from "@/lib/countries/jp/seed";
import type { County } from "@/lib/db/types/county";
import { seedCountyPopulations } from "@/lib/counties/seed";
import { seedCohortVectors } from "@/lib/admin/seed/seedCohortVectors";
import { runDemographicFlows } from "@/lib/demographics/phase";
import {
  freezeAndApplyDemographicFlowPlan,
  resumeDemographicFlowReceipt,
  resumePendingDemographicFlowReceipts,
  type DemographicFlowRegionInput,
} from "@/lib/demographics/flowJournal";
import { migration } from "@/lib/migrations/entries/2026-11-01-uk-jp-subdivision-populations";
let fixture: IsolatedMongod | null = null;
let client: MongoClient;
let commands = 0,
  bytes = 0,
  documents = 0;
const counts = () => ({ commands, bytes, documents });
const delta = (before: ReturnType<typeof counts>) => ({
  commands: commands - before.commands,
  replyBsonBytes: bytes - before.bytes,
  returnedDocuments: documents - before.documents,
});
const cases: unknown[] = [];
async function seed(db: Db, year = 2019) {
  const preset = `${year}-default`;
  await seedUKRegions(db, true, () => {}, preset);
  await seedJPRegions(db, true, () => {}, preset);
  await db.collection("gameState").insertOne({
    _id: "current",
    preset,
    worldEpochId: "international",
    currentTurn: 0,
    startingYear: year,
    currentYear: year,
  } as never);
  await db
    .collection("gameConfig")
    .insertOne({ _id: "default", labourSystemMode: "legacy" } as never);
  const states = await db
    .collection<{ _id: string; countryId: string; population: number }>("states")
    .find()
    .toArray();
  await db.collection("macroMetrics").insertMany(
    states.map((s, i) => ({
      _id: s._id,
      population: { birthRate: { value: 50 }, migrationRate: { value: i % 2 ? -0.5 : 0.5 } },
    })) as never[]
  );
  await seedCohortVectors(db, preset, () => {}, { replace: true });
  await seedCountyPopulations(db, { replace: true });
}
async function conserved(db: Db) {
  const [states, subdivisions, cohorts] = await Promise.all([
    db
      .collection<{ _id: string; countryId: string; population: number }>("states")
      .find()
      .toArray(),
    db.collection<County>("counties").find().toArray(),
    db
      .collection<{ _id: string; ages: DemographicFlowRegionInput["agesAfter"] }>(
        "regionDemographics"
      )
      .find()
      .toArray(),
  ]);
  expect(subdivisions).toHaveLength(697);
  for (const state of states) {
    expect(
      subdivisions
        .filter((c) => c.stateId === state._id)
        .reduce((n, c) => n + Number(c.population), 0)
    ).toBe(state.population);
    const cohort = cohorts.find((c) => c._id === state._id)!;
    expect(
      Math.round(
        [...cohort.ages.male, ...cohort.ages.female].reduce((n: number, c: number) => n + c, 0)
      )
    ).toBe(state.population);
  }
  expect(subdivisions.every((c) => Number.isSafeInteger(c.population) && c.population >= 0)).toBe(
    true
  );
  return Object.fromEntries(
    ["UK", "JP"].map((country) => [
      country,
      states.filter((s) => s.countryId === country).reduce((n, s) => n + Number(s.population), 0),
    ])
  );
}
function plan(regionId: string, population: number): DemographicFlowRegionInput {
  const male = Array<number>(101).fill(0);
  male[30] = population;
  return {
    regionId,
    agesAfter: { male, female: Array(101).fill(0) },
    stateAfter: {
      population,
      votingEligiblePopulation: population,
      workingAgePopulation: population,
      militaryServicePopulation: 0,
    },
    metricsAfter: {
      realizedMigrationRate: 0,
      populationGrowth: 0,
      medianAge: 30,
      sexRatio: 100,
      dependencyRatio: 0,
      demographicDecline: 0,
    },
  };
}
describe.runIf(REAL_MONGO_ENABLED)("real Mongo international population subdivisions", () => {
  beforeAll(async () => {
    fixture = await startIsolatedMongod("ahd-ukjp-");
    client = new MongoClient(fixture.uri, { monitorCommands: true });
    client.on("commandStarted", () => commands++);
    client.on("commandSucceeded", (event) => {
      if (typeof event.reply !== "object" || event.reply === null) return;
      const reply = event.reply as { cursor?: { firstBatch?: unknown[]; nextBatch?: unknown[] } };
      bytes += BSON.calculateObjectSize(reply);
      documents += reply.cursor?.firstBatch?.length ?? reply.cursor?.nextBatch?.length ?? 0;
    });
    await client.connect();
  }, 60000);
  afterAll(async () => {
    await client?.close();
    await stopIsolatedMongod(fixture);
    if (process.env.AHD_UKJP_QUALIFICATION_OUT)
      writeFileSync(
        process.env.AHD_UKJP_QUALIFICATION_OUT,
        JSON.stringify(
          {
            scope: "Synthetic UK/JP stocks and real demographic phase; not a full world simulation",
            sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
            newFileHashes: Object.fromEntries(
              execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
                encoding: "utf8",
              })
                .trim()
                .split("\n")
                .filter(Boolean)
                .map((file) => [
                  file,
                  createHash("sha256").update(readFileSync(file)).digest("hex"),
                ])
            ),
            trackedDiffSha256: createHash("sha256")
              .update(execFileSync("git", ["diff", "HEAD"], { maxBuffer: 32 * 1024 * 1024 }))
              .digest("hex"),
            verdict: cases.length === 5 ? "passed" : "incomplete",
            cases,
          },
          null,
          2
        ) + "\n"
      );
  }, 30000);
  it("resets eight presets, preserves reference top-ups, and survives their first demographic turn", async () => {
    const presets: unknown[] = [];
    for (const year of [1953, 1979, 1991, 1999, 2007, 2019, 2023, 2027]) {
      const db = client.db(`international_reset_${year}`);
      await seed(db, year);
      const before = await db.collection<County>("counties").find().sort({ _id: 1 }).toArray();
      await db.collection<County>("counties").updateMany(
        {},
        {
          $set: {
            population: 1,
            populationFlowStamp: { worldEpochId: "old", turn: 99, batchId: "old" },
          },
        }
      );
      await seedCountyPopulations(db, { replace: true });
      expect(await db.collection<County>("counties").find().sort({ _id: 1 }).toArray()).toEqual(
        before
      );
      await runDemographicFlows(db, 1, "international");
      const nations = await conserved(db);
      const current = await db.collection<County>("counties").find().sort({ _id: 1 }).toArray();
      await seedUKRegions(db, false, () => {}, `${year}-default`);
      await seedJPRegions(db, false, () => {}, `${year}-default`);
      await seedCountyPopulations(db);
      expect(await db.collection<County>("counties").find().sort({ _id: 1 }).toArray()).toEqual(
        current
      );
      await conserved(db);
      presets.push({ year, nations });
    }
    cases.push({ name: "all-preset reset, reference preservation and first turn", presets });
  }, 120000);
  it("maintains both countries through 48 demographic turns and measures the first phase", async () => {
    const db = client.db("international_turns");
    await seed(db, 1991);
    let first: ReturnType<typeof delta> | undefined;
    for (let turn = 1; turn <= 48; turn++) {
      const before = counts();
      await runDemographicFlows(db, turn, "international");
      if (turn === 1) first = delta(before);
      await conserved(db);
    }
    cases.push({ name: "48 demographic turns", firstPhase: first, final: await conserved(db) });
  }, 120000);
  it("replays a partially written UK/JP receipt and refuses a reassigned prefecture", async () => {
    const db = client.db("international_replay");
    await seed(db);
    const regions = (
      await db
        .collection<{ _id: string; countryId: string; population: number }>("states")
        .find()
        .toArray()
    ).map((s) => plan(String(s._id), Number(s.population) + 7));
    let fail = true;
    const shell = new Proxy(db, {
      get(target, key) {
        if (key !== "collection") {
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (name: string) => {
          const c = target.collection(name);
          if (name !== "counties") return c;
          return new Proxy(c, {
            get(collection, property) {
              if (property !== "bulkWrite") {
                const value = Reflect.get(collection, property);
                return typeof value === "function" ? value.bind(collection) : value;
              }
              return async (ops: Parameters<typeof c.bulkWrite>[0]) => {
                if (fail) {
                  fail = false;
                  await c.bulkWrite(ops.slice(0, 5));
                  throw new Error("interrupted");
                }
                return c.bulkWrite(ops);
              };
            },
          });
        };
      },
    }) as Db;
    await expect(
      freezeAndApplyDemographicFlowPlan(shell, {
        worldEpochId: "international",
        turn: 1,
        regions,
        stats: { regionsProcessed: 20, circuitBreakerTrips: 0 },
      })
    ).rejects.toThrow("interrupted");
    await db
      .collection("counties")
      .updateOne({ _id: "JP-13" } as never, { $set: { countryId: "US" } });
    await expect(resumeDemographicFlowReceipt(db, "international", 1)).rejects.toThrow(
      "invalid county target"
    );
    await db
      .collection("counties")
      .updateOne({ _id: "JP-13" } as never, { $set: { countryId: "JP" } });
    await resumeDemographicFlowReceipt(db, "international", 1);
    await conserved(db);
    const done = await db.collection<County>("counties").find().sort({ _id: 1 }).toArray();
    await resumeDemographicFlowReceipt(db, "international", 1);
    expect(await db.collection<County>("counties").find().sort({ _id: 1 }).toArray()).toEqual(done);
    cases.push({ name: "partial replay, target identity and duplicate completion" });
  });
  it("recovers an old receipt without subdivision plans before initializing UK/JP stocks", async () => {
    const db = client.db("international_legacy_receipt");
    await seed(db);
    await db.collection<County>("counties").deleteMany({});
    await db
      .collection<{ _id: string; countryId: string; population: number }>("states")
      .updateMany({}, { $set: { countryId: "TST" } });
    const regions = (
      await db
        .collection<{ _id: string; countryId: string; population: number }>("states")
        .find()
        .toArray()
    ).map((s) => plan(String(s._id), Number(s.population) + 11));
    let fail = true;
    const shell = new Proxy(db, {
      get(target, key) {
        if (key !== "collection") {
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (name: string) => {
          const c = target.collection(name);
          if (name !== "states") return c;
          return new Proxy(c, {
            get(collection, property) {
              if (property !== "bulkWrite") {
                const value = Reflect.get(collection, property);
                return typeof value === "function" ? value.bind(collection) : value;
              }
              return async (ops: Parameters<typeof c.bulkWrite>[0]) => {
                if (fail) {
                  fail = false;
                  await c.bulkWrite(ops.slice(0, 1));
                  throw new Error("legacy crash");
                }
                return c.bulkWrite(ops);
              };
            },
          });
        };
      },
    }) as Db;
    await expect(
      freezeAndApplyDemographicFlowPlan(shell, {
        worldEpochId: "international",
        turn: 1,
        regions,
        stats: { regionsProcessed: 20, circuitBreakerTrips: 0 },
      })
    ).rejects.toThrow("legacy crash");
    await db
      .collection<{ _id: string; countryId: string; population: number }>("states")
      .updateMany(
        {
          _id: {
            $in: [
              "LON",
              "SEE",
              "SWE",
              "EAE",
              "EMI",
              "WMI",
              "YHU",
              "NWE",
              "NEE",
              "SCO",
              "WAL",
              "NIR",
            ],
          },
        },
        { $set: { countryId: "UK" } }
      );
    await db
      .collection<{ _id: string; countryId: string; population: number }>("states")
      .updateMany({ countryId: "TST" }, { $set: { countryId: "JP" } });
    await expect(migration.execute(db, { dryRun: false })).rejects.toThrow("pending");
    await resumePendingDemographicFlowReceipts(db, "international", 1);
    await migration.execute(db, { dryRun: false });
    await conserved(db);
    cases.push({ name: "interrupted legacy receipt recovery before subdivision migration" });
  });
  it("dry-runs migration and measures identical parent projections with and without subdivision writes", async () => {
    const baseline = client.db("international_control"),
      candidate = client.db("international_candidate");
    await seed(baseline);
    await seed(candidate);
    const before = await candidate.collection("counties").find().sort({ _id: 1 }).toArray();
    await migration.execute(candidate, { dryRun: true });
    expect(await candidate.collection("counties").find().sort({ _id: 1 }).toArray()).toEqual(
      before
    );
    await baseline.collection("states").updateMany({}, { $set: { countryId: "TST" } });
    const regions = (await candidate.collection("states").find().toArray()).map((s) =>
      plan(String(s._id), Number(s.population) + 37)
    );
    const input = {
      worldEpochId: "international",
      turn: 1,
      regions,
      stats: { regionsProcessed: 20, circuitBreakerTrips: 0 },
    };
    let start = counts();
    await freezeAndApplyDemographicFlowPlan(baseline, input);
    const control = delta(start);
    start = counts();
    await freezeAndApplyDemographicFlowPlan(candidate, input);
    const current = delta(start);
    for (const name of ["states", "regionDemographics", "macroMetrics"]) {
      const projection =
        name === "states"
          ? { _id: 1, population: 1 }
          : name === "regionDemographics"
            ? { _id: 1, ages: 1 }
            : { _id: 1, population: 1 };
      expect(
        await candidate.collection(name).find({}, { projection }).sort({ _id: 1 }).toArray()
      ).toEqual(
        await baseline.collection(name).find({}, { projection }).sort({ _id: 1 }).toArray()
      );
    }
    await conserved(candidate);
    expect(current.commands - control.commands).toBeLessThanOrEqual(8);
    cases.push({
      name: "same parent projection control and subdivision candidate",
      control,
      candidate: current,
    });
  });
});
