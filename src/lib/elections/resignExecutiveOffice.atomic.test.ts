import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { resignExecutiveOffice } from "./resignExecutiveOffice";
vi.mock("@/lib/analytics/officeTransitionAnalytics", () => ({
  captureOfficeTransition: vi.fn(async () => {}),
}));
const holder = new ObjectId(),
  officialId = new ObjectId(),
  replacement = new ObjectId(),
  now = new Date();
const official = {
  _id: officialId,
  countryId: "US",
  officeType: "president",
  characterId: holder,
} as never;
const character = { _id: holder, party: "1", currentOffice: { type: "president" } } as never;
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("electedOfficials", [
    { _id: officialId, countryId: "US", officeType: "president", characterId: holder },
  ]);
  f.memory.seed("characters", [
    { _id: holder, currentOffice: { type: "president" }, careerHistory: [] },
  ]);
  return f;
}
it("a stale resignation cannot vacate a replacement", async () => {
  const { db, memory } = fixture();
  memory.collection("electedOfficials").docs[0].characterId = replacement;
  await expect(resignExecutiveOffice(db, official, character, now)).rejects.toMatchObject({
    status: 409,
  });
  expect(memory.collection("electedOfficials").docs[0].characterId).toEqual(replacement);
  expect(memory.collection("characters").docs[0].careerHistory).toEqual([]);
});
it.each(["electedOfficials", "characters"])(
  "a landed %s write rolls back and a retry resigns once",
  async (collection) => {
    const { memory } = fixture();
    const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
    await expect(resignExecutiveOffice(fault.db, official, character, now)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(memory.collection("electedOfficials").docs[0].characterId).toEqual(holder);
    await resignExecutiveOffice(fault.db, official, character, now);
    await expect(resignExecutiveOffice(fault.db, official, character, now)).rejects.toMatchObject({
      status: 409,
    });
    expect(memory.collection("characters").docs[0].careerHistory).toHaveLength(1);
  }
);
