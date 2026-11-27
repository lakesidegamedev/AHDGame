import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { commitInfluencePlay } from "./commitInfluencePlay";
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
describe("paid alignment publication", () => {
  it("does not retain a debit when queue publication fails and serializes competing spends", async () => {
    const f = createTransactionalMemoryDb();
    f.memory.seed("gameState", [{ _id: "current", currentYear: 1953 }]);
    f.memory.seed("countryAlignments", [
      { _id: new ObjectId(), entityId: "YU", shares: { WEST: 22, EAST: 50 }, nonAligned: 28 },
    ]);
    f.memory.seed("macroCountries", [
      {
        _id: new ObjectId(),
        entityId: "YU",
        sectors: { agriculture: { capacity: 75 }, retail: { capacity: 50 } },
      },
    ]);
    f.memory.seed("organizationFunds", [
      {
        _id: new ObjectId(),
        organizationId: "NATO",
        currencyCountryId: "US",
        balanceLocal: 900000000,
      },
    ]);
    const input = {
      organizationId: "NATO" as const,
      sponsorCountryId: "US" as const,
      targetEntityId: "YU",
      amountLocal: 900000000,
      turn: 10,
      year: 1953,
    };
    const crash = withInjectedCrash(f.memory, {
      collection: "alignmentPlays",
      op: "insertOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(commitInfluencePlay({ db: crash.db, ...input })).rejects.toThrow();
    expect(
      (await f.db.collection("organizationFunds").findOne({ organizationId: "NATO" }))?.balanceLocal
    ).toBe(900000000);
    expect(await f.db.collection("alignmentPlays").countDocuments({})).toBe(0);
    const results = await Promise.all([
      commitInfluencePlay({ db: f.db, ...input }),
      commitInfluencePlay({ db: f.db, ...input }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await f.db.collection("alignmentPlays").countDocuments({})).toBe(1);
    expect(
      (await f.db.collection("organizationFunds").findOne({ organizationId: "NATO" }))?.balanceLocal
    ).toBe(0);
  });
});
