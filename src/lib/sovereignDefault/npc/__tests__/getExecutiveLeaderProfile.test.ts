import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import {
  deriveIdeology,
  deriveGovernmentType,
  getExecutiveLeaderProfile,
} from "../getExecutiveLeaderProfile";

describe("deriveIdeology", () => {
  it("undefined positions → centrist", () => {
    expect(deriveIdeology(undefined)).toBe("centrist");
  });
  it("far-left economic + moderate social → socialist", () => {
    expect(deriveIdeology({ economic: -3, social: 0 })).toBe("socialist");
  });
  it("free-market + traditional → conservative", () => {
    expect(deriveIdeology({ economic: 3, social: 2.5 })).toBe("conservative");
  });
  it("free-market + socially-open → technocrat", () => {
    expect(deriveIdeology({ economic: 2.5, social: -1 })).toBe("technocrat");
  });
  it("strongly traditional regardless of economic → nationalist", () => {
    expect(deriveIdeology({ economic: 0, social: 3.5 })).toBe("nationalist");
  });
  it("extreme economic without fitting other buckets → populist", () => {
    expect(deriveIdeology({ economic: -3.25, social: 1.5 })).toBe("populist");
  });
  it("moderate values → centrist", () => {
    expect(deriveIdeology({ economic: 0.5, social: -0.25 })).toBe("centrist");
  });
});

describe("deriveGovernmentType", () => {
  it("US returns democracy", () => {
    expect(deriveGovernmentType("US")).toBe("democracy");
  });
  it("UK returns democracy", () => {
    expect(deriveGovernmentType("UK")).toBe("democracy");
  });
});

describe("getExecutiveLeaderProfile", () => {
  function mockDb(opts: {
    character?: Record<string, unknown> | null;
    npp?: Record<string, unknown> | null;
  }) {
    return {
      collection: vi.fn((name: string) => {
        if (name === "characters")
          return { findOne: vi.fn().mockResolvedValue(opts.character ?? null) };
        if (name === "npps") return { findOne: vi.fn().mockResolvedValue(opts.npp ?? null) };
        throw new Error(`unexpected collection: ${name}`);
      }),
    } as never;
  }

  it("returns Character profile when player executive exists", async () => {
    const charId = new ObjectId();
    const db = mockDb({
      character: {
        _id: charId,
        policies: { economic: 3, social: 2.5 },
      },
    });
    const profile = await getExecutiveLeaderProfile(db, "US");
    expect(profile.characterId?.toString()).toBe(charId.toString());
    expect(profile.ideology).toBe("conservative");
    expect(profile.governmentType).toBe("democracy");
    expect(profile.kind).toBe("player");
  });

  it("falls back to NPP when no Character executive", async () => {
    const nppId = new ObjectId();
    const db = mockDb({
      character: null,
      npp: {
        _id: nppId,
        policies: { economic: -3, social: 0 },
      },
    });
    const profile = await getExecutiveLeaderProfile(db, "US");
    expect(profile.characterId?.toString()).toBe(nppId.toString());
    expect(profile.ideology).toBe("socialist");
    expect(profile.kind).toBe("npp");
  });

  it("returns null + centrist when no executive holder", async () => {
    const db = mockDb({ character: null, npp: null });
    const profile = await getExecutiveLeaderProfile(db, "US");
    expect(profile.characterId).toBeNull();
    expect(profile.ideology).toBe("centrist");
    expect(profile.governmentType).toBe("democracy");
    expect(profile.kind).toBe("none");
  });
});
