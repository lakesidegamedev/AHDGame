import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { withdrawEndorsement } from "./withdrawEndorsement";
import { withdrawExecutiveEndorsement } from "./withdrawExecutiveEndorsement";
import { SUPPORT_ENDORSEMENT_BUMP } from "@/lib/elections/engine/electionFormulaFactors";
const kinds = [
  { collection: "governorEndorsements", withdraw: withdrawEndorsement },
  { collection: "executiveEndorsements", withdraw: withdrawExecutiveEndorsement },
];
function fixture(collection: string) {
  const f = createTransactionalMemoryDb();
  const endorsementId = new ObjectId(),
    candidateId = new ObjectId(),
    characterId = new ObjectId();
  f.memory.seed(collection, [
    { _id: endorsementId, countryId: "CA", candidateId, candidateIsNPP: false, isActive: true },
  ]);
  f.memory.seed("electionCandidates", [
    { _id: candidateId, characterId, status: "active", support: 50 },
  ]);
  return { ...f, endorsementId };
}
for (const kind of kinds)
  describe(kind.collection, () => {
    it.each([false, true])(
      "couples terminal state to support reversal, afterWrite=%s",
      async (afterWrite) => {
        const f = fixture(kind.collection);
        const fault = withInjectedCrash(f.memory, {
          collection: "electionCandidates",
          op: "updateMany",
          onCall: 1,
          afterWrite,
        });
        Object.assign(fault.db, { client: f.db.client });
        await expect(kind.withdraw(fault.db, f.endorsementId, "manual", "CA")).rejects.toThrow();
        expect(f.memory.collection(kind.collection).docs[0].isActive).toBe(true);
        expect(f.memory.collection("electionCandidates").docs[0].support).toBe(50);
        const results = await Promise.all([
          kind.withdraw(f.db, f.endorsementId, "manual", "CA"),
          kind.withdraw(f.db, f.endorsementId, "manual", "CA"),
        ]);
        expect(results.map((result) => result.status).sort()).toEqual([200, 404]);
        expect(f.memory.collection("electionCandidates").docs[0].support).toBe(
          50 - SUPPORT_ENDORSEMENT_BUMP
        );
      }
    );
    it("rejects an endorsement belonging to a different country", async () => {
      const f = fixture(kind.collection);
      expect((await kind.withdraw(f.db, f.endorsementId, "manual", "US")).status).toBe(404);
      expect(f.memory.collection(kind.collection).docs[0].isActive).toBe(true);
      expect(f.memory.collection("electionCandidates").docs[0].support).toBe(50);
    });
  });
