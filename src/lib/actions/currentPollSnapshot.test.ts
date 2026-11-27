import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { currentPollSnapshot } from "./currentPollSnapshot";
it("keeps a newly commissioned poll that races legacy overview cleanup", async () => {
  const f = createTransactionalMemoryDb(),
    id = new ObjectId();
  const legacy = {
    takenAt: new Date(1),
    overallAppeal: 20,
    totalEstimatedVoters: 50,
    totalPotentialVoters: 100,
  };
  const newer = { ...legacy, takenAt: new Date(2), overallAppeal: 70, granular: { cells: [1] } };
  f.memory.seed("characters", [{ _id: id, lastPoll: legacy }]);
  const col = f.memory.collection("characters"),
    write = col.updateOne.bind(col);
  vi.spyOn(col, "updateOne").mockImplementationOnce(async (...args) => {
    await write({ _id: id }, { $set: { lastPoll: newer } });
    return write(...args);
  });
  expect(await currentPollSnapshot(f.db, id, "lastPoll", legacy)).toEqual(newer);
  expect(col.docs[0].lastPoll).toEqual(newer);
});
it("clears only the requested legacy poll slot", async () => {
  const f = createTransactionalMemoryDb(),
    id = new ObjectId();
  const legacy = {
    takenAt: new Date(1),
    overallAppeal: 20,
    totalEstimatedVoters: 50,
    totalPotentialVoters: 100,
  };
  f.memory.seed("characters", [
    { _id: id, lastPoll: legacy, lastPollLarge: { ...legacy, granular: { cells: [] } } },
  ]);
  expect(await currentPollSnapshot(f.db, id, "lastPoll", legacy)).toBeUndefined();
  expect(col(f).lastPoll).toBeUndefined();
  expect(col(f).lastPollLarge).toBeDefined();
});
function col(f: ReturnType<typeof createTransactionalMemoryDb>) {
  return f.memory.collection("characters").docs[0];
}
