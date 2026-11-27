import { expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { processGovernorAddressExpiry } from "./governorAddressExpiry";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";

function fixture() {
  const state = createTransactionalMemoryDb();
  state.memory.seed("governorAddresses", [
    {
      _id: new ObjectId(),
      stateId: "TX",
      targetDemographicGroupId: "college_liberals",
      approvalEffect: { expired: false, expiresAtTurn: 10 },
      demographicEffect: { expired: false, expiresAtTurn: 10, turnoutDelta: 3 },
    },
  ]);
  state.memory.seed("stateDemographicTurnout", [
    { _id: "TX", modifiers: { voterGroups: { college_liberals: 8 } } },
  ]);
  return state;
}
it.each(["governorAddresses", "stateDemographicTurnout"])(
  "rolls back a landed %s write and removes the original boost once",
  async (collection) => {
    const { memory } = fixture();
    const fault = withInjectedCrash(memory, {
      collection,
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(processGovernorAddressExpiry(fault.db, 10)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(memory.collection("governorAddresses").docs[0].demographicEffect).toMatchObject({
      expired: false,
    });
    expect(memory.collection("stateDemographicTurnout").docs[0].modifiers).toMatchObject({
      voterGroups: { college_liberals: 8 },
    });
    expect((await processGovernorAddressExpiry(fault.db, 10)).turnoutReverted).toBe(1);
    expect(memory.collection("stateDemographicTurnout").docs[0].modifiers).toMatchObject({
      voterGroups: { college_liberals: 5 },
    });
    expect((await processGovernorAddressExpiry(fault.db, 10)).turnoutReverted).toBe(0);
  }
);
it("overlapping expiry attempts deliver one turnout reversal", async () => {
  const { db, memory } = fixture();
  const results = await Promise.all([
    processGovernorAddressExpiry(db, 10),
    processGovernorAddressExpiry(db, 10),
  ]);
  expect(results.reduce((sum, result) => sum + result.turnoutReverted, 0)).toBe(1);
  expect(memory.collection("stateDemographicTurnout").docs[0].modifiers).toMatchObject({
    voterGroups: { college_liberals: 5 },
  });
});
