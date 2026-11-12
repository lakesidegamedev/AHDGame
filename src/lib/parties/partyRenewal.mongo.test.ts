/** Owned, isolated mongod proof of the party renewal shell; never reads a configured URI. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import {
  REAL_MONGO_ENABLED,
  startIsolatedMongod,
  stopIsolatedMongod,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { makeSeededRng } from "@/lib/events/substrate/rng";
import { SPLINTER_CHANCE_BOTH } from "./rules/partyRenewal";
import { processPartyRenewal } from "./partyRenewal";
import { getPartyFrontier } from "./partyFrontier";

/** A world id whose cycle-2 splinter roll succeeds, so the proof is deterministic. */
function splinteringWorldId(): string {
  for (let i = 0; ; i++) {
    const id = `w${i}`;
    if (makeSeededRng(`${id}:DE:2:partyRenewal`)() < SPLINTER_CHANCE_BOTH) return id;
  }
}

describe.skipIf(!REAL_MONGO_ENABLED)("party renewal on real Mongo", () => {
  let fixture: IsolatedMongod;
  let db: Db;
  beforeAll(async () => {
    fixture = await startIsolatedMongod("ahd-party-renewal-");
    db = fixture.db;
  }, 40_000);
  afterAll(async () => {
    if (fixture) await stopIsolatedMongod(fixture);
  });
  beforeEach(async () => {
    await db.dropDatabase();
  });

  const now = new Date();
  const partyDoc = (sequentialId: number, economic: number, social: number) => ({
    _id: new ObjectId(),
    sequentialId,
    countryId: "DE",
    name: ["", "Union Party", "Labour Party", "Fringe Party"][sequentialId],
    abbreviation: ["", "UP", "LP", "FP"][sequentialId],
    color: ["", "#111111", "#222222", "#333333"][sequentialId],
    economicPosition: economic,
    socialPosition: social,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    memberCount: 0,
    isDefault: true,
    createdBy: null,
    treasury: 0,
    nationalTaxRate: 0,
    politicalStrength: 0,
    createdAt: now,
    updatedAt: now,
  });

  async function seedElection(cycle: number) {
    const electionId = new ObjectId();
    await db.collection("elections").insertOne({
      _id: electionId,
      countryId: "DE",
      electionType: "bundestag",
      state: "BE",
      cycle,
      status: "resolved",
    });
    await db.collection("electionVoteTallies").insertOne({
      electionId,
      finalized: true,
      totalVotes: { a: 700, b: 290, c: 10 },
      candidateParties: { a: "1", b: "2", c: "3" },
    });
  }

  async function seedWorld(flag: boolean | undefined, resetWorldId: string) {
    await db.collection("gameState").insertOne({
      _id: "current",
      resetWorldId,
      ...(flag === undefined ? {} : { nppPartyRenewalEnabled: flag }),
    } as never);
    await db
      .collection("countryState")
      .insertOne({ _id: "DE", governmentType: "parliamentary" } as never);
    await db.collection("counters").insertOne({ _id: "party_DE", seq: 3 } as never);
    await db
      .collection("politicalParties")
      .insertMany([partyDoc(1, 1, 1), partyDoc(2, -1, -1), partyDoc(3, 1.5, 1.5)]);
    await db.collection("governmentFormations").insertOne({
      _id: "DE",
      countryId: "DE",
      status: "formed",
      governingPartyId: "1",
    } as never);
    await db
      .collection("governmentApprovals")
      .insertOne({ _id: "DE", approvalRating: 30 } as never);
    const bench = Array.from({ length: 12 }, (_, i) => ({
      _id: new ObjectId(),
      countryId: "DE",
      party: "1",
      homeState: i % 2 === 0 ? "BE" : "BB",
      retiredAt: null,
      policies: { economic: 1 + (i - 6) * 0.3, social: 1 },
    }));
    await db.collection("npps").insertMany(bench);
    const fringe = {
      _id: new ObjectId(),
      countryId: "DE",
      party: "3",
      homeState: "HH",
      retiredAt: null,
    };
    await db.collection("npps").insertOne(fringe);
    // Party 1 holds 7 of 10 seats; one of them is held by a bench NPP.
    await db.collection("electedOfficials").insertMany([
      ...Array.from({ length: 7 }, (_, i) => ({
        countryId: "DE",
        officeType: "bundestag",
        state: "BE",
        party: "1",
        characterId: null,
        nppId: bench[i]._id,
      })),
      { countryId: "DE", officeType: "bundestag", state: "BB", party: "2", characterId: null },
      { countryId: "DE", officeType: "bundestag", state: "BB", party: "2", characterId: null },
      {
        countryId: "DE",
        officeType: "bundestag",
        state: "HH",
        party: "3",
        characterId: null,
        nppId: fringe._id,
      },
    ]);
    return { bench, fringe };
  }

  it("does nothing when the flag is absent", async () => {
    await seedWorld(undefined, "w0");
    await seedElection(1);
    await seedElection(2);
    const summary = await processPartyRenewal(db, 6);
    expect(summary).toEqual({ countries: 0, splinters: 0, foundings: 0, folds: 0 });
    expect(await db.collection("partyRenewalStates").countDocuments()).toBe(0);
    expect(await db.collection("politicalParties").countDocuments()).toBe(3);
  });

  it("records the first election, then splinters and folds after the second", async () => {
    const { bench, fringe } = await seedWorld(true, splinteringWorldId());
    await seedElection(1);
    expect((await processPartyRenewal(db, 6)).countries).toBe(1);
    expect(await db.collection("politicalParties").countDocuments()).toBe(3);
    // Nothing new: the same cycle is never evaluated twice.
    expect((await processPartyRenewal(db, 12)).countries).toBe(0);

    await seedElection(2);
    const summary = await processPartyRenewal(db, 18);
    expect(summary).toMatchObject({ countries: 1, splinters: 1, folds: 1 });

    const fringeParty = await db.collection("politicalParties").findOne({ sequentialId: 3 });
    expect(fringeParty?.isDefunct).toBe(true);
    // The folded party's NPP and seat moved to its nearest neighbour.
    expect((await db.collection("npps").findOne({ _id: fringe._id }))?.party).toBe("1");
    expect((await db.collection("electedOfficials").findOne({ nppId: fringe._id }))?.party).toBe(
      "1"
    );

    const splinter = await db.collection("politicalParties").findOne({ sequentialId: 4 });
    expect(splinter?.renewalOrigin).toEqual({ kind: "splinter", cycle: 2, parentPartyId: "1" });
    expect(splinter?.name).toBe("Union Reform Party");
    const moved = await db.collection("npps").find({ party: "4" }).toArray();
    expect(moved.length).toBe(3);
    const movedSeats = await db
      .collection("electedOfficials")
      .countDocuments({ party: "4", nppId: { $in: moved.map((n) => n._id) } });
    const heldBefore = moved.filter((n) => bench.slice(0, 7).some((b) => b._id.equals(n._id)));
    expect(movedSeats).toBe(heldBefore.length);
    expect(await db.collection("statePartyOrg").countDocuments({ partyId: "4" })).toBeGreaterThan(
      0
    );

    const state = await db.collection("partyRenewalStates").findOne({ _id: "DE" as never });
    expect(state?.lastCycle).toBe(2);
    expect(state?.snapshots).toHaveLength(2);
    expect(state?.events.map((e: { kind: string }) => e.kind).sort()).toEqual(["fold", "splinter"]);
    // Players read both changes in the news feed.
    const titles = (await db.collection("newsPosts").find({ isSystem: true }).toArray()).map(
      (post) => post.title
    );
    expect(titles).toEqual(
      expect.arrayContaining([
        expect.stringContaining("folds into"),
        expect.stringMatching(/^Union Reform Party splits from /),
      ])
    );
  });

  it("lets a party back into a region it held within two cycles", async () => {
    await db.collection("states").insertMany([
      { _id: "BE", countryId: "DE" },
      { _id: "BY", countryId: "DE" },
    ] as never);
    await db.collection("npps").insertOne({
      _id: new ObjectId(),
      countryId: "DE",
      party: "2",
      homeState: "BE",
      retiredAt: null,
    });
    const before = await getPartyFrontier(db, "DE", "2");
    expect(before.frontier.has("BY")).toBe(false);
    await db.collection("partyRenewalStates").insertOne({
      _id: "DE",
      lastCycle: 2,
      cycleIndex: 2,
      snapshots: [],
      heldRegions: { "2": { BY: 1 } },
      events: [],
      updatedAt: now,
    } as never);
    expect((await getPartyFrontier(db, "DE", "2")).frontier.has("BY")).toBe(true);
    await db
      .collection("partyRenewalStates")
      .updateOne({ _id: "DE" as never }, { $set: { cycleIndex: 3 } });
    expect((await getPartyFrontier(db, "DE", "2")).frontier.has("BY")).toBe(false);
  });
});
