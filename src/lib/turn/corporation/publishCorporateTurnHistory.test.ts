import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { corporationHistoryFixture } from "@/lib/test-utils/corporationHistoryFixture";
import { publishCorporateTurnHistory } from "./publishCorporateTurnHistory";

describe("settled corporate history publication", () => {
  it("keeps the first settled income after a landed write loses acknowledgement", async () => {
    const memory = createInMemoryDb(),
      corporationId = new ObjectId();
    const fault = withInjectedCrash(memory, {
      collection: "corporationHistory",
      op: "bulkWrite",
      onCall: 1,
      afterWrite: true,
    });
    const row = corporationHistoryFixture(corporationId, 5);
    await expect(publishCorporateTurnHistory(fault.db, [row])).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    await publishCorporateTurnHistory(fault.db, [{ ...row, income: 20 }]);
    expect(memory.collection("corporationHistory").docs).toHaveLength(1);
    expect(memory.collection("corporationHistory").docs[0].income).toBe(10);
  });
  it("preserves an existing random-ID publication and appends a different turn", async () => {
    const memory = createInMemoryDb(),
      corporationId = new ObjectId(),
      id = new ObjectId();
    memory.seed("corporationHistory", [{ _id: id, corporationId, turn: 5, income: 10 }]);
    const db = withInjectedCrash(memory, { onCall: 999 }).db;
    await publishCorporateTurnHistory(db, [
      corporationHistoryFixture(corporationId, 5, { income: 20 }),
      corporationHistoryFixture(corporationId, 6, { income: 30 }),
    ]);
    expect(memory.collection("corporationHistory").docs.map((row) => row.income)).toEqual([10, 30]);
    expect(memory.collection("corporationHistory").docs[0]._id).toEqual(id);
  });
});
