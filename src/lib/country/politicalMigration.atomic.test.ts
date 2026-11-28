import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { mergePartiesIntoCountry } from "./mergePartiesIntoCountry";
import { runStatehoodAdmission } from "@/lib/turn/statehood";
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
vi.mock("@/lib/db/sequentialId", () => ({
  reserveSequentialIds: async () => [7, 8],
  realignPartyCountersToExisting: async () => {},
}));
vi.mock("@/lib/news", () => ({ createSystemNewsPost: vi.fn().mockResolvedValue(undefined) }));
describe("political migration rollback and retries", () => {
  it("does not cascade overlapping party numbers and recovers after a landed reference write", async () => {
    const f = createTransactionalMemoryDb(),
      first = new ObjectId(),
      second = new ObjectId(),
      one = new ObjectId(),
      seven = new ObjectId();
    f.memory.seed("gameState", [{ _id: "current", worldEpochId: "party-merge" }]);
    f.memory.seed("politicalParties", [
      { _id: first, countryId: "US", sequentialId: 1, treasury: 100 },
      { _id: second, countryId: "US", sequentialId: 7, treasury: 200 },
    ]);
    f.memory.seed("characters", [
      { _id: one, countryId: "US", party: "1" },
      { _id: seven, countryId: "US", party: "7" },
    ]);
    const run = (db = f.db) =>
      mergePartiesIntoCountry(db, { fromCountryId: "US", toCountryId: "CA", currentTurn: 10 });
    const fault = withInjectedCrash(f.memory, {
      collection: "characters",
      op: "updateMany",
      onCall: 1,
      afterWrite: true,
    });
    await expect(run(fault.db)).rejects.toThrow();
    expect(f.memory.collection("politicalParties").docs.map((p) => p.countryId)).toEqual([
      "US",
      "US",
    ]);
    expect(f.memory.collection("characters").docs.map((p) => p.party)).toEqual(["1", "7"]);
    await Promise.all([run(), run()]);
    expect(f.memory.collection("characters").docs.map((p) => p.party)).toEqual(["7", "8"]);
    expect(f.memory.collection("politicalParties").docs.map((p) => p.treasury)).toEqual([100, 200]);
    expect(f.memory.collection("politicalParties").docs.map((p) => p.sequentialId)).toEqual([7, 8]);
  });
  it("retries admission after registration seeding fails without leaving an admitted half-state", async () => {
    const f = createTransactionalMemoryDb();
    f.memory.seed("gameState", [
      { _id: "current", currentYear: 1970, currentTurn: 400, preset: "1953-default" },
    ]);
    f.memory.seed("states", [
      { _id: "AK", countryId: "US" },
      { _id: "HI", countryId: "US" },
    ]);
    f.memory.seed("politicalParties", [
      { _id: new ObjectId(), countryId: "US", abbreviation: "DEM", sequentialId: 1 },
      { _id: new ObjectId(), countryId: "US", abbreviation: "REP", sequentialId: 2 },
    ]);
    const fault = withInjectedCrash(f.memory, {
      collection: "stateRegistrationPool",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(runStatehoodAdmission(fault.db, 400)).rejects.toThrow();
    expect(f.memory.collection("states").docs.every((s) => s.admittedYear === undefined)).toBe(
      true
    );
    expect(f.memory.collection("seats").docs).toHaveLength(0);
    expect(f.memory.collection("stateRegistrationPool").docs).toHaveLength(0);
    await Promise.all([runStatehoodAdmission(f.db, 400), runStatehoodAdmission(f.db, 400)]);
    expect(f.memory.collection("states").docs.every((s) => s.admittedYear === 1970)).toBe(true);
    expect(f.memory.collection("stateRegistrationPool").docs).toHaveLength(2);
    expect(f.memory.collection("electedOfficials").docs).toHaveLength(6);
  });
});
