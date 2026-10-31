import { seedStates } from "@/lib/admin/seed/seedStates";
/** Isolated synthetic county qualification. Never reads configured MongoDB credentials. */
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { MongoClient, BSON, type Db } from "mongodb";
import {
  REAL_MONGO_ENABLED,
  startIsolatedMongod,
  stopIsolatedMongod,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { migration as countyMigration } from "@/lib/migrations/entries/2026-10-30-county-populations";
import { seedCountyPopulations } from "@/lib/counties/seed";
import { runDemographicFlows } from "@/lib/demographics/phase";
import {
  freezeAndApplyDemographicFlowPlan,
  resumeDemographicFlowReceipt,
  type DemographicFlowRegionInput,
} from "@/lib/demographics/flowJournal";

let fixture: IsolatedMongod | null = null,
  client: MongoClient;
let commands = 0,
  bytes = 0,
  documents = 0;
const counters = () => ({ commands, bytes, documents });
const difference = (before: ReturnType<typeof counters>) => ({
  commands: commands - before.commands,
  replyBsonBytes: bytes - before.bytes,
  returnedDocuments: documents - before.documents,
});
const evidence: Record<string, unknown> = {
  scope: "synthetic county stocks, real demographic phase and journal; not a full world simulation",
  cases: [],
};
const cases = evidence.cases as unknown[];
async function seed(db: Db, ids?: string[]) {
  const all = readdirSync(join(process.cwd(), "src/data/counties")).filter((f) =>
    f.endsWith(".json")
  );
  const selected = all.filter((f) => !ids || ids.includes(f.slice(0, -5)));
  const states = selected.map((f, i) => ({
    _id: f.slice(0, -5),
    countryId: "US",
    population: 100000 + i * 1234,
  }));
  await db.collection("states").insertMany(states as never[]);
  await db.collection("gameState").insertOne({
    _id: "current",
    worldEpochId: "county-qualification",
    currentTurn: 7,
    startingYear: 1991,
    currentYear: 1991,
  } as never);
  await db
    .collection("gameConfig")
    .insertOne({ _id: "default", labourSystemMode: "legacy" } as never);
  await db.collection("regionDemographics").insertMany(
    states.map((s) => {
      const male = Array<number>(101).fill(0);
      for (let age = 20; age < 60; age++) male[age] = s.population / 80;
      return { _id: s._id, countryId: "US", ages: { male, female: [...male] } };
    }) as never[]
  );
  await db.collection("macroMetrics").insertMany(
    states.map((s) => ({
      _id: s._id,
      population: {
        birthRate: { value: 50 },
        migrationRate: { value: s._id === "CA" ? 0.5 : s._id === "TX" ? -0.5 : 0 },
      },
    })) as never[]
  );
  await seedCountyPopulations(db);
}
async function assertConserved(db: Db) {
  const [states, counties, demos] = await Promise.all([
    db.collection("states").find({}).toArray(),
    db.collection("counties").find({}).toArray(),
    db.collection("regionDemographics").find({}).toArray(),
  ]);
  for (const state of states) {
    expect(
      counties.filter((c) => c.stateId === state._id).reduce((n, c) => n + Number(c.population), 0)
    ).toBe(state.population);
    const d = demos.find((d) => d._id === state._id)!;
    expect(
      Math.round([...d.ages.male, ...d.ages.female].reduce((n: number, c: number) => n + c, 0))
    ).toBe(state.population);
  }
  expect(counties.every((c) => Number.isSafeInteger(c.population) && c.population >= 0)).toBe(true);
  return {
    stateCount: states.length,
    countyCount: counties.length,
    countryPopulation: states.reduce((n, s) => n + Number(s.population), 0),
  };
}
function region(id: string, population: number): DemographicFlowRegionInput {
  const male = Array<number>(101).fill(0);
  male[30] = population;
  return {
    regionId: id,
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
describe.runIf(REAL_MONGO_ENABLED)("real Mongo county population qualification", () => {
  beforeAll(async () => {
    fixture = await startIsolatedMongod("ahd-county-");
    client = new MongoClient(fixture.uri, { monitorCommands: true });
    client.on("commandStarted", () => commands++);
    client.on("commandSucceeded", (event) => {
      if (typeof event.reply !== "object" || event.reply === null) return;
      const reply = event.reply as { cursor?: { firstBatch?: unknown[]; nextBatch?: unknown[] } };
      bytes += BSON.calculateObjectSize(reply);
      const c = reply.cursor;
      documents += c?.firstBatch?.length ?? c?.nextBatch?.length ?? 0;
    });
    await client.connect();
  }, 60000);
  afterAll(async () => {
    await client?.close();
    await stopIsolatedMongod(fixture);
    if (process.env.AHD_COUNTY_QUALIFICATION_OUT) {
      evidence.sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
      evidence.trackedDiffSha256 = createHash("sha256")
        .update(execFileSync("git", ["diff", "HEAD"], { maxBuffer: 32 * 1024 * 1024 }))
        .digest("hex");
      evidence.newFileHashes = Object.fromEntries(
        execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" })
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((file) => [file, createHash("sha256").update(readFileSync(file)).digest("hex")])
      );
      evidence.verdict =
        cases.length === (process.env.AHD_COUNTY_BASELINE_MODULE ? 5 : 4) ? "passed" : "incomplete";
      evidence.baselinePopulationSource = JSON.parse(
        readFileSync("src/data/county-population-source.json", "utf8")
      );
      writeFileSync(
        process.env.AHD_COUNTY_QUALIFICATION_OUT,
        JSON.stringify(evidence, null, 2) + "\n"
      );
    }
  }, 30000);
  it("runs 48 demographic turns over every US county with exact state/country conservation", async () => {
    const db = client.db("county_full_phase");
    await seed(db);
    let first: ReturnType<typeof difference> | undefined;
    for (let turn = 8; turn < 56; turn++) {
      await db
        .collection("gameState")
        .updateOne({ _id: "current" } as never, { $set: { currentTurn: turn - 1 } });
      const before = counters();
      await runDemographicFlows(db, turn, "county-qualification");
      if (turn === 8) first = difference(before);
      await assertConserved(db);
    }
    const result = await assertConserved(db);
    expect(result).toMatchObject({ stateCount: 51, countyCount: 3142 });
    cases.push({
      name: "48-turn full US demographic phase",
      verdict: "passed",
      turns: 48,
      ...result,
      firstTurn: first,
    });
  }, 120000);
  it("recovers a real partially applied county batch and replays without duplication", async () => {
    const db = client.db("county_recovery");
    await seed(db, ["WY"]);
    const countyCollection = db.collection("counties");
    let failed = false;
    const interrupted = new Proxy(db, {
      get(target, key) {
        if (key === "collection")
          return (name: string) => {
            if (name !== "counties") return target.collection(name);
            return new Proxy(countyCollection, {
              get(collection, method) {
                if (method === "bulkWrite")
                  return async (...args: Parameters<typeof countyCollection.bulkWrite>) => {
                    if (!failed) {
                      failed = true;
                      await countyCollection.bulkWrite([args[0][0]]);
                      throw new Error("controlled partial county write");
                    }
                    return countyCollection.bulkWrite(...args);
                  };
                const value = Reflect.get(collection, method);
                return typeof value === "function" ? value.bind(collection) : value;
              },
            });
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const input = {
      worldEpochId: "county-qualification",
      turn: 8,
      regions: [region("WY", 100123)],
      stats: { regionsProcessed: 1, circuitBreakerTrips: 0 },
    };
    await expect(freezeAndApplyDemographicFlowPlan(interrupted, input)).rejects.toThrow(
      "controlled partial"
    );
    await resumeDemographicFlowReceipt(db, input.worldEpochId, input.turn);
    await assertConserved(db);
    const saved = await countyCollection.find({}).sort({ _id: 1 }).toArray();
    await freezeAndApplyDemographicFlowPlan(db, { ...input, regions: [region("WY", 900000)] });
    expect(await countyCollection.find({}).sort({ _id: 1 }).toArray()).toEqual(saved);
    cases.push({ name: "partial batch recovery and duplicate replay", verdict: "passed" });
  });
  it("recovers an empty state's population and detects cross-country ID collisions", async () => {
    const db = client.db("county_empty");
    await seed(db, ["WY"]);
    await db.collection("counties").updateMany({}, { $set: { population: 0 } });
    await db.collection("states").updateOne({ _id: "WY" } as never, { $set: { population: 0 } });
    await freezeAndApplyDemographicFlowPlan(db, {
      worldEpochId: "county-qualification",
      turn: 8,
      regions: [region("WY", 25)],
      stats: { regionsProcessed: 1, circuitBreakerTrips: 0 },
    });
    await assertConserved(db);
    const before = await db.collection("counties").findOne({ _id: "56001" } as never);
    await db
      .collection("counties")
      .updateOne({ _id: "56001" } as never, { $set: { countryId: "UK" } });
    await expect(countyMigration.execute(db, { dryRun: true })).rejects.toThrow("existing county");
    await db.collection("counties").replaceOne({ _id: "56001" } as never, before!);
    cases.push({
      name: "empty-state recovery and migration identity validation",
      verdict: "passed",
    });
  });
  it("preserves real county, state and cohort stocks across reference top-ups", async () => {
    const db = client.db("county_reseed");
    await seed(db);
    const before = await db.collection("counties").find({}).sort({ _id: 1 }).toArray();
    await seedStates(db, false, () => {}, "1991-default");
    await assertConserved(db);
    expect(await db.collection("counties").find({}).sort({ _id: 1 }).toArray()).toEqual(before);
    cases.push({ name: "non-reset reference reseed conservation", verdict: "passed" });
  });
  it.runIf(!!process.env.AHD_COUNTY_BASELINE_MODULE)(
    "compares journal commands and bytes on identical state inputs",
    async () => {
      const baseline = (await import(
        pathToFileURL(process.env.AHD_COUNTY_BASELINE_MODULE!).href
      )) as { freezeAndApplyDemographicFlowPlan: typeof freezeAndApplyDemographicFlowPlan };
      const a = client.db("county_baseline"),
        b = client.db("county_candidate");
      await seed(a);
      await seed(b);
      const states = await a.collection("states").find({}).toArray();
      const input = {
        worldEpochId: "county-qualification",
        turn: 8,
        regions: states.map((s) => region(String(s._id), Number(s.population) + 123)),
        stats: { regionsProcessed: 51, circuitBreakerTrips: 0 },
      };
      let before = counters();
      await baseline.freezeAndApplyDemographicFlowPlan(a, input);
      const old = difference(before);
      before = counters();
      await freezeAndApplyDemographicFlowPlan(b, input);
      const current = difference(before);
      const select = {
        _id: 1,
        population: 1,
        votingEligiblePopulation: 1,
        workingAgePopulation: 1,
        militaryServicePopulation: 1,
      };
      expect(
        await b.collection("states").find({}, { projection: select }).sort({ _id: 1 }).toArray()
      ).toEqual(
        await a.collection("states").find({}, { projection: select }).sort({ _id: 1 }).toArray()
      );
      for (const collection of ["regionDemographics", "macroMetrics"]) {
        const projection =
          collection === "regionDemographics" ? { _id: 1, ages: 1 } : { _id: 1, population: 1 };
        expect(
          await b.collection(collection).find({}, { projection }).sort({ _id: 1 }).toArray()
        ).toEqual(
          await a.collection(collection).find({}, { projection }).sort({ _id: 1 }).toArray()
        );
      }
      await assertConserved(b);
      cases.push({
        name: "same-state baseline/candidate journal",
        verdict: "passed",
        baseline: old,
        candidate: current,
      });
    },
    60000
  );
});
