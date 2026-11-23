import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { getNationWorldSnapshots } from "./nationWorldSnapshots";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";

describe("getNationWorldSnapshots", () => {
  it("reads government formations in bulk and keeps the governing party over the largest", async () => {
    const mem = createInMemoryDb();
    mem.seed("gameState", [{ _id: "current", preset: "2019-default" }]);
    mem.seed("countryGameStates", [{ _id: "UK" }, { _id: "DE" }]);
    mem.seed("politicalParties", [
      { _id: "p1", sequentialId: 1, countryId: "UK", name: "Largest", color: "#111111" },
      { _id: "p2", sequentialId: 2, countryId: "UK", name: "Governing", color: "#222222" },
      { _id: "p3", sequentialId: 3, countryId: "DE", name: "Biggest DE", color: "#333333" },
    ]);
    mem.seed("electedOfficials", [
      { _id: "a", countryId: "UK", officeType: "mp", party: "1", seatsHeld: 300 },
      { _id: "b", countryId: "UK", officeType: "mp", party: "2", seatsHeld: 200 },
      { _id: "c", countryId: "DE", officeType: "mdb", party: "3", seatsHeld: 400 },
    ]);
    // UK has a formed government led by the smaller party; DE has no formation.
    mem.seed("governmentFormations", [
      { _id: "UK", status: "formed", governingPartyId: "2", pmName: "Test PM" },
    ]);

    const snaps = await getNationWorldSnapshots(mem as unknown as Db);

    expect(snaps.UK?.legislatureParty?.partySequentialId).toBe("2");
    expect(snaps.UK?.executive.isVacant).toBe(true);
    expect(snaps.DE?.executive.isVacant).toBe(true);
  });
});

describe("withBackgroundHead", () => {
  const vacant = {
    executive: {
      name: "Vacant",
      avatarUrl: null,
      borderKey: null,
      tintColor: null,
      isNpp: false,
      sequentialId: null,
      nppSequentialId: null,
      isVacant: true,
    },
    legislatureParty: null,
  };

  it("fills a vacant executive from the background head record", async () => {
    const { withBackgroundHead } = await import("./nationWorldSnapshots");
    const filled = withBackgroundHead(vacant, "Monique Boyer");
    expect(filled.executive.name).toBe("Monique Boyer");
    expect(filled.executive.isVacant).toBe(false);
  });

  it("leaves a seated executive and a missing head alone", async () => {
    const { withBackgroundHead } = await import("./nationWorldSnapshots");
    expect(withBackgroundHead(vacant, undefined)).toBe(vacant);
    const seated = { ...vacant, executive: { ...vacant.executive, name: "A", isVacant: false } };
    expect(withBackgroundHead(seated, "B")).toBe(seated);
  });
});
