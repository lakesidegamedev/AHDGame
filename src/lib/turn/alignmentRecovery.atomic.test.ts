import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { processAlignmentTurn } from "./alignmentPhase";
vi.mock("@/lib/countryAccess", () => ({ getAllCountryAccess: async () => ({}) }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
describe("alignment settlement recovery", () => {
  it("rolls back a landed refund and resolves the paid play once across overlapping turns", async () => {
    const f = createTransactionalMemoryDb(),
      id = new ObjectId();
    f.memory.seed("gameState", [
      { _id: "current", currentYear: 1953, currentTurn: 4, startingYear: 1953 },
    ]);
    f.memory.seed("countryAlignments", [
      {
        _id: new ObjectId(),
        entityId: "YU",
        eraKey: "cold-war",
        shares: { WEST: 99, EAST: 0 },
        nonAligned: 1,
        turn: 3,
      },
    ]);
    f.memory.seed("alignmentPlays", [
      {
        _id: id,
        organizationId: "NATO",
        sponsorCountryId: "US",
        targetEntityId: "YU",
        amountLocal: 1000,
        amountUsd: 1000,
        turn: 3,
        resolvedTurn: null,
        appliedPoints: null,
      },
    ]);
    f.memory.seed("organizationFunds", [
      { _id: new ObjectId(), organizationId: "NATO", currencyCountryId: "US", balanceLocal: 0 },
    ]);
    const crash = withInjectedCrash(f.memory, {
      collection: "organizationFunds",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(processAlignmentTurn(crash.db, 4)).rejects.toThrow();
    expect((await f.db.collection("alignmentPlays").findOne({ _id: id }))?.resolvedTurn).toBeNull();
    expect((await f.db.collection("countryAlignments").findOne({ entityId: "YU" }))?.turn).toBe(3);
    expect(
      (await f.db.collection("organizationFunds").findOne({ organizationId: "NATO" }))?.balanceLocal
    ).toBe(0);
    await Promise.all([processAlignmentTurn(f.db, 4), processAlignmentTurn(f.db, 4)]);
    const row = await f.db.collection("countryAlignments").findOne({ entityId: "YU" });
    expect(row?.turn).toBe(4);
    expect((await f.db.collection("alignmentPlays").findOne({ _id: id }))?.resolvedTurn).toBe(4);
    expect(
      (await f.db.collection("organizationFunds").findOne({ organizationId: "NATO" }))?.balanceLocal
    ).toBe(1000);
    await processAlignmentTurn(f.db, 4);
    expect(await f.db.collection("countryAlignments").findOne({ entityId: "YU" })).toEqual(row);
  });
});
