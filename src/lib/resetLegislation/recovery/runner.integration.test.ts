import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Document } from "mongodb";
import { buildOpeningLawBoards1991 } from "../openingBoards1991";
import { loadRecoverySnapshot, buildRecovery, applyLegacyRecovery } from "./runner";
const uri = process.env.LEGACY_RECOVERY_TEST_URI;
const enabled = !!uri;
describe.skipIf(!enabled)("legacy recovery replica-set transaction", () => {
  let client: MongoClient;
  let db: ReturnType<MongoClient["db"]>;
  beforeEach(async () => {
    if (!uri?.startsWith("mongodb://127.0.0.1:27993/"))
      throw new Error("Recovery integration tests require isolated localhost:27993");
    client = new MongoClient(uri);
    await client.connect();
    db = client.db("ahd-legacy-recovery-test-" + new ObjectId().toHexString());
    await db.collection<Document & { _id: string }>("gameState").insertOne({
      _id: "current",
      resetWorldId: "synthetic-world",
      currentTurn: 100,
      currentYear: 1999,
      isProcessing: false,
      legislationSystemVersion: "v2",
    });
    const cases = [
      {
        country: "US",
        region: "GA",
        source: "us.health.prevention.primary",
        count: 5,
        index: 4,
        option: "l4",
      },
      {
        country: "UK",
        region: "WAL",
        source: "uk.infrastructure.transit.primary",
        count: 5,
        index: 4,
        option: "l4",
      },
      {
        country: "JP",
        region: "HOK",
        source: "jp_regional_agriculture",
        count: 7,
        index: 0,
        option: "jp_regional_agriculture_opt_0",
      },
    ];
    const opening = buildOpeningLawBoards1991("synthetic-world", 1);
    for (const c of cases) {
      const billId = new ObjectId();
      await db.collection("stateBills").insertOne({
        _id: billId,
        status: "enacted",
        countryId: c.country,
        stateId: c.region,
        title: "Synthetic service",
        summary: "Synthetic governor work",
        proposedByGovernor: {},
        provisions: [{ legislationTypeId: c.source, policyOptionId: c.option }],
      });
      await db.collection("statePolicies").insertOne({
        countryId: c.country,
        stateId: c.region,
        legislationTypeId: c.source,
        policyOptionId: c.option,
        policyOptionIndex: c.index,
        enactedBy: { kind: "bill", id: billId },
        enactedTurn: 10,
      });
      await db
        .collection<Document & { _id: string }>("states")
        .insertOne({ _id: c.region, countryId: c.country, gdp: 200000, population: 1000000 });
      await db.collection<Document & { _id: string }>("legislationTypes").insertOne({
        _id: c.source,
        policyOptions: Array.from({ length: c.count }, (_, i) => ({
          id: c.country === "JP" ? c.source + "_opt_" + i : "l" + i,
        })),
      });
      await db.collection("enactedLaws").insertOne({
        billId,
        scope: "state",
        stateId: c.region,
        countryId: c.country,
        legislationTypeId: c.source,
        budgetCategory: "services",
      });
      const receipt = {
        programId: "legacy",
        legislationTypeId: c.source,
        policyOptionId: c.option,
        authorizedCost: 1000,
        fundedAmount: 800,
        unfundedAmount: 200,
        implementationFactor: 0.8,
        obligationPriority: 5,
        lastSettledTurn: 50,
        validThroughTurn: 150,
      };
      await db
        .collection<Document & { _id: string }>(
          c.country === "US" ? "stateBudgets" : "regionalBudgets"
        )
        .insertOne({
          _id: c.region,
          countryId: c.country,
          spending: { byCategory: { services: 800 }, total: 800 },
          authorizedSpending: { byCategory: { services: 1000 }, total: 1000 },
          enactedBillCosts: 1000,
          unfundedBillCosts: 200,
          surplus: 200,
          [c.country === "US" ? "regionalProgramSettlements" : "programSettlements"]: {
            legacy: receipt,
          },
        });
      await db
        .collection<Document & { _id: string }>("resetLawOpeningBoards")
        .insertOne(opening.find((b) => b._id === c.country + ":" + c.region)!);
    }
    await db
      .collection("statePolicies")
      .insertOne({ stateId: "GA", legislationTypeId: "unrelated-tax", policyOptionId: "rate:7" });
    await db.collection("subsidies").insertOne({ stateId: "GA", active: true });
  });
  afterEach(async () => {
    if (db) await db.dropDatabase();
    if (client) await client.close();
  });
  it("commits all three countries atomically, preserves unrelated data, and reruns safely", async () => {
    const recovery = buildRecovery(await loadRecoverySnapshot(db));
    expect(recovery.programs).toHaveLength(3);
    expect(await applyLegacyRecovery(db, client, recovery.hash, false)).toMatchObject({
      programs: 3,
      retired: 3,
      catchUp: 0,
    });
    expect(
      await db.collection("statePolicies").countDocuments({ legislationTypeId: "unrelated-tax" })
    ).toBe(1);
    expect(await db.collection("subsidies").countDocuments({ active: true })).toBe(1);
    expect(await db.collection("stateBills").countDocuments({ status: "enacted" })).toBe(3);
    expect(await db.collection("resetLawPrograms").countDocuments()).toBe(3);
    const receipt = await db.collection("resetLawEnactmentReceipts").findOne({});
    expect(receipt!.recovery.before.policies).toHaveLength(3);
    expect(await applyLegacyRecovery(db, client, "previous-dry-run", true)).toEqual({
      alreadyApplied: true,
    });
    expect(await db.collection("resetLawPrograms").countDocuments()).toBe(3);
  });
  it("rolls back programs, policies, budgets and turn lock when the final receipt cannot commit", async () => {
    await db.createCollection("resetLawEnactmentReceipts", {
      validator: { forbidden: { $exists: true } },
      validationAction: "error",
    });
    const before = JSON.stringify(await db.collection("stateBudgets").find({}).toArray());
    const recovery = buildRecovery(await loadRecoverySnapshot(db));
    await expect(applyLegacyRecovery(db, client, recovery.hash, false)).rejects.toThrow();
    expect(await db.collection("resetLawPrograms").countDocuments()).toBe(0);
    expect(await db.collection("statePolicies").countDocuments()).toBe(4);
    expect(JSON.stringify(await db.collection("stateBudgets").find({}).toArray())).toBe(before);
    expect(await db.collection("gameState").findOne({})).toMatchObject({
      isProcessing: false,
      currentTurn: 100,
    });
  });
  it("applies bounded proxy catch-up without rewriting historical readings", async () => {
    await db
      .collection<Document & { _id: string }>("states")
      .updateOne({ _id: "GA" }, { $set: { gdp: 0.001 } });
    await db
      .collection<Document & { _id: string }>("resetLawOpeningBoards")
      .updateOne({ _id: "US:GA" }, { $set: { "references.L19.sourceComponents": [] } });
    const observation = {
      metricId: "23",
      path: "health.publicHealthReadiness",
      value: 40,
      status: "proxy",
      source: "provisional continuity owner: public health",
      owner: "public health",
      note: "Synthetic estimate",
    };
    const history = { "23": [{ turn: 99, value: 40 }] };
    await db.collection<Document & { _id: string }>("resetMetricSnapshots").insertOne({
      _id: "US:GA",
      worldId: "synthetic-world",
      countryId: "US",
      scope: "regional",
      regionId: "GA",
      sourceTurn: 1,
      asOfTurn: 100,
      openingValues: { "23": 40 },
      observations: { "23": observation },
      history,
    });
    const recovery = buildRecovery(await loadRecoverySnapshot(db));
    expect(recovery.catchUp.find((c) => c.metricId === "23")?.conditionDelta).toBeGreaterThan(0);
    await applyLegacyRecovery(db, client, recovery.hash, true);
    const after = await db
      .collection<Document & { _id: string }>("resetMetricSnapshots")
      .findOne({ _id: "US:GA" });
    expect(after!.observations["23"].value).toBeGreaterThan(40);
    expect(after!.history).toEqual(history);
    const receipt = await db.collection("resetLawEnactmentReceipts").findOne({});
    expect(receipt!.recovery.before.observations[0].observation).toEqual(observation);
  });
});
