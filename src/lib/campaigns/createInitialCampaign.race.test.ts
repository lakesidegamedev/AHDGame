import { expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { createInitialCampaign } from "./createInitialCampaign";
it("parallel initialization and lost acknowledgements retain one ledger with its funds", async () => {
  const memory = createInMemoryDb();
  const fault = withInjectedCrash(memory, {
    collection: "campaigns",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  const args = {
    db: fault.db,
    electionId: new ObjectId(),
    candidateId: new ObjectId(),
    candidateIsNPP: false,
    party: "1",
  };
  await expect(createInitialCampaign(args)).rejects.toThrow();
  expect(fault.crashed).toBe(true);
  const id = memory.collection("campaigns").docs[0]._id;
  await memory.collection("campaigns").updateOne({ _id: id }, { $inc: { funds: 500 } });
  const ids = await Promise.all(Array.from({ length: 8 }, () => createInitialCampaign(args)));
  expect(ids.every((value) => value.equals(id as ObjectId))).toBe(true);
  expect(memory.collection("campaigns").docs).toHaveLength(1);
  expect(memory.collection("campaigns").docs[0].funds).toBe(500);
});
it("fresh concurrent requests share a deterministic candidate/election identity", async () => {
  const db = createInMemoryDb();
  const args = {
    db: db as never,
    electionId: new ObjectId(),
    candidateId: new ObjectId(),
    candidateIsNPP: true,
    party: "2",
  };
  const ids = await Promise.all(Array.from({ length: 8 }, () => createInitialCampaign(args)));
  expect(new Set(ids.map((id) => id.toHexString())).size).toBe(1);
  expect(db.collection("campaigns").docs).toHaveLength(1);
});
