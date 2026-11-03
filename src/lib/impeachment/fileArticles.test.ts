import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { fileArticlesOfImpeachment } from "./fileArticles";
vi.mock("@/lib/gameState", () => ({
  getGameState: vi.fn().mockResolvedValue({ currentTurn: 100 }),
}));

describe("party NPP impeachment filing", () => {
  let memory: ReturnType<typeof createInMemoryDb>;
  const chairId = new ObjectId(),
    nppId = new ObjectId(),
    target = new ObjectId();
  const chair = { _id: chairId, name: "Chair", countryId: "US" as const, party: "1" };
  const file = (office: "governor" | "president" = "governor", admin = false) =>
    fileArticlesOfImpeachment(memory as unknown as Db, "US", chair, admin, {
      office,
      state: "NY",
      targetCharacterId: target,
      proposeViaPartyNpp: true,
    });
  beforeEach(async () => {
    memory = createInMemoryDb();
    await memory
      .collection("politicalParties")
      .insertOne({ _id: new ObjectId(), countryId: "US", sequentialId: 1, chairId });
    await memory.collection("npps").insertOne({
      _id: nppId,
      countryId: "US",
      party: "1",
      name: "Seated legislator",
      retiredAt: null,
    });
    await memory.collection("characters").insertOne({ _id: target, name: "Executive" });
    await memory.collection("electedOfficials").insertOne({
      _id: new ObjectId(),
      countryId: "US",
      officeType: "stateSenate",
      state: "NY",
      isNPP: true,
      nppId,
      seatsHeld: 1,
    });
    await memory.collection("electedOfficials").insertOne({
      _id: new ObjectId(),
      countryId: "US",
      officeType: "governor",
      state: "NY",
      characterId: target,
    });
    await memory.collection("electedOfficials").insertOne({
      _id: new ObjectId(),
      countryId: "US",
      officeType: "president",
      characterId: target,
    });
  });
  it("files governor articles with NPP attribution and the existing conviction deadline", async () => {
    const result = await file();
    expect(
      await memory.collection("impeachments").findOne({ _id: new ObjectId(result.impeachmentId) })
    ).toMatchObject({
      filedByNppId: nppId,
      requestedByCharacterId: chairId,
      filedByName: "Seated legislator",
      state: "NY",
      stage: "senate",
      turnFiled: 100,
      senateVotingEndsOnTurn: 124,
    });
  });
  it("allows the target region's party chair", async () => {
    await memory
      .collection("politicalParties")
      .updateOne({}, { $set: { chairId: new ObjectId() } });
    await memory
      .collection("statePartyOrg")
      .insertOne({ _id: "US_NY_1", countryId: "US", stateId: "NY", partyId: "1", chairId });
    await expect(file()).resolves.toHaveProperty("impeachmentId");
  });
  it("accepts legacy untagged US regional seats", async () => {
    await memory.collection("electedOfficials").updateOne({ nppId }, { $unset: { countryId: "" } });
    await expect(file()).resolves.toHaveProperty("impeachmentId");
  });
  it.each(["wrongState", "wrongCountry", "zeroSeats", "retired", "wrongParty", "unauthorized"])(
    "rejects %s without creating a case",
    async (reason) => {
      if (reason === "wrongState")
        await memory.collection("electedOfficials").updateOne({ nppId }, { $set: { state: "CA" } });
      if (reason === "wrongCountry")
        await memory
          .collection("electedOfficials")
          .updateOne({ nppId }, { $set: { countryId: "BR" } });
      if (reason === "zeroSeats")
        await memory
          .collection("electedOfficials")
          .updateOne({ nppId }, { $set: { seatsHeld: 0 } });
      if (reason === "retired")
        await memory
          .collection("npps")
          .updateOne({ _id: nppId }, { $set: { retiredAt: new Date() } });
      if (reason === "wrongParty")
        await memory.collection("npps").updateOne({ _id: nppId }, { $set: { party: "2" } });
      if (reason === "unauthorized")
        await memory
          .collection("politicalParties")
          .updateOne({}, { $set: { chairId: new ObjectId() } });
      await expect(file()).rejects.toThrow();
      expect(await memory.collection("impeachments").find().toArray()).toHaveLength(0);
    }
  );
  it("does not allow admin status to substitute for party authority", async () => {
    await memory
      .collection("politicalParties")
      .updateOne({}, { $set: { chairId: new ObjectId() } });
    await expect(file("governor", true)).rejects.toThrow(/authorized party chair/);
  });
  it("requires a national lower-house NPP for presidential articles", async () => {
    await memory
      .collection("electedOfficials")
      .updateOne({ nppId }, { $set: { officeType: "senate" } });
    await expect(file("president")).rejects.toThrow(/No eligible/);
    await memory
      .collection("electedOfficials")
      .updateOne({ nppId }, { $set: { officeType: "house" } });
    const result = await file("president");
    expect(
      await memory.collection("impeachments").findOne({ _id: new ObjectId(result.impeachmentId) })
    ).toMatchObject({ stage: "house", filedByNppId: nppId, houseVotingEndsOnTurn: 124 });
  });
  it("does not let a regional chair direct a national impeachment", async () => {
    await memory
      .collection("politicalParties")
      .updateOne({}, { $set: { chairId: new ObjectId() } });
    await memory
      .collection("statePartyOrg")
      .insertOne({ _id: "US_NY_1", countryId: "US", stateId: "NY", partyId: "1", chairId });
    await memory
      .collection("electedOfficials")
      .updateOne({ nppId }, { $set: { officeType: "house" } });
    await expect(file("president")).rejects.toThrow(/authorized party chair/);
  });
  it("does not borrow an NPP reserved for a pending governor bill", async () => {
    await memory
      .collection("governorLegislationQueue")
      .insertOne({ _id: new ObjectId(), countryId: "US", status: "pending", targetNppId: nppId });
    await expect(file()).rejects.toThrow(/No eligible/);
  });
  it("rejects a stale governor target", async () => {
    await expect(
      fileArticlesOfImpeachment(memory as unknown as Db, "US", chair, false, {
        office: "governor",
        state: "NY",
        proposeViaPartyNpp: true,
        targetCharacterId: new ObjectId(),
      })
    ).rejects.toThrow(/not the sitting governor/);
  });
  it("preserves the active-case and cooldown guards", async () => {
    await file();
    await expect(file()).rejects.toThrow(/already in progress/);
    await memory.collection("impeachments").updateOne({}, { $set: { stage: "acquitted" } });
    await expect(file()).rejects.toThrow(/more turn/);
  });
  it.each([false, true])("blocks a recent election even for admin=%s", async (admin) => {
    const electionId = new ObjectId();
    await memory.collection("characters").updateOne(
      { _id: target },
      {
        $set: {
          careerHistory: [
            {
              type: "elected",
              office: { type: "governor", state: "NY" },
              electionId: electionId.toString(),
            },
          ],
        },
      }
    );
    await memory.collection("elections").insertOne({
      _id: electionId,
      countryId: "US",
      electionType: "governor",
      state: "NY",
      status: "resolved",
      endTurn: 90,
    });
    await expect(file("governor", admin)).rejects.toThrow(/Filing opens on turn 162, in 62 turns/);
    expect(await memory.collection("impeachments").find().toArray()).toHaveLength(0);
  });
  it("blocks a direct human filing during the same post-election window", async () => {
    const electionId = new ObjectId();
    await memory.collection("characters").updateOne(
      { _id: target },
      {
        $set: {
          careerHistory: [
            {
              type: "elected",
              office: { type: "governor", state: "NY" },
              electionId: electionId.toString(),
            },
          ],
        },
      }
    );
    await memory.collection("elections").insertOne({
      _id: electionId,
      countryId: "US",
      electionType: "governor",
      state: "NY",
      status: "resolved",
      endTurn: 90,
    });
    await memory.collection("electedOfficials").insertOne({
      _id: new ObjectId(),
      countryId: "US",
      state: "NY",
      officeType: "stateSenate",
      characterId: chairId,
    });
    await expect(
      fileArticlesOfImpeachment(memory as unknown as Db, "US", chair, false, {
        office: "governor",
        state: "NY",
      })
    ).rejects.toThrow(/most recent election/);
  });
  it("preserves direct character filing", async () => {
    await memory.collection("electedOfficials").insertOne({
      _id: new ObjectId(),
      countryId: "US",
      state: "NY",
      officeType: "stateSenate",
      characterId: chairId,
    });
    await fileArticlesOfImpeachment(memory as unknown as Db, "US", chair, false, {
      office: "governor",
      state: "NY",
    });
    expect(await memory.collection("impeachments").findOne({})).toMatchObject({
      filedByCharacterId: chairId,
      filedByName: "Chair",
    });
  });
  it("keeps parliamentary governments on no-confidence", async () => {
    await expect(
      fileArticlesOfImpeachment(
        memory as unknown as Db,
        "UK",
        { ...chair, countryId: "UK" },
        false,
        { office: "president", proposeViaPartyNpp: true }
      )
    ).rejects.toThrow(/Parliamentary/);
  });
});
