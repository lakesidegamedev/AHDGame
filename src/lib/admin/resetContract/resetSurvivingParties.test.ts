import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { PartySeed } from "@/lib/seeds/reference/politicalParties";
import { partyResidue } from "./rules/survivingParties";
import { partySeedValues, resetSurvivingPartiesToSeed } from "./resetSurvivingParties";

const seed = {
  countryId: "UK",
  name: "Labour Party",
  abbreviation: "LAB",
  color: "#E4003B",
  economicPosition: -2,
  socialPosition: -3,
  seedOrder: 1,
  isDefault: true,
} as unknown as PartySeed;

function world() {
  const db = createInMemoryDb();
  db.seed("politicalParties", [
    {
      _id: "p44",
      sequentialId: 44,
      countryId: "UK",
      name: "Labour Party",
      abbreviation: "LAB",
      color: "#E4003B",
      economicPosition: -2,
      socialPosition: -3,
      isDefault: true,
      createdBy: null,
      treasury: 123,
      memberCount: 9,
      isDefunct: true,
      defunctAtTurn: 52,
      mergedIntoPartyId: "p47",
      leadershipTitles: { chair: "Leader of the Co-operative Party" },
      discordInviteUrl: "https://discord.gg/x",
    },
    { _id: "custom", sequentialId: 60, countryId: "UK", name: "Mine", isDefault: false },
  ]);
  db.seed("partyCharters", [{ _id: "c1", countryId: "UK", partyId: "44" }]);
  return db;
}

describe("resetSurvivingPartiesToSeed", () => {
  it("returns a defunct, merged default party to seed values and keeps identity", async () => {
    const db = world();
    const result = await resetSurvivingPartiesToSeed(db as unknown as Db, "2027-default", [seed]);
    const labour = db.collection("politicalParties").docs.find((p) => p._id === "p44")!;
    expect(result.parties).toBe(1);
    expect(labour.isDefunct).toBeUndefined();
    expect(labour.mergedIntoPartyId).toBeUndefined();
    expect(labour.leadershipTitles).toBeUndefined();
    expect(labour.treasury).toBe(1_000_000);
    expect(labour.memberCount).toBe(0);
    expect(labour.sequentialId).toBe(44);
    expect(labour.discordInviteUrl).toBe("https://discord.gg/x");
    expect(partyResidue(labour, partySeedValues(seed, "2027-default"))).toEqual([]);
  });

  it("removes every party charter and leaves non-default parties alone", async () => {
    const db = world();
    const result = await resetSurvivingPartiesToSeed(db as unknown as Db, "2027-default", [seed]);
    expect(result.chartersRemoved).toBe(1);
    expect(db.collection("partyCharters").docs).toHaveLength(0);
    expect(db.collection("politicalParties").docs.find((p) => p._id === "custom")).toBeDefined();
  });

  it("reports a default party with no seed instead of guessing", async () => {
    const db = world();
    const result = await resetSurvivingPartiesToSeed(db as unknown as Db, "2027-default", []);
    expect(result.unseeded).toEqual(["UK:Labour Party"]);
    const labour = db.collection("politicalParties").docs.find((p) => p._id === "p44")!;
    expect(labour.isDefunct).toBeUndefined();
  });
});
