import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/db/sequentialId", () => ({ getNextSequentialId: vi.fn(async () => 100) }));
vi.mock("./nameGenerator", () => ({
  generateUniqueNPPNameAndGender: vi.fn(() => ({ name: "Test Politician", gender: "female" })),
}));
import { createNPP, openNppCreationBatch } from "./generator";

const REGIONS = ["VT", "NH", "ME", "MA", "NY", "CA"];

/**
 * A world where party 7 holds Vermont through one member. Inserted NPPs feed
 * the presence reads, so `createNPP` (which re-reads per call) and the batch
 * (which reads once and tracks its own inserts) see the same territory.
 */
function mountWorld() {
  const mock = createMockDb();
  const inserted: { party: string; homeState: string }[] = [];
  mock.collection("states").find.mockReturnValue({
    toArray: async () => REGIONS.map((_id) => ({ _id })),
  });
  // createNPP: one distinct per presence source.
  mock.collection("characters").distinct.mockResolvedValue(["VT"]);
  mock
    .collection("npps")
    .distinct.mockImplementation(async (_field: string, filter: { party: string }) => [
      ...new Set(inserted.filter((n) => n.party === filter.party).map((n) => n.homeState)),
    ]);
  // Batch: one find per presence source for every listed party.
  mock.collection("characters").find.mockReturnValue({
    toArray: async () => [{ party: "7", homeState: "VT" }],
  });
  mock.collection("npps").insertOne.mockImplementation(async (doc: (typeof inserted)[number]) => {
    inserted.push({ party: doc.party, homeState: doc.homeState });
    return { insertedId: "x" };
  });
  return mock;
}

/** NH borders VT; ME borders only NH; CA borders none of them. */
const SEQUENCE = ["NH", "ME", "CA"];

describe("openNppCreationBatch", () => {
  let mock: ReturnType<typeof createMockDb>;
  beforeEach(async () => {
    mock = mountWorld();
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(mock as unknown as Db);
  });

  it("reaches the same affiliation as createNPP for each NPP in turn", async () => {
    const oneByOne: string[] = [];
    for (const state of SEQUENCE) {
      const npp = await createNPP(
        { state, countryId: "US", party: "7", targetOffice: null },
        { existingNames: new Set() }
      );
      oneByOne.push(npp.party);
    }

    mock = mountWorld();
    const batch = openNppCreationBatch(mock as unknown as Db, new Map([["US", ["7", "8"]]]));
    const batched: string[] = [];
    try {
      for (const state of SEQUENCE) {
        const npp = await batch.create(
          { state, countryId: "US", party: "7", targetOffice: null },
          { existingNames: new Set() }
        );
        batched.push(npp.party);
      }
    } finally {
      await batch.close();
    }

    // ME is only reachable once the NH NPP counts as presence.
    expect(oneByOne).toEqual(["7", "7", "independent"]);
    expect(batched).toEqual(oneByOne);
  });

  it("keeps the party and homes the NPP in a held region when no region is requested", async () => {
    // A succession fill has no region. Passing a country code made the party
    // fall outside its frontier and the NPP turned independent.
    const batch = openNppCreationBatch(mock as unknown as Db, new Map([["US", ["7"]]]));
    try {
      const npp = await batch.create(
        { state: "", countryId: "US", party: "7", quality: 0 },
        { existingNames: new Set() }
      );
      expect(npp.party).toBe("7");
      expect(npp.homeState).toBe("VT");
      const wrong = await batch.create(
        { state: "US", countryId: "US", party: "7", quality: 0 },
        { existingNames: new Set() }
      );
      expect(wrong.party).toBe("independent");
    } finally {
      await batch.close();
    }
  });

  it("claims, reads territory and releases once for the whole pass", async () => {
    const batch = openNppCreationBatch(mock as unknown as Db, new Map([["US", ["7", "8"]]]));
    try {
      for (const state of SEQUENCE) {
        await batch.create(
          { state, countryId: "US", party: "7", targetOffice: null },
          { existingNames: new Set() }
        );
      }
      await batch.create(
        { state: "NY", countryId: "US", party: "8", targetOffice: null },
        { existingNames: new Set() }
      );
    } finally {
      await batch.close();
    }

    const parties = mock.collection("politicalParties");
    // One claim covering both listed parties, one release at close.
    expect(parties.updateMany).toHaveBeenCalledTimes(2);
    expect(parties.updateMany.mock.calls[0][0]).toMatchObject({
      $or: [
        { countryId: "US", sequentialId: 7 },
        { countryId: "US", sequentialId: 8 },
      ],
    });
    expect(parties.updateMany.mock.calls[1][1]).toEqual({ $unset: { territoryMutation: "" } });
    expect(mock.collection("states").find).toHaveBeenCalledTimes(1);
    expect(mock.collection("characters").find).toHaveBeenCalledTimes(1);
    expect(mock.collection("partyRenewalStates").findOne).toHaveBeenCalledTimes(1);
    expect(mock.collection("npps").insertOne).toHaveBeenCalledTimes(4);
  });

  it("uses caller-supplied party positions and legislation types instead of reading them", async () => {
    const batch = openNppCreationBatch(mock as unknown as Db, new Map([["US", ["7"]]]));
    try {
      const npp = await batch.create(
        { state: "NH", countryId: "US", party: "7", targetOffice: null, quality: 30 },
        {
          existingNames: new Set(),
          partyPositions: new Map([["US:7", { economicPosition: 4, socialPosition: -4 }]]),
          legislationTypes: [],
        }
      );
      // Quality 30 keeps the draw within 0.5 of the party's position.
      expect(npp.policies.economic).toBeGreaterThanOrEqual(3.5);
      expect(npp.policies.social).toBeLessThanOrEqual(-3.5);
    } finally {
      await batch.close();
    }
    expect(mock.collection("politicalParties").findOne).not.toHaveBeenCalled();
    expect(mock.collection("legislationTypes").find).not.toHaveBeenCalled();
  });
});
