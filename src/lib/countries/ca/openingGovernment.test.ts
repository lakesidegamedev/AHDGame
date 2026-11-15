import { describe, it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { planCaOpeningGovernment } from "./rules/openingGovernment";
vi.mock("@/lib/gameState", () => ({
  getGameState: vi.fn().mockResolvedValue({ preset: "2027-default", currentTurn: 40 }),
}));
vi.mock("@/lib/time/gameTime", () => ({
  getGameTime: vi.fn().mockResolvedValue({ effectiveNow: new Date("2027-01-01"), currentTurn: 40 }),
}));
vi.mock("@/lib/cabinetTransition", () => ({
  clearCabinetOnTransition: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/discordWebhooks", () => ({
  sendCountryGameEvent: vi.fn().mockResolvedValue(undefined),
  DISCORD_COLORS: {},
}));
vi.mock("@/lib/turn/history/recordCountryEvent", () => ({
  recordCountryEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications", () => ({
  createNotifications: vi.fn().mockResolvedValue(undefined),
  createNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/singleplayer", () => ({ isSingleplayer: () => false }));
import { seedCaOpeningGovernment } from "./seedOpeningGovernment";
import { resolveOppositionLeaderForCountry } from "@/lib/parliament/oppositionLeader";
import { isLegislationFrozen } from "@/lib/government/legislationFreeze";
import {
  resolveParliamentaryNoConfidenceVote,
  resolveParliamentaryAppointmentVote,
  updateParliamentaryGovernmentSeats,
  openConfidenceMotionForIncumbent,
  appointPrimeMinister,
} from "@/lib/turn/parliamentaryGovernment";
import {
  proposeNoConfidence,
  proposePmAppointment,
} from "@/lib/government/commands/parliamentaryGovernment";
const now = new Date("2027-01-01");
function world(mode = "default") {
  const mem = createInMemoryDb();
  const ids = [new ObjectId(), new ObjectId(), new ObjectId()];
  mem.seed("gameState", [
    { _id: "current", preset: "2027-default", currentTurn: 40, startingPartiesMode: mode },
  ]);
  mem.seed("governmentFormations", [
    {
      _id: "CA",
      countryId: "CA",
      status: "pending",
      activeVoteId: null,
      pmCharacterId: null,
      pmNppId: null,
      totalSeats: 343,
      majorityThreshold: 172,
    },
    { _id: "UK", status: "formed", pmName: "Foreign PM" },
  ]);
  mem.seed(
    "politicalParties",
    ids.map((_, i) => ({
      _id: new ObjectId(),
      countryId: "CA",
      sequentialId: i + 1,
      name: `Party ${i + 1}`,
      chairId: null,
      viceChairId: null,
    }))
  );
  mem.seed(
    "npps",
    ids.map((_id, i) => ({
      _id,
      countryId: "CA",
      name: `MP ${i + 1}`,
      party: String(i + 1),
      retiredAt: null,
      currentOffice: { type: "caCommons" },
    }))
  );
  mem.seed(
    "electedOfficials",
    ids.map((nppId, i) => ({
      _id: new ObjectId(),
      countryId: "CA",
      officeType: "caCommons",
      nppId,
      isNPP: true,
      party: String(i + 1),
      seatsHeld: [169, 144, 30][i],
      state: "CA_ON",
    }))
  );
  return { mem, db: mem as unknown as Db, ids };
}
describe("Canadian opening government and confidence lifecycle", () => {
  it("uses valid actual Commons seats and preserves a minority", () => {
    const members = [169, 144, 30].map((seats, i) => ({
      id: String(i),
      nppId: String(i),
      party: String(i),
      seats,
    }));
    expect(planCaOpeningGovernment(members)).toMatchObject({
      formationType: "minority",
      totalSeatsSupporting: 169,
      totalSeats: 343,
      majorityThreshold: 172,
    });
    expect(planCaOpeningGovernment(members.slice(1))).toBeNull();
    expect(planCaOpeningGovernment([{ ...members[0], seats: -1 }])).toBeNull();
  });
  it("forms once, unfreezes bills, recognizes NPC opposition and preserves foreign government", async () => {
    const { mem, db, ids } = world();
    expect(await isLegislationFrozen(db, "CA")).toBe(true);
    expect(await seedCaOpeningGovernment(db, "2027-default")).toBe(true);
    expect(await seedCaOpeningGovernment(db, "2027-default")).toBe(false);
    expect(await isLegislationFrozen(db, "CA")).toBe(false);
    expect((await resolveOppositionLeaderForCountry(db, "CA"))?.nppId).toEqual(ids[1]);
    expect(await mem.collection("governmentFormations").findOne({ _id: "CA" })).toMatchObject({
      status: "formed",
      pmNppId: ids[0],
      formationType: "minority",
      totalSeatsSupporting: 169,
    });
    expect(await mem.collection("governmentFormations").findOne({ _id: "UK" })).toMatchObject({
      pmName: "Foreign PM",
    });
  });
  it.each(["none", "no-npps"])("does not fill a vacant %s world", async (mode) => {
    const { db } = world(mode);
    expect(await seedCaOpeningGovernment(db, "2027-default")).toBe(false);
  });
  it("accepts a real MP's motion against an NPC PM, removes the PM and restores their Commons seat", async () => {
    const { mem, db, ids } = world();
    await seedCaOpeningGovernment(db, "2027-default");
    const proposer = new ObjectId();
    await mem.collection("characters").insertOne({
      _id: proposer,
      countryId: "CA",
      name: "Test MP",
      party: "2",
      userId: new ObjectId(),
    });
    await mem.collection("electedOfficials").insertOne({
      _id: new ObjectId(),
      countryId: "CA",
      officeType: "caCommons",
      characterId: proposer,
      party: "2",
      seatsHeld: 1,
      isNPP: false,
    });
    await mem
      .collection("electedOfficials")
      .updateOne({ nppId: ids[1] }, { $set: { seatsHeld: 143 } });
    const { voteId } = await proposeNoConfidence(db, "CA", "test-user", {
      _id: proposer,
      name: "Test MP",
    });
    await mem
      .collection("noConfidenceVotes")
      .updateOne({ _id: new ObjectId(voteId) }, { $set: { [`votes.${proposer}`]: "aye" } });
    await resolveParliamentaryNoConfidenceVote(db, "CA", new ObjectId(voteId), now);
    expect(
      await mem.collection("noConfidenceVotes").findOne({ _id: new ObjectId(voteId) })
    ).toMatchObject({
      status: "passed",
      votesFor: 174,
      votesAgainst: 169,
      targetPmNppId: ids[0],
      targetPmCharacterId: null,
    });
    expect(await isLegislationFrozen(db, "CA")).toBe(true);
    expect(await mem.collection("npps").findOne({ _id: ids[0] })).toMatchObject({
      currentOffice: { type: "caCommons", seatsHeld: 169 },
    });
    await mem
      .collection("politicalParties")
      .updateOne({ countryId: "CA", sequentialId: 2 }, { $set: { chairId: proposer } });
    const { voteId: appointment } = await proposePmAppointment(
      db,
      "CA",
      { _id: proposer, name: "Test MP" },
      proposer.toString()
    );
    await resolveParliamentaryAppointmentVote(db, "CA", new ObjectId(appointment), now);
    expect(await mem.collection("governmentFormations").findOne({ _id: "CA" })).toMatchObject({
      status: "formed",
      pmCharacterId: proposer,
      pmNppId: null,
      governingPartyId: "2",
    });
    expect(await isLegislationFrozen(db, "CA")).toBe(false);
    expect((await resolveOppositionLeaderForCountry(db, "CA"))?.nppId).toEqual(ids[0]);
    await resolveParliamentaryNoConfidenceVote(db, "CA", new ObjectId(voteId), now);
    expect(await isLegislationFrozen(db, "CA")).toBe(false);
  });
  it("vacates a Canadian PM who loses their Commons seat", async () => {
    const { mem, db, ids } = world();
    await seedCaOpeningGovernment(db, "2027-default");
    await mem.collection("electedOfficials").deleteMany({ nppId: ids[0] });
    await updateParliamentaryGovernmentSeats(db, "CA", "2027-default");
    expect(await isLegislationFrozen(db, "CA")).toBe(true);
  });
  it("a stale NPC-targeted motion cannot remove a replacement", async () => {
    const { mem, db, ids } = world();
    await seedCaOpeningGovernment(db, "2027-default");
    const voteId = new ObjectId();
    await mem.collection("noConfidenceVotes").insertOne({
      _id: voteId,
      countryId: "CA",
      status: "active",
      targetPmCharacterId: null,
      targetPmNppId: ids[1],
      votes: {},
      votesFor: 0,
      votesAgainst: 0,
    });
    await resolveParliamentaryNoConfidenceVote(db, "CA", voteId, now);
    expect(await mem.collection("noConfidenceVotes").findOne({ _id: voteId })).toMatchObject({
      status: "cancelled",
    });
    expect(await mem.collection("governmentFormations").findOne({ _id: "CA" })).toMatchObject({
      status: "formed",
      pmNppId: ids[0],
    });
  });
  it("leaves historical presets and founding worlds untouched", async () => {
    const { mem, db } = world();
    expect(await seedCaOpeningGovernment(db, "1991-default")).toBe(false);
    await mem
      .collection("gameState")
      .updateOne({ _id: "current" }, { $set: { preIteration: { active: true, startedTurn: 1 } } });
    expect(await seedCaOpeningGovernment(db, "2027-default")).toBe(false);
    expect(await isLegislationFrozen(db, "CA")).toBe(true);
  });
  it.each([true, false])(
    "resolves the Canadian incumbent's positive confidence motion (support=%s)",
    async (support) => {
      const { mem, db, ids } = world();
      await seedCaOpeningGovernment(db, "2027-default");
      const before = await mem.collection("governmentFormations").findOne({ _id: "CA" });
      const motion = await openConfidenceMotionForIncumbent(db, "CA", now);
      expect(motion.opened).toBe(true);
      if (support)
        await mem.collection("billWhips").insertOne({
          _id: new ObjectId(),
          targetType: "pmAppointmentVote",
          targetId: motion.voteId,
          partyId: "2",
          audience: "npp",
          direction: "for",
        });
      await resolveParliamentaryAppointmentVote(db, "CA", motion.voteId!, now);
      const after = await mem.collection("governmentFormations").findOne({ _id: "CA" });
      expect(after?.status).toBe(support ? "formed" : "pending");
      expect(after?.pmNppId).toEqual(support ? ids[0] : null);
      if (support) expect(after?.formedAt).toEqual(before?.formedAt);
      expect(await isLegislationFrozen(db, "CA")).toBe(!support);
    }
  );
  it("restores the outgoing NPC's Commons projection when another appointment wins first", async () => {
    const { mem, db, ids } = world();
    await seedCaOpeningGovernment(db, "2027-default");
    await appointPrimeMinister(db, "CA", null, ids[1], "Replacement PM", now, "2027-default");
    expect(await mem.collection("npps").findOne({ _id: ids[0] })).toMatchObject({
      currentOffice: { type: "caCommons", seatsHeld: 169 },
    });
    expect(await mem.collection("npps").findOne({ _id: ids[1] })).toMatchObject({
      currentOffice: { type: "primeMinister" },
    });
  });
});
