import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
let ownedDb: Db;
vi.mock("@/lib/mongodb", () => ({ getDb: async () => ownedDb }));
import { processPartyInfluenceTurn } from "./partyInfluenceTurn";
import { processCampaignSpendReset } from "@/lib/elections/campaigns/campaignSpendReset";
import { processPartyOrgTurn } from "./partyOrg/turnProcessing";
import { processPressureDecay } from "./politicalStrength/pressureDecay";
import { processBucketApprovalDecay } from "./bucketApprovalDecay";
import { processNppStanceDrift } from "./nppStanceDrift";
import { applyInfraEffects } from "./infraEffects";
function fixture() {
  const f = createTransactionalMemoryDb();
  ownedDb = f.db;
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 100, worldEpochId: "synthetic-recurring" },
  ]);
  f.memory.seed("statePartyOrg", [
    {
      _id: "US-CA_1",
      countryId: "US",
      stateId: "CA",
      partyId: "1",
      organization: 40,
      organizationUnits: 20,
      lastOrganizationBuildTurn: 0,
      treasury: 500,
    },
  ]);
  f.memory.seed("partyStrengthPressure", [
    {
      _id: "US:1:CA",
      countryId: "US",
      stateId: "CA",
      partyId: "1",
      value: 10,
      lastUpdatedTurn: 99,
    },
  ]);
  f.memory.seed("characters", [
    {
      _id: new ObjectId(),
      countryId: "US",
      party: "1",
      policies: { economic: -2, social: -2 },
      partyInfluence: 20,
      infamy: 0,
      stats: { energy: 100 },
      actions: 10,
      bucketApprovals: { test: 10, negative: -5 },
      personalWealth: 500,
    },
  ]);
  f.memory.seed("npps", [
    {
      _id: new ObjectId("0123456789abcdef01234567"),
      countryId: "US",
      homeState: "CA",
      retiredAt: null,
      party: "1",
      bucketApprovals: { test: 20 },
      personalWealth: 500,
      policies: { economic: 0, social: 0 },
      personality: { stubbornness: 0 },
    },
  ]);
  f.memory.seed("states", [
    { _id: "CA", countryId: "US", cachedEconomicLean: -3, cachedSocialLean: -2 },
  ]);
  f.memory.seed("politicalParties", [
    {
      _id: new ObjectId(),
      countryId: "US",
      sequentialId: 1,
      economicPosition: -2,
      socialPosition: -2,
    },
  ]);
  f.memory.seed("campaigns", [{ _id: new ObjectId(), spendStock: 100, spendThisTurn: 20 }]);
  f.memory.seed("infraProjects", [
    {
      _id: new ObjectId(),
      countryId: "US",
      positionId: "secretary_of_transportation",
      archetypeId: "highway",
      regionId: "CA",
      status: "construction",
      progress: 0,
      buildDuration: 6,
      fundingLevel: "standard",
      outputBase: 500,
      upkeepBase: 40,
      constructionCostBase: 120,
      createdTurn: 1,
    },
  ]);
  return f;
}
const transitions = [
  {
    name: "party influence",
    collection: "characters",
    run: async (db: Db) => {
      ownedDb = db;
      const chars = await db
        .collection<import("@/lib/db/types").Character>("characters")
        .find({})
        .toArray();
      return processPartyInfluenceTurn(chars, null, new Date(0), 100);
    },
  },
  {
    name: "campaign spend",
    collection: "campaigns",
    op: "updateMany" as const,
    run: (db: Db) => processCampaignSpendReset(db, 100),
  },
  {
    name: "organization",
    collection: "statePartyOrg",
    run: async (db: Db) => {
      ownedDb = db;
      await processPartyOrgTurn(100, new Date(0));
    },
  },
  {
    name: "pressure",
    collection: "partyStrengthPressure",
    run: (db: Db) => processPressureDecay(100, new Date(0), db),
  },
  {
    name: "buckets",
    collection: "characters",
    run: async (db: Db) => {
      ownedDb = db;
      return processBucketApprovalDecay(100);
    },
  },
  {
    name: "infrastructure",
    collection: "infraProjects",
    run: async (db: Db) => {
      const output = { national: {}, regional: {} };
      await applyInfraEffects(db, "US", "secretary_of_transportation", output, 100);
      return output;
    },
  },
];
describe("recurring effects original-turn identity", () => {
  it.each(transitions)(
    "$name restores landed writes and replays its original result",
    async ({ collection, run, ...transition }) => {
      const { db, memory } = fixture();
      const before = await db.collection(collection).find({}).toArray();
      const fault = withInjectedCrash(memory, {
        collection,
        op: "op" in transition ? transition.op! : "bulkWrite",
        onCall: 1,
        afterWrite: true,
      });
      await expect(run(fault.db)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(await db.collection(collection).find({}).toArray()).toEqual(before);
      const first = await run(db),
        after = await db.collection(collection).find({}).toArray();
      expect(after).not.toEqual(before);
      expect(await run(db)).toEqual(first);
      expect(await db.collection(collection).find({}).toArray()).toEqual(after);
      expect((await db.collection("characters").findOne({}))!.personalWealth).toBe(500);
    }
  );
  it("partial NPP stance batches keep their accepted turn identity", async () => {
    const { db, memory } = fixture(),
      fault = withInjectedCrash(memory, {
        collection: "npps",
        op: "bulkWrite",
        onCall: 1,
        afterWrite: true,
      });
    await expect(processNppStanceDrift(fault.db, 102)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    const accepted = await db.collection("npps").findOne({});
    expect(accepted!.lastStanceDriftTurn).toBe(102);
    expect(await processNppStanceDrift(db, 102)).toEqual({ drifted: 0 });
    expect(await db.collection("npps").findOne({})).toEqual(accepted);
  });
  it("overlapping decay requests consume the starting pressure once", async () => {
    const { db } = fixture();
    const results = await Promise.all([
      processPressureDecay(100, new Date(0), db),
      processPressureDecay(100, new Date(0), db),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect((await db.collection("partyStrengthPressure").findOne({}))!.value).toBe(7);
  });
});
