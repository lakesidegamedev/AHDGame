import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { processFieldOfficeUpkeep } from "./upkeep";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
it.each([false, true])(
  "charges campaign upkeep once after an interrupted batch, afterWrite=%s",
  async (afterWrite) => {
    const f = createTransactionalMemoryDb();
    const campaign = new ObjectId(),
      election = new ObjectId();
    f.memory.seed("gameState", [
      { _id: "current", currentTurn: 5, preset: "2027-default", worldEpochId: "world" },
    ]);
    f.memory.seed("gameConfig", [{ _id: "default", campaignEraPriceLevelEnabled: false }]);
    f.memory.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", baseRate: 1 }]);
    f.memory.seed("campaigns", [
      { _id: campaign, funds: 100000, status: "active", totalFundsSpent: 0, spendThisTurn: 0 },
    ]);
    f.memory.seed("elections", [
      { _id: election, countryId: "US", electionType: "president", status: "active" },
    ]);
    f.memory.seed(
      "campaignFieldOffices",
      [1, 2].map((n) => ({
        _id: new ObjectId(),
        campaignId: campaign,
        electionId: election,
        openedTurn: n,
        createdAt: new Date(n),
      }))
    );
    const fault = withInjectedCrash(f.memory, {
      collection: "campaigns",
      op: "bulkWrite",
      onCall: 1,
      afterWrite,
    });
    Object.assign(fault.db, { client: f.db.client });
    await expect(processFieldOfficeUpkeep(fault.db, 5)).rejects.toThrow();
    expect(f.memory.collection("campaigns").docs[0].funds).toBe(100000);
    await Promise.all([processFieldOfficeUpkeep(f.db, 5), processFieldOfficeUpkeep(f.db, 5)]);
    expect(f.memory.collection("campaigns").docs[0]).toMatchObject({
      funds: 88000,
      totalFundsSpent: 12000,
      fieldOfficeCount: 2,
    });
  }
);
