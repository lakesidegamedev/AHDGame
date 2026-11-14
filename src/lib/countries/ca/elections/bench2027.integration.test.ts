import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { getDb } from "@/lib/mongodb";
import { loadNPPContext } from "@/lib/turn/npp/context";
import { processElectionEntry } from "@/lib/turn/npp/electionEntry";
import { seedCaElectionBench } from "../seedElectionBench";
import { CA_ELECTIONS } from "../elections";
import { resolveSeedPartyTier } from "@/lib/seeds/defaultPartyTiers";
import { caRegions2027 } from "../data/caRegions2027";
import {
  recordPrimarySnapshots,
  resolvePrimariesIfNeeded,
  accumulateGeneralElectionVotes,
} from "@/lib/turn/primaryResolution";
import { resolveOneGeneralElection } from "@/lib/elections/resolution/generalResolution";
import type { Election, ElectionVoteTally } from "@/lib/db/types";
import { CA_PROVINCIAL_LEGISLATURES } from "../data/caProvincialLegislatures";
import { getCaModel } from "../layer1Model";
import { buildModelRegionDemographics } from "@/lib/seeds/international";
import { caParties, CA_PARTY_SLUG_TO_NAME, CA_REGION_POLLING_2025 } from "../data/caParties";
import {
  caSlugToPartyId,
  caStatePartyOrgRows,
  type CaStatePartyOrgRow,
} from "../rules/opening2027";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/discordWebhooks", () => ({
  sendCountryGameEventMultiple: vi.fn().mockResolvedValue(undefined),
  DISCORD_COLORS: {},
}));
let memory: ReturnType<typeof createInMemoryDb>;
let db: Db;
beforeEach(() => {
  memory = createInMemoryDb();
  db = memory as unknown as Db;
  vi.mocked(getDb).mockResolvedValue(db);
  memory.seed("gameState", [
    {
      _id: "current",
      preset: "2027-default",
      startingYear: 2027,
      currentYear: 2027,
      currentTurn: 1,
      startingPartiesMode: "default",
      nppAutonomyLevel: "off",
    },
  ]);
  memory.seed("countryGameStates", [
    { _id: "CA", countryId: "CA", status: "active", enabledForPlayers: true },
  ]);
  memory.seed("states", [...caRegions2027.map((r) => ({ ...r })), { _id: "CA", countryId: "US" }]);
  memory.seed(
    "politicalParties",
    ["CA", "US"].flatMap((countryId) =>
      [1, 2].map((sequentialId) => ({
        _id: new ObjectId(),
        countryId,
        sequentialId,
        isDefault: true,
        memberCount: 0,
        economicPosition: 0,
        socialPosition: 0,
      }))
    )
  );
  memory.seed(
    "statePartyOrg",
    caRegions2027.flatMap((region) =>
      [1, 2].map((party) => ({
        _id: `${region._id}_${party}`,
        countryId: "CA",
        stateId: region._id,
        partyId: String(party),
        hasPresence: true,
        organization: 50,
      }))
    )
  );
});
it("seeds an idempotent unseated bench and the normal host fills every Canadian regional race", async () => {
  memory.seed(
    "stateDemographics",
    buildModelRegionDemographics(getCaModel("2027")!).map(({ groups: _groups, ...data }) => {
      void _groups;
      return data;
    })
  );
  const now = new Date("2026-01-01T00:00:00Z");
  expect(await seedCaElectionBench(db, "2027-default")).toBe(78);
  expect(await seedCaElectionBench(db, "2027-default")).toBe(0);
  const actors = await db.collection("npps").find({}).toArray();
  expect(
    actors.every(
      (actor) => actor.countryId === "CA" && actor.currentOffice === null && actor.funds === 0
    )
  ).toBe(true);
  expect(await db.collection("electedOfficials").countDocuments()).toBe(0);
  await CA_ELECTIONS.spawn!(now, 2);
  const context = await loadNPPContext(now, { db, currentTurn: 2 });
  await processElectionEntry(context);
  const races = await db.collection("elections").find({ countryId: "CA" }).toArray();
  expect(races).toHaveLength(39);
  const entries = await db.collection("electionCandidates").find({ status: "active" }).toArray();
  for (const race of races)
    expect(
      entries
        .filter((entry) => String(entry.electionId) === String(race._id))
        .map((entry) => entry.party)
        .sort(),
      `${race.electionType}:${race.state}`
    ).toEqual(["1", "2"]);
  expect(new Set(entries.map((entry) => String(entry.nppId))).size).toBe(entries.length);
  expect(await seedCaElectionBench(db, "2027-default")).toBe(0);
  expect(await processElectionEntry(await loadNPPContext(now, { db, currentTurn: 2 }))).toBe(0);
  const opening = await db
    .collection<Election>("elections")
    .find({
      countryId: "CA",
      electionType: "provincialLegislature",
      endTurn: 48,
    })
    .toArray();
  expect(opening).toHaveLength(4);
  const scope = { electionIds: opening.map((race) => race._id) };
  await recordPrimarySnapshots(now, 23, scope);
  await resolvePrimariesIfNeeded(now, 24, scope);
  await accumulateGeneralElectionVotes(now, 24, scope);
  await accumulateGeneralElectionVotes(now, 47, scope);
  await db
    .collection<Election>("elections")
    .updateMany({ _id: { $in: scope.electionIds } }, { $set: { status: "completed" } });
  for (const race of opening) {
    const tally = await db
      .collection<ElectionVoteTally>("electionVoteTallies")
      .findOne({ electionId: race._id });
    expect(tally?.primaryResults).toBeTruthy();
    expect(
      Object.values(tally?.totalVotes ?? {}).reduce((sum, value) => sum + value, 0)
    ).toBeGreaterThan(0);
    expect((await resolveOneGeneralElection(db, race, tally, 48, now)).resolved).toBe(true);
    const officials = await db
      .collection("electedOfficials")
      .find({ countryId: "CA", state: race.state, officeType: "provincialLegislature" })
      .toArray();
    expect(officials.reduce((sum, row) => sum + (row.seatsHeld ?? 1), 0)).toBe(
      CA_PROVINCIAL_LEGISLATURES[race.state].seats
    );
    expect(new Set(officials.map((row) => row.party)).size).toBe(2);
    for (const official of officials) {
      const actor = await db.collection("npps").findOne({ _id: official.nppId });
      expect(actor?.currentOffice).toMatchObject({
        type: "provincialLegislature",
        state: race.state,
        seatsHeld: official.seatsHeld,
      });
    }
    const finalTally = await db
      .collection<ElectionVoteTally>("electionVoteTallies")
      .findOne({ electionId: race._id });
    await resolveOneGeneralElection(db, race, finalTally, 48, now);
    expect(
      await db
        .collection("electedOfficials")
        .find({ countryId: "CA", state: race.state, officeType: "provincialLegislature" })
        .toArray()
    ).toEqual(officials);
  }
});
it.each(["none", "no-npps"])("does not refill %s worlds", async (startingPartiesMode) => {
  await db
    .collection("gameState")
    .updateOne({ _id: "current" as never }, { $set: { startingPartiesMode } });
  expect(await seedCaElectionBench(db, "2027-default")).toBe(0);
  expect(await db.collection("npps").countDocuments()).toBe(0);
});

it("gives every default party a complete national election bench", async () => {
  await db.collection("politicalParties").deleteMany({ countryId: "CA" });
  await db.collection("statePartyOrg").deleteMany({ countryId: "CA" });
  const parties = caParties.map((party, index) => ({
    ...party,
    tier: resolveSeedPartyTier(party, "2027-default"),
    _id: new ObjectId(),
    sequentialId: index + 1,
  }));
  await db.collection("politicalParties").insertMany(parties);
  await db
    .collection<CaStatePartyOrgRow>("statePartyOrg")
    .insertMany(
      caStatePartyOrgRows(CA_REGION_POLLING_2025, caSlugToPartyId(CA_PARTY_SLUG_TO_NAME, parties))
    );
  expect(await seedCaElectionBench(db, "2027-default")).toBe(195);
  const regionalParty = parties.find((party) => party.abbreviation === "BQ")!;
  const actors = await db
    .collection("npps")
    .find({ party: String(regionalParty.sequentialId) })
    .toArray();
  expect(actors).toHaveLength(39);
  expect(new Set(actors.map((actor) => actor.homeState)).size).toBe(13);
  expect(await seedCaElectionBench(db, "2027-default")).toBe(0);
  memory.seed(
    "stateDemographics",
    buildModelRegionDemographics(getCaModel("2027")!).map(({ groups: _groups, ...data }) => {
      void _groups;
      return data;
    })
  );
  const now = new Date("2026-01-01T00:00:00Z");
  await CA_ELECTIONS.spawn!(now, 2);
  await processElectionEntry(await loadNPPContext(now, { db, currentTurn: 2 }));
  const races = await db.collection("elections").find({ countryId: "CA" }).toArray();
  const entries = await db
    .collection("electionCandidates")
    .find({ countryId: "CA", status: "active" })
    .toArray();
  expect(races).toHaveLength(39);
  for (const race of races) {
    expect(
      entries
        .filter((entry) => String(entry.electionId) === String(race._id))
        .some((entry) => entry.party === String(regionalParty.sequentialId)),
      `${race.electionType}:${race.state}`
    ).toBe(true);
  }
});
