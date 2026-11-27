import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { executeSendToMember } from "./executeSendToMember";
import { checkPlayerPayoutCap } from "./payoutCap";
import { emitTreasuryTransaction } from "./emit";
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
vi.mock("@/lib/treasury/payoutCap", () => ({
  checkPlayerPayoutCap: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/treasury/emit", () => ({
  emitTreasuryTransaction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn().mockResolvedValue("applied") }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkPlayerPayoutCap).mockResolvedValue({ ok: true } as never);
  vi.mocked(emitTreasuryTransaction).mockResolvedValue(undefined as never);
});
function setup() {
  const f = createTransactionalMemoryDb(),
    party = new ObjectId(),
    recipient = new ObjectId(),
    initiator = new ObjectId();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 100, isProcessing: false, preset: "2027-default" },
  ]);
  f.memory.seed("politicalParties", [{ _id: party, treasury: 5000 }]);
  f.memory.seed("characters", [{ _id: recipient, funds: 0 }]);
  const args = {
    db: f.db,
    countryId: "US" as const,
    party: {
      _id: party,
      name: "Synthetic party",
      sequentialId: 1,
      treasury: 5000,
      chairId: initiator,
      viceChairId: null,
      treasurerId: null,
    },
    targetCharacter: { _id: recipient, name: "Synthetic member" },
    amount: 5000,
    reserveWarning: null,
    initiator: { _id: initiator, name: "Synthetic officer" },
    initiatorUsername: "synthetic",
    initiatorUserId: new ObjectId().toString(),
    currentTurn: 100,
  };
  return { ...f, args };
}
it("moves the treasury to campaign funds once across overlapping requests", async () => {
  const f = setup(),
    results = await Promise.allSettled([executeSendToMember(f.args), executeSendToMember(f.args)]);
  expect(results.filter((r) => r.status === "fulfilled" && r.value.ok)).toHaveLength(1);
  expect(f.memory.collection("politicalParties").docs[0].treasury).toBe(0);
  expect(f.memory.collection("characters").docs[0].funds).toBe(5000);
});
it.each(["characters", "adminLogs", "activityLog"])(
  "rolls back both balances after an unacknowledged %s write",
  async (name) => {
    const f = setup(),
      c = f.memory.collection(name);
    if (name === "characters") {
      const write = c.updateOne.bind(c);
      vi.spyOn(c, "updateOne").mockImplementationOnce(async (...args) => {
        await write(...args);
        throw new Error("interrupted write");
      });
    } else {
      const write = c.insertOne.bind(c);
      vi.spyOn(c, "insertOne").mockImplementationOnce(async (...args) => {
        await write(...args);
        throw new Error("interrupted write");
      });
    }
    await expect(executeSendToMember(f.args)).rejects.toThrow("interrupted write");
    expect(f.memory.collection("politicalParties").docs[0].treasury).toBe(5000);
    expect(f.memory.collection("characters").docs[0].funds).toBe(0);
    expect((await executeSendToMember(f.args)).ok).toBe(true);
    expect(f.memory.collection("characters").docs[0].funds).toBe(5000);
  }
);
it("rolls back a failed treasury receipt and a missing recipient", async () => {
  const f = setup();
  vi.mocked(emitTreasuryTransaction).mockRejectedValueOnce(new Error("receipt failed"));
  await expect(executeSendToMember(f.args)).rejects.toThrow("receipt failed");
  expect(f.memory.collection("politicalParties").docs[0].treasury).toBe(5000);
  expect(f.memory.collection("characters").docs[0].funds).toBe(0);
  await f.memory.collection("characters").deleteOne({ _id: f.args.targetCharacter._id });
  await expect(executeSendToMember(f.args)).rejects.toThrow("Character not found");
  expect(f.memory.collection("politicalParties").docs[0].treasury).toBe(5000);
});
it("refuses before cash movement when the payout cap or turn fence declines", async () => {
  const f = setup();
  vi.mocked(checkPlayerPayoutCap).mockResolvedValueOnce({
    ok: false,
    reason: "over the cap",
  } as never);
  expect((await executeSendToMember(f.args)).ok).toBe(false);
  await f.memory
    .collection("gameState")
    .updateOne({ _id: "current" }, { $set: { isProcessing: true } });
  expect((await executeSendToMember(f.args)).response.status).toBe(409);
  expect(f.memory.collection("politicalParties").docs[0].treasury).toBe(5000);
  expect(f.memory.collection("characters").docs[0].funds).toBe(0);
});
it.each([
  ["2027-default", "EUR"],
  ["1991-default", "FRF"],
])("records the seed currency for %s", async (preset, currency) => {
  const f = setup();
  await f.memory.collection("gameState").updateOne({ _id: "current" }, { $set: { preset } });
  expect((await executeSendToMember({ ...f.args, countryId: "FR" })).ok).toBe(true);
  expect(emitTreasuryTransaction).toHaveBeenCalledWith(
    expect.objectContaining({ currencyCode: currency, turn: 100 })
  );
  expect(f.memory.collection("activityLog").docs[0].currencyCode).toBe(currency);
});
it("rolls back invalid activity metadata instead of reporting an unaudited payout", async () => {
  const f = setup();
  await expect(executeSendToMember({ ...f.args, initiatorUserId: "invalid" })).rejects.toThrow();
  expect(f.memory.collection("politicalParties").docs[0].treasury).toBe(5000);
  expect(f.memory.collection("characters").docs[0].funds).toBe(0);
});
