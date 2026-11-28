import { expect, it } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { ensureStatePartyOrgRow } from "./ensureStatePartyOrgRow";
const args = {
  countryId: "DD",
  stateId: "NW",
  party: { sequentialId: 1 },
  hasPresence: true,
} as const;
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("statePartyOrg", [
    {
      _id: "NW_7",
      countryId: "DD",
      stateId: "NW",
      partyId: "1",
      treasury: 500,
      politicalStrength: 12,
      organization: 36,
    },
  ]);
  return f;
}
it.each(["insertOne", "deleteOne"] as const)(
  "a landed %s cannot split or lose chapter stocks",
  async (op) => {
    const { memory } = fixture();
    const fault = withInjectedCrash(memory, {
      collection: "statePartyOrg",
      op,
      onCall: 1,
      afterWrite: true,
    });
    await expect(ensureStatePartyOrgRow(fault.db, args)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(memory.collection("statePartyOrg").docs).toHaveLength(1);
    expect(memory.collection("statePartyOrg").docs[0]).toMatchObject({
      _id: "NW_7",
      treasury: 500,
      politicalStrength: 12,
    });
    await ensureStatePartyOrgRow(fault.db, args);
    expect(memory.collection("statePartyOrg").docs).toHaveLength(1);
    expect(memory.collection("statePartyOrg").docs[0]).toMatchObject({
      _id: "NW_1",
      treasury: 500,
      politicalStrength: 12,
    });
  }
);
it("a canonical-key collision preserves the other chapter and uses the actual scoped row", async () => {
  const { db, memory } = fixture();
  memory.collection("statePartyOrg").docs.push({
    _id: "NW_1",
    countryId: "DD",
    stateId: "NW",
    partyId: "6",
    treasury: 700,
    politicalStrength: 4,
  });
  const row = await ensureStatePartyOrgRow(db, args);
  expect(row._id).toBe("NW_7");
  expect(
    memory
      .collection("statePartyOrg")
      .docs.map((doc) => doc.treasury)
      .sort()
  ).toEqual([500, 700]);
  expect(memory.collection("statePartyOrg").docs).toHaveLength(2);
});
it("does not reinterpret another party's canonical row as a missing chapter", async () => {
  const { db, memory } = fixture();
  memory.collection("statePartyOrg").docs.splice(0, 1, {
    _id: "NW_1",
    countryId: "DD",
    stateId: "NW",
    partyId: "6",
    treasury: 700,
  });
  await expect(ensureStatePartyOrgRow(db, args)).rejects.toMatchObject({ status: 409 });
  expect(memory.collection("statePartyOrg").docs[0].treasury).toBe(700);
});
