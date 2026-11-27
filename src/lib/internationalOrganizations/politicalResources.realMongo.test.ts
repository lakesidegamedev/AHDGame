import type { NPP } from "@/lib/db/types";
import { processBillVoting } from "@/lib/turn/npp/billVoting";
import type { NPPContext } from "@/lib/turn/npp/context";
import { adjustPopularLegitimacy } from "@/lib/turn/popularLegitimacy";
import { adjustLeaderConfidence } from "@/lib/turn/rulingPartyConfidence";
import { topUpOfficePool, OFFICE_POOL_TOP_UP_AP_COST } from "@/lib/actions/officePoolTopUp";
import { applyDefenceRefit } from "@/lib/turn/defenceRefitTurn";
import { applyNavalRepair } from "@/lib/turn/navalRepairTurn";
import { processCrisisEmergencyBills } from "@/lib/crises/levers/emergencyBill";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { makeDefinition } from "@/lib/crises/v2/testFixtures";
import {
  registerCrisisDefinition,
  resetCrisisV2RegistryForTests,
} from "@/lib/turn/crisisV2/registry";
import { leverActionCost } from "@/lib/crises/v2/leverActions";
import { publishNppBillVotes, type NppBillVotePublication } from "@/lib/turn/npp/publishBillVotes";
import { issueOrder } from "@/lib/governorOffice/orders/issueOrder";
let ownedDb: Db | undefined;
vi.mock("@/lib/mongodb", () => ({
  getDb: async () => {
    if (!ownedDb) throw new Error("Owned test database is not initialized");
    return ownedDb;
  },
}));
import { recordPrimarySnapshots } from "@/lib/turn/primarySnapshots";
vi.mock("@/lib/demographics/granularElectorate", async (original) => ({
  ...(await original<typeof import("@/lib/demographics/granularElectorate")>()),
  buildGranularElectorateSubstrate: () => ({ totalPool: 1000000 }),
}));
import { rewindHalfTick } from "@/lib/turn/subhour/rewindHalfTick";
import { runCensus } from "@/lib/turn/census";
import { collectFiscalTaxes } from "@/lib/budget/fiscalScaleTurn";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db, type Document } from "mongodb";
import {
  startIsolatedMongod,
  stopIsolatedMongod,
  REAL_MONGO_ENABLED,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import {
  applyTensionEvent,
  getColdWarTension,
  runTensionTurn,
  stepTension,
} from "@/lib/coldwar/tension";
import { spendDiplomaticAction } from "./diplomaticActions";
import { ensureStatePartyOrgRow } from "@/lib/turn/partyOrg/ensureStatePartyOrgRow";
import { migration as rekey } from "@/lib/migrations/entries/2026-09-02-state-party-org-rekey";
describe.skipIf(!REAL_MONGO_ENABLED)("political resource settlements on owned Mongo", () => {
  let mongo: IsolatedMongod | null = null,
    db: Db;
  beforeAll(async () => {
    mongo = await startIsolatedMongod("ahd-political-settlement-", {
      replicaSet: "politicalSettlement",
    });
    await mongo.client.db("admin").command({
      replSetInitiate: {
        _id: "politicalSettlement",
        members: [{ _id: 0, host: new URL(mongo.uri).host }],
      },
    });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if ((await mongo.client.db("admin").command({ hello: 1 })).isWritablePrimary) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect((await mongo.client.db("admin").command({ hello: 1 })).isWritablePrimary).toBe(true);
    db = mongo.db;
    ownedDb = db;
  }, 60000);
  afterAll(async () => {
    await stopIsolatedMongod(mongo);
  }, 30000);
  beforeEach(async () => {
    await db.dropDatabase();
    await db.collection("gameState").insertOne({
      _id: "current",
      currentTurn: 100,
      isProcessing: false,
      worldEpochId: "test",
      forexEnabled: false,
    } as never);
  });
  it("concurrent first spends cannot exceed the diplomatic allowance", async () => {
    const replies = await Promise.allSettled(
      Array.from({ length: 12 }, () => spendDiplomaticAction(db, "CA", 100))
    );
    const accepted = replies.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    let remaining = 4 - accepted;
    while (remaining-- > 0) expect((await spendDiplomaticAction(db, "CA", 100)).ok).toBe(true);
    expect((await spendDiplomaticAction(db, "CA", 100)).ok).toBe(false);
    expect(await db.collection("diplomaticActions").countDocuments({ countryId: "CA" })).toBe(1);
    expect((await db.collection("diplomaticActions").findOne({ countryId: "CA" }))?.remaining).toBe(
      0
    );
  });
  it("event and refresh races keep the event, marker and a valid serial value", async () => {
    const pressures = {
      escalationLevel: 0,
      activeCrises: 0,
      totalWarheads: 0,
      nuclearWarIntensity: 0,
      nuclearWarCount: 0,
      otherWarIntensity: 0,
    };
    await db.collection<Document & { _id: string }>("coldWarTension").insertOne({
      _id: "current",
      value: 40,
      pressureFloor: 12,
      updatedTurn: 99,
      events: [],
      updatedAt: new Date(0),
    });
    await Promise.all([
      runTensionTurn(db, 100, pressures),
      applyTensionEvent(db, 100, "escalation", "Synthetic shock", 8, { eventId: "shock" }),
    ]);
    const state = await getColdWarTension(db);
    expect([stepTension(48, pressures), stepTension(40, pressures) + 8]).toContain(state.value);
    expect(state.appliedEventIds).toEqual(["shock"]);
    expect(state.events).toHaveLength(1);
    await runTensionTurn(db, 100, pressures);
    await applyTensionEvent(db, 100, "escalation", "Synthetic shock", 8, { eventId: "shock" });
    expect((await getColdWarTension(db)).value).toBe(state.value);
  });
  it.each(["runtime", "migration"])(
    "rekeys a chapter without losing indexed scope resources via %s",
    async (path) => {
      const col = db.collection<Document & { _id: string }>("statePartyOrg");
      await col.createIndex({ countryId: 1, stateId: 1, partyId: 1 }, { unique: true });
      await col.insertOne({
        _id: "NW_7",
        countryId: "DD",
        stateId: "NW",
        partyId: "1",
        treasury: 500,
        politicalStrength: 25,
        organization: 30,
      });
      if (path === "runtime")
        await ensureStatePartyOrgRow(db, {
          countryId: "DD",
          stateId: "NW",
          party: { sequentialId: 1 } as never,
          hasPresence: true,
        });
      else await rekey.execute(db, { dryRun: false });
      expect(await col.countDocuments({})).toBe(1);
      expect(await col.findOne({})).toMatchObject({
        _id: "NW_1",
        treasury: 500,
        politicalStrength: 25,
        organization: 30,
      });
    }
  );
  it("fiscal taxes replay their recorded amount and ledger, using no current quote", async () => {
    await db.collection<Document & { _id: string }>("producerEconomyAccounts").insertOne({
      _id: "households-US",
      kind: "households",
      countryId: "US",
      worldEpoch: "synthetic",
      currency: "USD",
      cash: 1000,
    });
    await db
      .collection<Document & { _id: string }>("federalBudget")
      .insertOne({ _id: "US", countryId: "US", treasuryCashLocal: 50 });
    const input = {
      turn: 100,
      worldEpoch: "synthetic",
      budgets: [{ _id: "US", countryId: "US", currencyCode: "USD", revenue: { total: 1000000 } }],
      scaleByBudget: new Map([["US", 1]]),
      rateByCurrency: new Map([["USD", 1]]),
    };
    const first = await collectFiscalTaxes(db, input);
    const retry = await collectFiscalTaxes(db, {
      ...input,
      rateByCurrency: new Map(),
      budgets: [{ ...input.budgets[0], revenue: { total: 0 } }],
    });
    expect(retry).toEqual(first);
    expect(first.get("US")).toBe(100);
    expect((await db.collection("federalBudget").findOne({}))?.treasuryCashLocal).toBe(150);
    expect((await db.collection("producerEconomyAccounts").findOne({}))?.cash).toBe(900);
    expect(await db.collection("ledgerEntries").countDocuments({})).toBe(1);
  });
  it("overlapping census runs publish original deltas and one complete district map", async () => {
    await db.collection<Document & { _id: string }>("states").insertMany([
      { _id: "TX", countryId: "US", population: 3000000, houseDistricts: 38 },
      { _id: "CA", countryId: "US", population: 2000000, houseDistricts: 52 },
    ]);
    const replies = await Promise.all([runCensus(db, 100, 2030), runCensus(db, 100, 2030)]);
    expect(replies[0]).toEqual(replies[1]);
    expect(replies[0].ran).toBe(true);
    expect(replies[0].deltas?.map((delta) => delta.from)).toEqual([38, 52]);
    expect(await db.collection("congressionalDistricts").countDocuments({})).toBe(435);
    expect(await db.collection("newsPosts").countDocuments({})).toBe(1);
    expect(await runCensus(db, 100, 2030)).toEqual(replies[0]);
  });
  it.each([false, true])(
    "rewind preserves a concurrent rate write (new tick: %s)",
    async (futureTick) => {
      await db.collection<Document & { _id: string }>("exchangeRates").insertOne({
        _id: "CA",
        rate: 2,
        subhourStep: { turn: 100, fraction: 0.5 },
        subhourBase: { forex: { turn: 100, rate: { base: 1, written: 2 } } },
      });
      let armed = true;
      const raced = new Proxy(db, {
        get(target, key) {
          if (key !== "collection") {
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          }
          return (name: string) => {
            const collection = target.collection(name);
            return new Proxy(collection, {
              get(col, prop) {
                if (name === "exchangeRates" && prop === "find")
                  return (...args: Parameters<typeof col.find>) => {
                    const cursor = col.find(...args);
                    return new Proxy(cursor, {
                      get(cur, method) {
                        if (method === "toArray")
                          return async () => {
                            const rows = await cur.toArray();
                            if (armed) {
                              armed = false;
                              await db
                                .collection<Document & { _id: string }>("exchangeRates")
                                .updateOne(
                                  { _id: "CA" },
                                  {
                                    $set: {
                                      rate: 3,
                                      ...(futureTick
                                        ? {
                                            subhourStep: { turn: 101, fraction: 0.5 },
                                            subhourBase: {
                                              forex: { turn: 101, rate: { base: 2, written: 3 } },
                                            },
                                          }
                                        : {}),
                                    },
                                  }
                                );
                            }
                            return rows;
                          };
                        const value = Reflect.get(cur, method);
                        return typeof value === "function" ? value.bind(cur) : value;
                      },
                    });
                  };
                const value = Reflect.get(col, prop);
                return typeof value === "function" ? value.bind(col) : value;
              },
            });
          };
        },
      });
      await rewindHalfTick(raced, 100);
      expect(armed).toBe(false);
      const actual = await db.collection("exchangeRates").findOne({});
      expect(actual?.rate).toBe(futureTick ? 3 : 1.5);
      if (futureTick) expect(actual?.subhourStep.turn).toBe(101);
      else expect(actual?.subhourStep).toBeUndefined();
    }
  );

  it("overlapping primary publication banks the same ballots as one pass with a fixed electorate", async () => {
    const election = new ObjectId(),
      character = new ObjectId(),
      candidate = new ObjectId();
    const now = new Date("2026-01-01T00:00:00Z");
    await db
      .collection<Document & { _id: string }>("gameState")
      .updateOne(
        { _id: "current" },
        { $set: { currentYear: 2027, startingYear: 2027, preset: "2027-default" } }
      );
    await db.collection("elections").insertOne({
      _id: election,
      electionType: "senate",
      status: "active",
      countryId: "US",
      state: "CA",
      seatId: "US-senate-CA-1",
      startTurn: 80,
      primaryEndTurn: 110,
      endTurn: 140,
    });
    await db.collection("electionCandidates").insertOne({
      _id: candidate,
      electionId: election,
      characterId: character,
      characterName: "Synthetic candidate",
      party: "1",
      status: "active",
      isNPP: false,
    });
    await db.collection("characters").insertOne({
      _id: character,
      countryId: "US",
      homeState: "CA",
      policies: { economic: 0, social: 0 },
      favorability: 50,
      politicalInfluence: 50,
    });
    await db
      .collection("politicalParties")
      .insertOne({ countryId: "US", sequentialId: 1, economicPosition: 0, socialPosition: 0 });
    await db
      .collection<Document & { _id: string }>("states")
      .insertOne({ _id: "CA", countryId: "US", population: 2000000 });
    await db
      .collection<Document & { _id: string }>("stateDemographics")
      .insertOne({ _id: "CA", countryId: "US", groups: {}, categoryWeights: {} });
    await db.collection<Document & { _id: string }>("statePartyOrg").insertOne({
      _id: "CA_1",
      countryId: "US",
      stateId: "CA",
      partyId: "1",
      registration: 40,
      organization: 40,
    });
    expect(await recordPrimarySnapshots(now, 100, undefined, { db })).toBe(1);
    const baseline = (await db.collection("electionVoteTallies").findOne({ electionId: election }))
      ?.primaryVotes;
    expect(Object.values(baseline ?? {}).some((n) => Number(n) > 0)).toBe(true);
    await db.collection("primarySnapshots").deleteMany({});
    await db.collection("electionVoteTallies").deleteMany({});
    const replies = await Promise.all([
      recordPrimarySnapshots(now, 100, undefined, { db }),
      recordPrimarySnapshots(now, 100, undefined, { db }),
    ]);
    expect(replies.reduce((n, count) => n + count, 0)).toBe(1);
    expect(
      (await db.collection("electionVoteTallies").findOne({ electionId: election }))?.primaryVotes
    ).toEqual(baseline);
    expect(await db.collection("primarySnapshots").countDocuments({})).toBe(1);
  });

  it("parallel multi-batch NPP publication keeps one ballot and explanation per bill", async () => {
    const voter = new ObjectId(),
      vote = `npp_${voter.toHexString()}`;
    const plans: NppBillVotePublication[] = Array.from({ length: 35 }, () => ({
      billId: new ObjectId(),
      status: "active",
      observedVotes: { [`votes.${vote}`]: { $exists: false } },
      setFields: { [`votes.${vote}`]: "for" },
      incFields: { votesFor: 1 },
      votesCast: 1,
      predictions: [
        {
          nppId: voter,
          forces: { ideology: 10, whip: 0, district: 0, donors: 10 },
          donorsLabel: "Synthetic business interest",
          verdict: "for",
          resolvedVote: "for",
        },
      ],
      interestNppIds: [voter],
    }));
    await db
      .collection("bills")
      .insertMany(
        plans.map((plan) => ({ _id: plan.billId, status: "active", votes: {}, votesFor: 0 }))
      );
    await db.collection("npps").insertOne({ _id: voter, favorability: 50 });
    const replies = await Promise.all([
      publishNppBillVotes(db, plans, 100, new Date()),
      publishNppBillVotes(db, plans, 100, new Date()),
    ]);
    expect(replies.reduce((sum, n) => sum + n, 0)).toBe(35);
    expect((await db.collection("npps").findOne({}))?.favorability).toBe(49);
    expect(await db.collection("nppVotePredictions").countDocuments({})).toBe(35);
    expect((await db.collection("bills").find({}).toArray()).every((b) => b.votesFor === 1)).toBe(
      true
    );
  });
  it("competing executive orders cannot spend the same office action", async () => {
    const characterId = new ObjectId();
    await db
      .collection<Document & { _id: string }>("governorOfficeState")
      .insertOne({ _id: "TX", countryId: "US", stateId: "TX", gubernatorialActions: 1 });
    await db.collection<Document & { _id: string }>("legislationTypes").insertMany(
      ["synthetic-law", "second-law"].map((_id) => ({
        _id,
        policyOptions: [0, 1, 2, 3, 4].map((n) => ({
          id: `option-${n}`,
          economic: n,
          social: n,
        })),
      }))
    );
    const input = {
      countryId: "US",
      stateId: "TX",
      characterId,
      characterName: "Synthetic governor",
      legislationTypeId: "synthetic-law",
      effectDirection: 1,
    } as const;
    const replies = await Promise.all([
      issueOrder(db, input),
      issueOrder(db, { ...input, legislationTypeId: "second-law" }),
    ]);
    expect(replies.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await db.collection("governorOfficeState").findOne({}))?.gubernatorialActions).toBe(0);
    expect(await db.collection("governorExecutiveOrders").countDocuments({})).toBe(1);
    expect(await db.collection("newsPosts").countDocuments({})).toBe(1);
  });
  it("concurrent confidence and legitimacy adjustments retain all delivered history", async () => {
    const leader = new ObjectId();
    await db.collection<Document & { _id: string }>("countryLeaderStates").insertOne({
      _id: `CN_${leader}`,
      countryId: "CN",
      leaderCharacterId: leader,
      partyConfidence: 75,
      popularLegitimacy: 75,
      confidenceHistory: [],
      popularLegitimacyHistory: [],
    });
    for (const adjust of [adjustLeaderConfidence, adjustPopularLegitimacy]) {
      await Promise.all(
        [-2, -3, 1, -4].map((delta, i) =>
          adjust(db, "CN", leader, delta, `synthetic decision ${i}`, 100)
        )
      );
    }
    const row = await db.collection("countryLeaderStates").findOne({});
    expect(row?.partyConfidence).toBe(67);
    expect(row?.popularLegitimacy).toBe(67);
    for (const field of ["confidenceHistory", "popularLegitimacyHistory"]) {
      const history = row?.[field] as { previous: number; next: number; delta: number }[];
      expect(history).toHaveLength(4);
      for (let i = 0; i < history.length - 1; i++)
        expect(history[i].previous).toBe(history[i + 1].next);
      expect(history.reduce((sum, h) => sum + h.delta, 0)).toBe(-8);
    }
  });
  it("overlapping office conversions consume one AP payment", async () => {
    const holder = new ObjectId();
    await db.collection("characters").insertOne({ _id: holder, actions: 30, cash: 1000 });
    await db.collection("electedOfficials").insertOne({
      countryId: "US",
      officeType: "vicePresident",
      characterId: holder,
      vpActionsRemaining: 0,
    });
    const target = { kind: "vp", countryId: "US" } as const;
    const replies = await Promise.all([
      topUpOfficePool(db, holder, target, 100),
      topUpOfficePool(db, holder, target, 100),
    ]);
    expect(replies.filter((r) => r.ok)).toHaveLength(1);
    expect((await db.collection("characters").findOne({ _id: holder }))?.actions).toBe(
      30 - OFFICE_POOL_TOP_UP_AP_COST
    );
    expect((await db.collection("electedOfficials").findOne({}))?.vpActionsRemaining).toBe(1);
  });
  it.each([false, true])(
    "native arsenal overlap consumes only delivered lots, naval=%s",
    async (naval) => {
      const run = naval ? applyNavalRepair : applyDefenceRefit;
      await db.collection("nationalArsenal").insertOne({
        countryId: "US",
        stock: { ground: 10000, naval: 10000 },
        grade: { ground: 2, naval: 2 },
      });
      await db.collection("militaryUnits").insertMany(
        Array.from({ length: 2 }, () => ({
          countryId: "US",
          domain: naval ? "naval" : "ground",
          type: naval ? "Guided-Missile Destroyer" : "Infantry Division",
          integrity: 20,
          equipment: { firepower: 0, protection: 0, support: 0 },
        }))
      );
      const replies = await Promise.all([
        run(db, "US", undefined, 100),
        run(db, "US", undefined, 100),
      ]);
      expect(replies[0]).toEqual(replies[1]);
      expect(replies[0].lotsUsed).toBeGreaterThan(0);
      const stock = (await db.collection("nationalArsenal").findOne({}))?.stock;
      expect(10000 - stock[naval ? "naval" : "ground"]).toBe(replies[0].lotsUsed);
      expect(
        await db.collection("bankMoneyMoves").countDocuments({ kind: "turn-value-settlement" })
      ).toBe(1);
    }
  );
  it("native emergency bill overlap pairs one charge and one outcome", async () => {
    resetCrisisV2RegistryForTests();
    try {
      const def = makeDefinition();
      def.levers = def.levers.map((l) =>
        l.id === "relief-bill" ? { ...l, cost: { politicalCapital: 5 } } : l
      );
      registerCrisisDefinition(def);
      const holder = new ObjectId(),
        crisisId = new ObjectId();
      await db.collection("characters").insertOne({ _id: holder, actions: 20 });
      await db.collection("crises").insertOne({
        _id: crisisId,
        status: "active",
        scope: "country",
        countryIds: ["US"],
        regionIds: [],
        v2: { ...createCrisisInstance(def, 0), stage: "peak", severity: 70 },
      });
      await db.collection("bills").insertOne({
        status: "signed",
        countryId: "US",
        crisisEmergency: { crisisId, leverId: "relief-bill", holderId: holder },
      });
      const replies = await Promise.all([
        processCrisisEmergencyBills(db, 100),
        processCrisisEmergencyBills(db, 100),
      ]);
      expect(replies.reduce((sum, r) => sum + r.passed, 0)).toBe(1);
      expect((await db.collection("characters").findOne({}))?.actions).toBe(
        20 - leverActionCost(5)
      );
      expect(
        await db.collection("crisisLeverUses").countDocuments({ chargeState: "charged" })
      ).toBe(1);
    } finally {
      resetCrisisV2RegistryForTests();
    }
  });

  it("rescoring a stale one-voter ballot still publishes the other legislator's vote", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const voters: NPP[] = Array.from({ length: 2 }, () => ({
      _id: new ObjectId(),
      name: "Synthetic legislator",
      countryId: "US",
      homeState: "CA",
      party: "1",
      policies: { economic: 0, social: 0 },
      personality: { loyalty: 80, ambition: 50, stubbornness: 20 },
      favorability: 50,
      politicalInfluence: 10,
      currentOffice: { type: "house", state: "CA", seatsHeld: 1 },
      generatedAt: now,
      retiredAt: null,
      createdAt: now,
      updatedAt: now,
    }));
    await db.collection<Document & { _id: string }>("gameState").updateOne(
      { _id: "current" },
      {
        $set: {
          preset: "2027-default",
          currentYear: 2027,
          startingYear: 2027,
          nppAutonomyLevel: "off",
        },
      }
    );
    await db.collection("npps").insertMany(voters);
    const bill = {
      _id: new ObjectId(),
      title: "Synthetic bill",
      summary: "Synthetic test proposal",
      originChamber: "house",
      currentChamber: "house",
      status: "active",
      countryId: "US",
      sponsorId: null,
      sponsorName: "Synthetic sponsor",
      votes: {},
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      votingEndsOnTurn: 200,
      votingEndsAt: new Date("2026-02-01T00:00:00Z"),
      proposedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection("bills").insertOne(bill);
    const firstKey = `npp_${voters[0]._id}`,
      secondKey = `npp_${voters[1]._id}`;
    // The phase context predates a whip's accepted ballot.
    await db
      .collection("bills")
      .updateOne(
        { _id: bill._id },
        { $set: { [`votes.${firstKey}`]: "against", votesAgainst: 1 } }
      );
    const ctx = {
      db,
      now,
      currentTurn: 100,
      preset: "2027-default",
      allNPPs: voters,
      nppMap: new Map(voters.map((v) => [String(v._id), v])),
      openPrimaries: [],
      nppCandidacies: new Set(),
      candidatesByElection: new Map(),
      nppOfficials: voters.map((v) => ({
        _id: new ObjectId(),
        countryId: "US",
        officeType: "house",
        characterId: null,
        isNPP: true,
        nppId: v._id,
        seatsHeld: 1,
        createdAt: now,
        updatedAt: now,
      })),
      officialsByNPP: new Map(),
      activeBills: [bill],
      billWhips: new Map(),
      activeStateBills: [],
      stateBillWhips: new Map(),
      statePartyOrgs: new Map(),
      partyByCompositeKey: new Map(),
      partyCountries: new Map(),
      legislationTypeMap: new Map(),
      stateDemographicsMap: new Map(),
      statesById: new Map([
        [
          "CA",
          {
            _id: "CA",
            countryId: "US",
            name: "California",
            population: 1000000,
            gdp: 1000,
            houseDistricts: 1,
            stateSenateSeats: 1,
            region: "West",
          },
        ],
      ]),
    } as NPPContext;
    expect(await processBillVoting(ctx)).toBe(1);
    const stored = await db.collection("bills").findOne({ _id: bill._id });
    expect(stored?.votes[firstKey]).toBe("against");
    expect(stored?.votes[secondKey]).toBeDefined();
    expect(stored!.votesFor + stored!.votesAgainst + stored!.votesAbstain).toBe(2);
    expect(await db.collection("nppVotePredictions").countDocuments({ billId: bill._id })).toBe(1);
  });
});
