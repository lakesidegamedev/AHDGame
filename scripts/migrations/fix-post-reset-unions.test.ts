import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { applyPostResetUnions, censusPostResetUnions } from "./fix-post-reset-unions";

let db: Db;
const EPOCH = "union-cleanup-test-epoch";
const RESET_AT = new Date("2026-10-29T01:55:55.524Z");
const PRE_UNION = new ObjectId();
const POST_UNION = new ObjectId();
const PRE_CHAR = new ObjectId();
const POST_CHAR = new ObjectId();
const PRE_SECTOR = new ObjectId();
const POST_SECTOR = new ObjectId();

beforeEach(async () => {
  const { createInMemoryDb } = await import("@/lib/test-utils/inMemoryDb");
  db = createInMemoryDb() as unknown as Db;
  await db.collection("gameState").insertOne({
    _id: "current" as never,
    worldEpochId: EPOCH,
    preset: "1991-default",
    currentTurn: 532,
    economyReset: { completedAt: RESET_AT },
  });
  await db.collection("states").insertOne({
    _id: "US-CA" as never,
    countryId: "US",
    population: 1_000_000,
    gdp: 1_000_000_000,
  });
  await db.collection("unions").insertMany([
    {
      _id: PRE_UNION,
      countryId: "US",
      sectorType: "manufacturing",
      name: "Old Steelworkers",
      ownerId: PRE_CHAR,
      ownerType: "character",
      foundedByCharacterId: PRE_CHAR,
      treasury: 500_000,
      createdAt: new Date(RESET_AT.getTime() - 86_400_000),
      updatedAt: new Date(RESET_AT.getTime() - 86_400_000),
    },
    {
      _id: POST_UNION,
      countryId: "US",
      sectorType: "retail",
      name: "New Shop Workers",
      ownerId: POST_CHAR,
      ownerType: "character",
      treasury: 12_000,
      createdAt: new Date(RESET_AT.getTime() + 3_600_000),
      updatedAt: new Date(RESET_AT.getTime() + 3_600_000),
    },
  ]);
  for (const [unionId, characterId] of [
    [PRE_UNION, PRE_CHAR],
    [POST_UNION, POST_CHAR],
  ] as const) {
    await db.collection("unionOrganizers").insertOne({
      unionId,
      characterId,
      organizeCount: 1,
      strength: 10,
      totalSpent: 0,
    });
    await db.collection("unionLeaderVotes").insertOne({
      unionId,
      voterCharacterId: characterId,
      candidateCharacterId: characterId,
    });
    await db.collection("unionEndorsements").insertOne({
      unionId,
      billId: new ObjectId(),
      stance: "endorse",
    });
  }
  await db.collection("characters").insertMany([
    { _id: PRE_CHAR, name: "Old Head", unionLeaderOf: PRE_UNION },
    { _id: POST_CHAR, name: "New Head", unionLeaderOf: POST_UNION },
  ]);
  await db.collection("corporateSectors").insertMany([
    {
      _id: PRE_SECTOR,
      corporationId: new ObjectId(),
      countryId: "US",
      sectorType: "manufacturing",
      representingUnionId: PRE_UNION,
    },
    {
      _id: POST_SECTOR,
      corporationId: new ObjectId(),
      countryId: "US",
      sectorType: "retail",
      representingUnionId: POST_UNION,
    },
  ]);
});

describe("post-reset union repair", () => {
  it("plans only the unions created at or before the reset", async () => {
    const plan = await censusPostResetUnions(db, { expectedWorldEpoch: EPOCH });
    expect(plan.deleteUnionIds).toEqual([PRE_UNION.toHexString()]);
    expect(plan.preserveUnionIds).toEqual([POST_UNION.toHexString()]);
    expect(plan.counts).toMatchObject({
      unions: 1,
      organizers: 1,
      leaderVotes: 1,
      endorsements: 1,
      representedSectors: 1,
      characterCaches: 1,
    });
    expect(plan.planDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("wipes the pre-reset union and reseeds the roster, keeping post-reset labour", async () => {
    const plan = await censusPostResetUnions(db, { expectedWorldEpoch: EPOCH });
    const result = await applyPostResetUnions(db, {
      expectedWorldEpoch: EPOCH,
      approvedDigest: plan.planDigest,
      backupDir: mkdtempSync(join(tmpdir(), "union-cleanup-")),
    });
    expect(result.noop).toBe(false);
    expect(result.deletedUnions).toBe(1);
    expect(result.preservedUnions).toBe(1);

    expect(await db.collection("unions").findOne({ _id: PRE_UNION })).toBeNull();
    expect(await db.collection("unions").findOne({ _id: POST_UNION })).not.toBeNull();
    for (const name of ["unionOrganizers", "unionLeaderVotes", "unionEndorsements"]) {
      expect(await db.collection(name).countDocuments({ unionId: PRE_UNION })).toBe(0);
      expect(await db.collection(name).countDocuments({ unionId: POST_UNION })).toBe(1);
    }

    // The stale pointer is cleared and seedUnions hands the rebuilt shop to a
    // new vacant world union. The post-reset union keeps its own shop.
    const repairedSector = await db.collection("corporateSectors").findOne({ _id: PRE_SECTOR });
    expect(repairedSector!.representingUnionId).not.toBeNull();
    expect(repairedSector!.representingUnionId.toString()).not.toBe(PRE_UNION.toHexString());
    expect(await db.collection("corporateSectors").findOne({ _id: POST_SECTOR })).toMatchObject({
      representingUnionId: POST_UNION,
    });

    expect(await db.collection("characters").findOne({ _id: PRE_CHAR })).toMatchObject({
      unionLeaderOf: null,
    });
    expect(await db.collection("characters").findOne({ _id: POST_CHAR })).toMatchObject({
      unionLeaderOf: POST_UNION,
    });
    expect(await db.collection("unions").countDocuments({ ownerId: null })).toBeGreaterThan(0);
  });

  it("is a no-op once the pre-reset unions are gone", async () => {
    const plan = await censusPostResetUnions(db, { expectedWorldEpoch: EPOCH });
    await applyPostResetUnions(db, {
      expectedWorldEpoch: EPOCH,
      approvedDigest: plan.planDigest,
      backupDir: mkdtempSync(join(tmpdir(), "union-cleanup-")),
    });
    const after = await censusPostResetUnions(db, { expectedWorldEpoch: EPOCH });
    expect(after.deleteUnionIds).toEqual([]);
    const second = await applyPostResetUnions(db, {
      expectedWorldEpoch: EPOCH,
      approvedDigest: after.planDigest,
      backupDir: mkdtempSync(join(tmpdir(), "union-cleanup-")),
    });
    expect(second.noop).toBe(true);
  });

  it("refuses a stale digest and a different world epoch", async () => {
    await expect(
      applyPostResetUnions(db, {
        expectedWorldEpoch: EPOCH,
        approvedDigest: "0".repeat(64),
        backupDir: mkdtempSync(join(tmpdir(), "union-cleanup-")),
      })
    ).rejects.toThrow(/reviewed plan/);
    await expect(
      censusPostResetUnions(db, { expectedWorldEpoch: "another-world" })
    ).rejects.toThrow(/World epoch changed/);
  });
});
