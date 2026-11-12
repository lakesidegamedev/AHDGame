import { describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { Db } from "mongodb";
import {
  REFERENCE_REBUILD_CLEARED_COLLECTIONS,
  REFERENCE_REBUILD_KEPT_COLLECTIONS,
  clearReferenceForRebuild,
} from "./referenceRebuildClear";
import { getCollectionCategory, getReferenceCollectionNames } from "./seedManifest";

describe("reference rebuild clear", () => {
  it("lists only reference collections, never preserved or runtime ones", () => {
    // Runtime collections are already dropped by the teardown sweep, and a
    // preserved collection (accounts, archives, audit trails) must survive.
    for (const { name } of REFERENCE_REBUILD_CLEARED_COLLECTIONS) {
      expect([name, getCollectionCategory(name)]).toEqual([name, "reference"]);
    }
  });

  it("never clears gameConfig, which carries ops state no seeder restores", () => {
    const names = REFERENCE_REBUILD_CLEARED_COLLECTIONS.map(({ name }) => name);
    for (const kept of ["gameConfig", "achievements", "users", "politicalParties"]) {
      expect(names).not.toContain(kept);
    }
  });

  it("replaces every reference collection unless a reason keeps it", () => {
    const cleared = REFERENCE_REBUILD_CLEARED_COLLECTIONS.map(({ name }) => name);
    const kept = Object.keys(REFERENCE_REBUILD_KEPT_COLLECTIONS);
    expect([...cleared, ...kept].sort()).toEqual(getReferenceCollectionNames().sort());
    for (const name of kept) expect(getCollectionCategory(name)).toBe("reference");
    for (const name of ["states", "macroMetrics", "politicalMetrics", "federalBudget", "seats"]) {
      expect(cleared).toContain(name);
    }
  });

  it("leaves no stale field on a reference row: the rebuild writes into an empty collection", async () => {
    const mem = createInMemoryDb();
    mem.seed("federalBudget", [
      {
        _id: "US",
        countryId: "US",
        defenseAppropriation: { balance: 9e11, accruedThroughTurn: 1261, arrearsRatio: 0 },
      },
    ]);
    mem.seed("politicalMetrics", [{ _id: "UK_LON", cabinetResiduals: { workerSecurity: 21.9 } }]);
    await clearReferenceForRebuild(mem as unknown as Db);
    expect(await mem.collection("federalBudget").countDocuments()).toBe(0);
    expect(await mem.collection("politicalMetrics").countDocuments()).toBe(0);
  });

  it("removes old-world rows the new roster does not write", async () => {
    const mem = createInMemoryDb();
    mem.seed("stateBaselines", [{ _id: "UKR_KYI" }, { _id: "CA" }]);
    mem.seed("stateRegistrationPool", [{ _id: "DD_BE", countryId: "DD", stateId: "BE" }]);
    mem.seed("demographicCategories", [{ _id: "ua_voterGroups" }]);
    mem.seed("gameConfig", [{ _id: "default", sandboxTesterAccessEnabled: true }]);
    const deleted = await clearReferenceForRebuild(mem as unknown as Db);
    expect(deleted).toMatchObject({
      stateBaselines: 2,
      stateRegistrationPool: 1,
      demographicCategories: 1,
    });
    expect(await mem.collection("stateBaselines").countDocuments()).toBe(0);
    expect(await mem.collection("gameConfig").countDocuments()).toBe(1);
  });
});
