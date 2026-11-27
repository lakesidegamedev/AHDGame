import { describe, expect, it } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { ensurePrimaryNationalCorporation } from "./nationalCorporation";
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 100,
      preset: "2027-default",
      worldEpochId: "synthetic-issuer",
      isProcessing: true,
    },
  ]);
  return f;
}
describe("missing national issuer creation admission", () => {
  it("two missing-primary callers create one issuer even during a turn", async () => {
    const { db } = fixture();
    const issuers = await Promise.all(
      Array.from({ length: 8 }, () => ensurePrimaryNationalCorporation(db, "CA"))
    );
    expect(new Set(issuers.map((c) => String(c._id))).size).toBe(1);
    expect(await db.collection("corporations").countDocuments({ countryOwnerId: "CA" })).toBe(1);
    expect(issuers[0]).toMatchObject({
      liquidCapital: 0,
      totalShares: 0,
      publicFloat: 0,
      liquidCurrencyCode: "CAD",
    });
  });
  it("a landed insert failure leaves no ghost issuer or partial creation fence", async () => {
    const { db, memory } = fixture();
    const fault = withInjectedCrash(memory, {
      collection: "corporations",
      op: "insertOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(ensurePrimaryNationalCorporation(fault.db, "CA")).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(await db.collection("corporations").countDocuments({})).toBe(0);
    expect((await db.collection("gameState").findOne({}))!.economicCommandRevision).toBeUndefined();
    const first = await ensurePrimaryNationalCorporation(db, "CA");
    expect((await ensurePrimaryNationalCorporation(db, "CA"))._id).toEqual(first._id);
  });
});
