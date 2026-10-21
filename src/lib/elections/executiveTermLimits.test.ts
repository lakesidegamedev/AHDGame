import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "@/lib/mongodb";
import type { CareerEvent } from "@/lib/db/types";
import {
  getExecutiveTermLimit,
  getExecutiveTermsServed,
  hasReachedExecutiveTermLimit,
  incrementExecutiveTermsServedUpdate,
} from "./executiveTermLimits";
import { loadFoundingElectionIds } from "./foundingTermElections";

const legacyPresidentHistory: CareerEvent[] = [
  {
    type: "elected",
    office: { type: "president" },
    officeLabel: "President",
    date: new Date(),
  },
  {
    type: "appointed",
    office: { type: "president" },
    officeLabel: "President",
    date: new Date(),
  },
];

describe("executiveTermLimits", () => {
  it("reads the configured US executive term limit", () => {
    expect(getExecutiveTermLimit("US")).toBe(2);
    expect(getExecutiveTermLimit("UK")).toBeNull();
  });

  it("treats missing stored terms as zero", () => {
    expect(getExecutiveTermsServed({}, "US")).toBe(0);
    expect(hasReachedExecutiveTermLimit({}, "US")).toBe(false);
  });

  it("falls back to presidential career history for legacy characters", () => {
    const legacyCharacter = {
      careerHistory: legacyPresidentHistory,
    };
    expect(getExecutiveTermsServed(legacyCharacter, "US")).toBe(2);
    expect(hasReachedExecutiveTermLimit(legacyCharacter, "US")).toBe(true);
  });

  it("flags characters who have already reached the configured limit", () => {
    const character = { executiveTermsServed: { US: 2 } };
    expect(hasReachedExecutiveTermLimit(character, "US")).toBe(true);
  });

  it("builds the next-term update payload from the higher of stored or historical terms", () => {
    const character = {
      careerHistory: [legacyPresidentHistory[0]],
    };
    expect(incrementExecutiveTermsServedUpdate(character, "US")).toEqual({
      "executiveTermsServed.US": 2,
    });
  });
});

const legacyUachtaranHistory: CareerEvent[] = [
  {
    type: "elected",
    office: { type: "uachtaran" },
    officeLabel: "Uachtarán na hÉireann",
    date: new Date(),
  },
  {
    type: "elected",
    office: { type: "uachtaran" },
    officeLabel: "Uachtarán na hÉireann",
    date: new Date(),
  },
];

describe("executiveTermLimits — Ireland Uachtarán", () => {
  it("reads Ireland's 2-term Uachtarán limit", () => {
    expect(getExecutiveTermLimit("IE")).toBe(2);
  });

  it("counts uachtaran career events toward the IE limit", () => {
    const character = { careerHistory: legacyUachtaranHistory };
    expect(getExecutiveTermsServed(character, "IE")).toBe(2);
    expect(hasReachedExecutiveTermLimit(character, "IE")).toBe(true);
  });

  it("does NOT count president career events toward the IE limit", () => {
    // A character who served two US presidential terms cannot have those terms
    // double-counted against an Irish Uachtarán run.
    const character = { careerHistory: legacyPresidentHistory };
    expect(getExecutiveTermsServed(character, "IE")).toBe(0);
    expect(hasReachedExecutiveTermLimit(character, "IE")).toBe(false);
  });

  it("US regression: presidential terms still counted for US (no drift)", () => {
    const character = { careerHistory: legacyPresidentHistory };
    expect(getExecutiveTermsServed(character, "US")).toBe(2);
    expect(hasReachedExecutiveTermLimit(character, "US")).toBe(true);
  });
});

describe("executiveTermLimits — founding (world-start) terms", () => {
  const foundingElectionId = new ObjectId().toString();
  const term = (electionId: string, type: CareerEvent["type"] = "elected"): CareerEvent => ({
    type,
    office: { type: "president" },
    officeLabel: type === "appointed" ? "Acting President" : "President",
    partyCountryId: "US",
    electionId,
    date: new Date(),
  });
  const founding = term(foundingElectionId);
  const foundingIds = new Set([foundingElectionId]);

  it("does not count the founding term: founding + one elected term may run again", () => {
    // Founding seating incremented the stored counter like any other seating.
    const character = {
      careerHistory: [founding, term(new ObjectId().toString())],
      executiveTermsServed: { US: 2 },
    };
    expect(getExecutiveTermsServed(character, "US", foundingIds)).toBe(1);
    expect(hasReachedExecutiveTermLimit(character, "US", foundingIds)).toBe(false);
  });

  it("still blocks two non-founding elected terms", () => {
    const character = {
      careerHistory: [term(new ObjectId().toString()), term(new ObjectId().toString())],
      executiveTermsServed: { US: 2 },
    };
    expect(hasReachedExecutiveTermLimit(character, "US", foundingIds)).toBe(true);
  });

  it("blocks founding + two elected terms", () => {
    const character = {
      careerHistory: [founding, term(new ObjectId().toString()), term(new ObjectId().toString())],
      executiveTermsServed: { US: 3 },
    };
    expect(getExecutiveTermsServed(character, "US", foundingIds)).toBe(2);
    expect(hasReachedExecutiveTermLimit(character, "US", foundingIds)).toBe(true);
  });

  it("does not count an acting presidency", () => {
    const character = {
      careerHistory: [
        term(new ObjectId().toString(), "appointed"),
        term(new ObjectId().toString()),
      ],
      executiveTermsServed: { US: 1 },
    };
    expect(getExecutiveTermsServed(character, "US")).toBe(1);
    expect(hasReachedExecutiveTermLimit(character, "US")).toBe(false);
  });

  it("keeps the stored counter raw so a founding term is never double-subtracted", () => {
    const afterFounding = { careerHistory: [founding], executiveTermsServed: { US: 1 } };
    expect(getExecutiveTermsServed(afterFounding, "US", foundingIds)).toBe(0);
    expect(incrementExecutiveTermsServedUpdate(afterFounding, "US")).toEqual({
      "executiveTermsServed.US": 2,
    });
  });

  it("loads only cycle-0 presidential elections from the characters' careers", async () => {
    const other = new ObjectId().toString();
    const find = vi.fn().mockReturnValue({
      toArray: async () => [{ _id: new ObjectId(foundingElectionId) }],
    });
    const db = { collection: vi.fn().mockReturnValue({ find }) } as unknown as Db;
    const ids = await loadFoundingElectionIds(
      db,
      [{ careerHistory: [founding, term(other)] }, {}],
      "US"
    );
    expect(ids).toEqual(new Set([foundingElectionId]));
    expect(db.collection).toHaveBeenCalledWith("elections");
    expect(find.mock.calls[0][0]).toEqual({
      _id: { $in: [new ObjectId(foundingElectionId), new ObjectId(other)] },
      cycle: 0,
    });
  });

  it("skips the query when no character has an elected executive term", async () => {
    const db = { collection: vi.fn() } as unknown as Db;
    expect(await loadFoundingElectionIds(db, [{}], "US")).toEqual(new Set());
    expect(db.collection).not.toHaveBeenCalled();
  });
});
