import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { seedCnStatePartyOrg } from "./seedCnStatePartyOrg";

describe("CN recreated party identities", () => {
  it.each([0, 3])("uses the current roster after %i old party IDs", async (offset) => {
    const memory = createInMemoryDb(),
      db = memory as unknown as Db;
    memory.seed(
      "politicalParties",
      ["CCP", "CDL", "CNDCA"].map((abbreviation, i) => ({
        _id: `party${i}`,
        countryId: "CN",
        sequentialId: offset + i + 1,
        abbreviation,
      }))
    );
    await memory
      .collection("politicalParties")
      .insertOne({ _id: "foreign", countryId: "US", sequentialId: 99, abbreviation: "CCP" });
    await seedCnStatePartyOrg(db, true, () => {}, "2027-default");
    await seedCnStatePartyOrg(db, false, () => {}, "2027-default");
    const rows = await memory.collection("statePartyOrg").find({ countryId: "CN" }).toArray();
    expect(rows).toHaveLength(21);
    expect([...new Set(rows.map((r) => r.partyId))].sort()).toEqual(
      [1, 2, 3].map((i) => String(offset + i))
    );
  });
});
