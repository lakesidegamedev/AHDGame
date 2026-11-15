import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { makeElection, makeCharacter, makeNPP } from "@/lib/test-utils/factories";
import { fetchDepsForElection } from "./enrichElection";

vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(() => {
    throw new Error("Unexpected ambient DB read");
  }),
}));

describe("incumbent identity scope", () => {
  it("keeps a foreign president from shadowing the US incumbent", async () => {
    const db = createInMemoryDb() as unknown as Db;
    await db
      .collection("characters")
      .insertOne(makeCharacter({ countryId: "BR", currentOffice: { type: "president" } }));
    await db
      .collection("npps")
      .insertOne(
        makeNPP({ countryId: "US", name: "US incumbent", currentOffice: { type: "president" } })
      );
    const deps = await fetchDepsForElection(
      db,
      makeElection({ countryId: "US", electionType: "president" }),
      "summary"
    );
    expect(deps.incumbent?.name).toBe("US incumbent");
  });
  it("preserves legacy US country defaults and selects the exact Senate class", async () => {
    const db = createInMemoryDb() as unknown as Db;
    const legacy = makeCharacter({
      name: "Legacy US president",
      currentOffice: { type: "president" },
    });
    const { countryId: _legacyCountry, ...legacyDocument } = legacy;
    await db.collection("characters").insertOne(legacyDocument);
    expect(
      (
        await fetchDepsForElection(
          db,
          makeElection({ countryId: "US", electionType: "president" }),
          "summary"
        )
      ).incumbent?.name
    ).toBe("Legacy US president");
    for (const senateClass of [1, 3] as const)
      await db.collection("npps").insertOne(
        makeNPP({
          countryId: "US",
          name: `Class ${senateClass}`,
          currentOffice: { type: "senate", state: "CT", senateClass },
        })
      );
    expect(
      (
        await fetchDepsForElection(
          db,
          makeElection({ countryId: "US", electionType: "senate", state: "CT", senateClass: 1 }),
          "summary"
        )
      ).incumbent?.name
    ).toBe("Class 1");
    expect(
      (
        await fetchDepsForElection(
          db,
          makeElection({ countryId: "US", electionType: "senate", state: "CT", senateClass: 3 }),
          "summary"
        )
      ).incumbent?.name
    ).toBe("Class 3");
  });
});
