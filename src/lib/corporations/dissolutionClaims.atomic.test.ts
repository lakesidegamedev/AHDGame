import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withSessionDb } from "@/lib/db/sessionDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { assertDissolutionClaimsSettled } from "./assertDissolutionClaimsSettled";

describe("dissolution creditor protection", () => {
  it.each([
    { producerPayables: { claims: [{ amount: 20 }] } },
    { operatingCashArrearsByCurrency: { CAD: 20 } },
    { federalTaxArrearsAnchorByCountry: { US: 20 } },
    { pendingOperatingCash: 20 },
    { pendingCompensationRecoveries: { recovery: { anchor: 20, stage: "debited" } } },
  ])("reads fresh claims rather than the caller snapshot: %j", async (claim) => {
    const f = createTransactionalMemoryDb(),
      id = new ObjectId();
    f.memory.seed("corporations", [{ _id: id, liquidCapital: 100, ...claim }]);
    await expect(
      withSessionDb(f.db, (db) => assertDissolutionClaimsSettled(db, { _id: id } as Corporation))
    ).rejects.toThrow(/before dissolving/);
    expect(await f.db.collection("corporations").findOne({ _id: id })).toMatchObject({
      liquidCapital: 100,
      ...claim,
    });
  });
  it.each(["current", "arrears", "defaulted", "pending"])(
    "retains a %s loan and all borrower cash",
    async (status) => {
      const f = createTransactionalMemoryDb(),
        id = new ObjectId();
      f.memory.seed("corporations", [{ _id: id, liquidCapital: 100 }]);
      f.memory.seed("bankLoans", [
        {
          _id: new ObjectId(),
          borrowerId: id,
          borrowerType: "corporation",
          status,
          outstanding: status === "pending" ? 0 : 40,
        },
      ]);
      await expect(
        withSessionDb(f.db, (db) => assertDissolutionClaimsSettled(db, { _id: id } as Corporation))
      ).rejects.toThrow(/bank loans/);
      expect(await f.db.collection("corporations").findOne({ _id: id })).toMatchObject({
        liquidCapital: 100,
      });
      expect(await f.db.collection("bankLoans").countDocuments({ borrowerId: id })).toBe(1);
    }
  );
  it("rolls back a landed disposition and concurrent retries delete only once", async () => {
    const f = createTransactionalMemoryDb(),
      id = new ObjectId();
    f.memory.seed("corporations", [{ _id: id, liquidCapital: 100 }]);
    f.memory.seed("bankLoans", [
      {
        _id: new ObjectId(),
        borrowerId: id,
        borrowerType: "corporation",
        status: "repaid",
        outstanding: 0,
      },
    ]);
    const dispose = (db: typeof f.db) =>
      withSessionDb(db, async (tx) => {
        const corp = await assertDissolutionClaimsSettled(tx, { _id: id } as Corporation);
        await tx.collection("corporations").deleteOne({ _id: corp._id });
        return corp.liquidCapital;
      });
    const fault = withInjectedCrash(f.memory, {
      collection: "corporations",
      op: "deleteOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(dispose(fault.db)).rejects.toThrow();
    expect(await f.db.collection("corporations").countDocuments({ _id: id })).toBe(1);
    const result = await Promise.allSettled([dispose(f.db), dispose(f.db)]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await f.db.collection("corporations").countDocuments({ _id: id })).toBe(0);
  });
});
