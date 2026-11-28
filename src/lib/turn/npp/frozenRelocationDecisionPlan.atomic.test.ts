import { describe, expect, it, vi } from "vitest";
import { BSON, ObjectId } from "mongodb";
import type { Bond } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import {
  frozenRelocationDecisionPlan,
  relocationPlanPayloadChunks,
} from "./frozenRelocationDecisionPlan";
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 10, resetWorldId: "synthetic-relocation" },
  ]);
  const owner = new ObjectId();
  const bonds = Array.from(
    { length: 51 },
    () =>
      ({
        _id: new ObjectId(),
        corporationId: owner,
        totalIssued: 1000,
        currencyCode: "CAD",
        issuedAtTurn: 10,
      }) as Bond
  );
  const output = {
    corpUpdates: [{ filter: { _id: owner }, update: { $inc: { liquidCapital: -200 } } }],
    newSectors: [
      { _id: new ObjectId(), inventory: { steel: 12 }, buildQueue: [{ units: 2, cost: 1200 }] },
    ],
    originalCreditLocal: 1000,
  };
  return { ...f, bonds, output, load: vi.fn(async () => ({ output, bonds })) };
}
describe("frozen relocation credit plan", () => {
  it("preserves a surrogate pair crossing a BSON payload chunk boundary", () => {
    const payload = JSON.stringify({ note: "x".repeat(249990) + "\uD83D\uDE00tail" });
    expect(payload.indexOf("\uD83D\uDE00")).toBe(249999);
    const restored = relocationPlanPayloadChunks(payload)
      .map((part) => BSON.deserialize(BSON.serialize({ part })).part)
      .join("");
    expect(restored).toBe(payload);
  });
  it("does not snapshot a cohort that issues no relocation credit", async () => {
    const f = fixture();
    expect(
      await frozenRelocationDecisionPlan(f.db, 10, async () => ({ output: f.output, bonds: [] }))
    ).toEqual(f.output);
    expect(await f.db.collection("bankMoneyMoves").countDocuments({})).toBe(0);
  });
  it("rolls back a partial debt batch and resumes the original cash, inventory and construction output", async () => {
    const f = fixture();
    const fault = withInjectedCrash(f.memory, {
      collection: "bonds",
      op: "insertMany",
      onCall: 2,
      afterWrite: true,
    });
    await expect(frozenRelocationDecisionPlan(fault.db, 10, f.load)).rejects.toThrow();
    expect(await f.db.collection("bonds").countDocuments({})).toBe(50);
    const forbidden = vi.fn(async () => {
      throw new Error("must not replan issued credit");
    });
    expect(await frozenRelocationDecisionPlan(f.db, 10, forbidden)).toEqual(f.output);
    expect(await f.db.collection("bonds").countDocuments({})).toBe(51);
    expect(await frozenRelocationDecisionPlan(f.db, 10, forbidden)).toEqual(f.output);
    expect(forbidden).not.toHaveBeenCalled();
  });
  it("competing planners return one original generation without issuing extra debt", async () => {
    const f = fixture();
    const [a, b] = await Promise.all([
      frozenRelocationDecisionPlan(f.db, 10, f.load),
      frozenRelocationDecisionPlan(f.db, 10, async () => ({
        output: { ...f.output, originalCreditLocal: 9999 },
        bonds: f.bonds.map((bond) => ({ ...bond, _id: new ObjectId() })),
      })),
    ]);
    expect(a).toEqual(b);
    expect(await f.db.collection("bonds").countDocuments({})).toBe(51);
  });
});
