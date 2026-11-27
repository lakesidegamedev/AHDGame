import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { NPP } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { executeForeignPolicyChoice } from "./foreignPolicyActions";
vi.mock("@/lib/internationalOrganizations/commands/proposeLegislation", () => ({
  proposeOrganizationLegislation: vi.fn(async ({ db }) => {
    const _id = new ObjectId();
    await db.collection("organizationLegislation").insertOne({ _id, status: "pending" });
    return { ok: true, legislationId: _id.toHexString() };
  }),
}));
const head = { _id: new ObjectId(), name: "Synthetic head" } as NPP;
const choice = {
  type: "propose_fta" as const,
  score: 50,
  targetCountryId: "US" as const,
  organizationId: "UN",
  reasons: [],
};
describe("organization proposal resource settlement", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["organizationLegislation", "diplomaticActions", "bankMoneyMoves"])(
    "rolls back a landed %s failure before retry",
    async (collection) => {
      const { db, memory } = createTransactionalMemoryDb();
      const fault = withInjectedCrash(memory, { collection, onCall: 1, afterWrite: true });
      await expect(
        executeForeignPolicyChoice(fault.db, "CA", head, choice, 10, new Date())
      ).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(await db.collection("organizationLegislation").countDocuments({})).toBe(0);
      expect(await db.collection("diplomaticActions").countDocuments({})).toBe(0);
      const first = await executeForeignPolicyChoice(db, "CA", head, choice, 10, new Date());
      const second = await executeForeignPolicyChoice(
        db,
        "CA",
        head,
        { ...choice, targetCountryId: "FR" },
        10,
        new Date()
      );
      expect(first.acted).toBe(true);
      expect(second).toEqual(first);
      expect(await db.collection("organizationLegislation").countDocuments({})).toBe(1);
      expect(
        (await db.collection("diplomaticActions").findOne({ countryId: "CA" }))?.remaining
      ).toBe(3);
    }
  );
  it("serializes overlapping retries and does not publish when exhausted", async () => {
    const { db } = createTransactionalMemoryDb();
    const replies = await Promise.all(
      Array.from({ length: 5 }, () =>
        executeForeignPolicyChoice(db, "CA", head, choice, 10, new Date())
      )
    );
    expect(replies.every((r) => r.acted)).toBe(true);
    expect(await db.collection("organizationLegislation").countDocuments({})).toBe(1);
    await db
      .collection("diplomaticActions")
      .updateOne({ countryId: "CA" }, { $set: { remaining: 0 } });
    const rejected = await executeForeignPolicyChoice(
      db,
      "CA",
      { ...head, _id: new ObjectId() },
      choice,
      10,
      new Date()
    );
    expect(rejected.acted).toBe(false);
    expect(await db.collection("organizationLegislation").countDocuments({})).toBe(1);
    expect(await db.collection("bankMoneyMoves").countDocuments({})).toBe(1);
  });
});
