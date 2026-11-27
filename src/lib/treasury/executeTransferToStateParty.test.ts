import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { executeTransferToStateParty } from "./executeTransferToStateParty";
import { emitTreasuryTransaction } from "./emit";
vi.mock("@/lib/treasury/emit", () => ({
  emitTreasuryTransaction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn().mockResolvedValue("applied") }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(emitTreasuryTransaction).mockResolvedValue(undefined as never);
});
function setup() {
  const f = createTransactionalMemoryDb(),
    party = new ObjectId(),
    initiator = new ObjectId();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 100, isProcessing: false, preset: "2027-default" },
  ]);
  f.memory.seed("politicalParties", [{ _id: party, treasury: 5000 }]);
  const args = {
    db: f.db,
    countryId: "US" as const,
    party: { _id: party, name: "Synthetic party", sequentialId: 1, treasury: 5000 },
    state: { _id: "TX", name: "Texas" },
    amount: 5000,
    reserveWarning: null,
    initiator: { _id: initiator, name: "Synthetic officer" },
    initiatorUsername: "synthetic",
    initiatorUserId: new ObjectId().toString(),
    isAdmin: false,
  };
  return { ...f, args };
}
it("transfers once across overlapping requests without duplicating the regional treasury", async () => {
  const f = setup(),
    results = await Promise.allSettled([
      executeTransferToStateParty(f.args),
      executeTransferToStateParty(f.args),
    ]);
  expect(results.filter((r) => r.status === "fulfilled" && r.value.ok)).toHaveLength(1);
  expect(f.memory.collection("politicalParties").docs[0].treasury).toBe(0);
  expect(f.memory.collection("statePartyOrg").docs[0].treasury).toBe(5000);
});
it.each(["statePartyOrg", "adminLogs", "activityLog"])(
  "rolls back a partially applied %s write",
  async (name) => {
    const f = setup(),
      c = f.memory.collection(name);
    if (name === "statePartyOrg") {
      const write = c.updateOne.bind(c);
      vi.spyOn(c, "updateOne").mockImplementationOnce(async (...args) => {
        await write(...args);
        throw new Error("interrupted transfer");
      });
    } else {
      const write = c.insertOne.bind(c);
      vi.spyOn(c, "insertOne").mockImplementationOnce(async (...args) => {
        await write(...args);
        throw new Error("interrupted transfer");
      });
    }
    await expect(executeTransferToStateParty(f.args)).rejects.toThrow("interrupted transfer");
    expect(f.memory.collection("politicalParties").docs[0].treasury).toBe(5000);
    expect(f.memory.collection("statePartyOrg").docs).toHaveLength(0);
    expect((await executeTransferToStateParty(f.args)).ok).toBe(true);
    expect(f.memory.collection("statePartyOrg").docs[0].treasury).toBe(5000);
  }
);
it("rolls back both sides if either treasury receipt fails", async () => {
  const f = setup();
  vi.mocked(emitTreasuryTransaction)
    .mockResolvedValueOnce(undefined as never)
    .mockRejectedValueOnce(new Error("receipt failed"));
  await expect(executeTransferToStateParty(f.args)).rejects.toThrow("receipt failed");
  expect(f.memory.collection("politicalParties").docs[0].treasury).toBe(5000);
  expect(f.memory.collection("statePartyOrg").docs).toHaveLength(0);
});
it.each([
  ["2027-default", "EUR"],
  ["1991-default", "FRF"],
])("uses one currency on both treasury receipts for %s", async (preset, currency) => {
  const f = setup();
  await f.memory.collection("gameState").updateOne({ _id: "current" }, { $set: { preset } });
  expect((await executeTransferToStateParty({ ...f.args, countryId: "FR" })).ok).toBe(true);
  expect(emitTreasuryTransaction).toHaveBeenCalledTimes(2);
  for (const [entry] of vi.mocked(emitTreasuryTransaction).mock.calls)
    expect(entry.currencyCode).toBe(currency);
  expect(f.memory.collection("activityLog").docs[0].currencyCode).toBe(currency);
});
it("rejects unaffordable transfers without creating a destination", async () => {
  const f = setup();
  await expect(executeTransferToStateParty({ ...f.args, amount: 6000 })).rejects.toThrow(
    "Insufficient treasury"
  );
  expect(f.memory.collection("politicalParties").docs[0].treasury).toBe(5000);
  expect(f.memory.collection("statePartyOrg").docs).toHaveLength(0);
});
