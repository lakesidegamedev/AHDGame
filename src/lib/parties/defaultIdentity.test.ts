import { expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { CommitteeProposal } from "@/lib/db/types/committeeProposal";
import { attemptResolution } from "./proposals";

it.each(["major", "minor"])("rejects queued renames of %s default parties", async (tier) => {
  const { memory, db, proposal, partyId } = fixture(true, tier);
  await attemptResolution(db, proposal, 10);
  expect(await memory.collection("politicalParties").findOne({ _id: partyId })).toMatchObject({
    name: "Protected Party",
    abbreviation: "PP",
    isDefault: true,
  });
  expect(
    await memory.collection("committeeProposals").findOne({ _id: proposal._id })
  ).toMatchObject({
    status: "rejected",
    resolvedAtTurn: 10,
  });
});

it("allows a custom party rename without touching the same sequential ID in another country", async () => {
  const { memory, db, proposal, partyId } = fixture(false, "major");
  await attemptResolution(db, proposal, 10);
  expect(await memory.collection("politicalParties").findOne({ _id: partyId })).toMatchObject({
    name: "Changed Name",
    abbreviation: "NEW",
  });
  expect(await memory.collection("politicalParties").findOne({ countryId: "CA" })).toMatchObject({
    name: "Canadian Default",
    abbreviation: "CD",
    isDefault: true,
  });
  expect(
    await memory.collection("committeeProposals").findOne({ _id: proposal._id })
  ).toMatchObject({
    status: "passed",
  });
});

it("rejects a rename when default designation changes after the eligibility read", async () => {
  const { memory, db, proposal, partyId } = fixture(false, "minor");
  const collection = memory.collection("politicalParties");
  const updateOne = collection.updateOne.bind(collection);
  vi.spyOn(collection, "updateOne").mockImplementation(async (filter, update, options) => {
    const fields = !Array.isArray(update) ? update.$set : null;
    if (fields && typeof fields === "object" && "name" in fields) {
      await updateOne({ _id: partyId }, { $set: { isDefault: true } });
    }
    return updateOne(filter, update, options);
  });
  await attemptResolution(db, proposal, 10);
  expect(await collection.findOne({ _id: partyId })).toMatchObject({
    name: "Protected Party",
    abbreviation: "PP",
    isDefault: true,
  });
  expect(
    await memory.collection("committeeProposals").findOne({ _id: proposal._id })
  ).toMatchObject({
    status: "rejected",
  });
  expect(await collection.findOne({ _id: partyId })).not.toHaveProperty("proposalCooldowns");
});

function fixture(isDefault: boolean, tier: string) {
  const memory = createInMemoryDb();
  const partyId = new ObjectId();
  const voterId = new ObjectId();
  const now = new Date("2026-01-01T00:00:00Z");
  memory.seed("politicalParties", [
    {
      _id: partyId,
      sequentialId: 1,
      countryId: "US",
      isDefault,
      tier,
      name: "Protected Party",
      abbreviation: "PP",
      committeeIds: [voterId],
      chairId: null,
      viceChairId: null,
      treasurerId: null,
    },
    {
      _id: new ObjectId(),
      sequentialId: 1,
      countryId: "CA",
      isDefault: true,
      name: "Canadian Default",
      abbreviation: "CD",
    },
  ]);
  const proposal: CommitteeProposal = {
    _id: new ObjectId(),
    partyId,
    countryId: "US",
    proposedBy: voterId,
    type: "rename",
    status: "open",
    createdAtTurn: 1,
    expiresAtTurn: 25,
    proposingVotes: [{ voterId, vote: "yes", votedAt: now }],
    rename: { newName: "Changed Name", newAbbreviation: "NEW" },
    createdAt: now,
    updatedAt: now,
  };
  memory.seed("committeeProposals", [{ ...proposal }]);
  return { memory, db: memory as unknown as Db, proposal, partyId };
}
