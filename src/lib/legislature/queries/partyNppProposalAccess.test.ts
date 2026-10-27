import { beforeEach, describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { resolvePartyNppProposalAccess } from "./partyNppProposalAccess";

describe("Regional party NPP sponsor eligibility", () => {
  let memory: ReturnType<typeof createInMemoryDb>;
  const chair = new ObjectId();
  const other = new ObjectId();
  const first = new ObjectId("000000000000000000000001");
  const second = new ObjectId("000000000000000000000002");
  const character = { _id: chair, party: "1", countryId: "UK" as const };
  const access = (region = "SCO") =>
    resolvePartyNppProposalAccess(memory as unknown as Db, "UK", region, character);
  beforeEach(async () => {
    memory = createInMemoryDb();
    await memory
      .collection("politicalParties")
      .insertOne({ _id: new ObjectId(), countryId: "UK", sequentialId: 1, chairId: chair });
    for (const id of [first, second]) {
      await memory.collection("npps").insertOne({
        _id: id,
        countryId: "UK",
        party: "1",
        name: id.equals(first) ? "First legislator" : "Second legislator",
        retiredAt: null,
      });
      await memory.collection("electedOfficials").insertOne({
        _id: new ObjectId(),
        countryId: "UK",
        state: "SCO",
        officeType: "regionalCouncil",
        isNPP: true,
        nppId: id,
      });
    }
  });
  it("lets a national chair direct a seated own-party regional NPP", async () => {
    expect((await access("sco")).npp?._id).toEqual(first);
  });
  it("limits a state chair to the target region", async () => {
    await memory
      .collection("politicalParties")
      .updateOne({ sequentialId: 1 }, { $set: { chairId: other } });
    await memory.collection("statePartyOrg").insertOne({
      _id: "UK_SCO_1",
      countryId: "UK",
      stateId: "SCO",
      partyId: "1",
      chairId: chair,
    });
    expect((await access()).npp?._id).toEqual(first);
    expect(await access("WAL")).toEqual({ authorized: false, npp: null });
  });
  it.each([
    "proposed",
    "active",
    "passed",
    "vetoed",
    "veto_override",
    "vote_closing",
    "override_closing",
  ])("skips a sponsor with a %s bill", async (status) => {
    await memory.collection("stateBills").insertOne({
      _id: new ObjectId(),
      countryId: "UK",
      stateId: "SCO",
      sponsorNppId: first,
      status,
    });
    expect((await access()).npp?._id).toEqual(second);
  });
  it("skips an existing legacy NPP bill and a pending governor reservation", async () => {
    await memory.collection("stateBills").insertOne({
      _id: new ObjectId(),
      countryId: "UK",
      isNPP: true,
      nppId: first,
      status: "active",
    });
    await memory
      .collection("governorLegislationQueue")
      .insertOne({ _id: new ObjectId(), countryId: "UK", targetNppId: second, status: "pending" });
    expect(await access()).toEqual({ authorized: true, npp: null });
  });
  it.each([
    ["retired", { retiredAt: new Date() }],
    ["different party", { party: "2" }],
    ["foreign", { countryId: "JP" }],
  ])("excludes a %s NPP", async (_label, changes) => {
    await memory.collection("npps").updateOne({ _id: first }, { $set: changes });
    expect((await access()).npp?._id).toEqual(second);
  });
  it("does not treat a national seat or a seat in another region as eligible", async () => {
    await memory
      .collection("electedOfficials")
      .updateOne({ nppId: first }, { $set: { officeType: "commons" } });
    await memory
      .collection("electedOfficials")
      .updateOne({ nppId: second }, { $set: { state: "WAL" } });
    expect((await access()).npp).toBeNull();
  });
  it("rejects explicit zero-seat records while preserving legacy individual seats", async () => {
    await memory
      .collection("electedOfficials")
      .updateOne({ nppId: first }, { $set: { seatsHeld: 0 } });
    expect((await access()).npp?._id).toEqual(second);
  });

  it("treats a legacy NPP bill without countryId as busy", async () => {
    await memory.collection("stateBills").insertOne({
      _id: new ObjectId(),
      stateId: "SCO",
      isNPP: true,
      nppId: first,
      status: "active",
    });
    expect((await access()).npp?._id).toEqual(second);
  });

  it("allows a sponsor again after a bill reaches a terminal status", async () => {
    await memory
      .collection("stateBills")
      .insertOne({ _id: new ObjectId(), countryId: "UK", sponsorNppId: first, status: "enacted" });
    expect((await access()).npp?._id).toEqual(first);
  });
});
