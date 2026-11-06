import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { viewerHoldsShares } from "./viewerShareholding";

function fakeDb(opts: { character?: ObjectId | null; ownedCorpIds?: ObjectId[] }) {
  return {
    collection: (name: string) => ({
      findOne: async (filter: Record<string, unknown>) => {
        if (name === "characters") return opts.character ? { _id: opts.character } : null;
        const ids = ((filter._id as { $in: ObjectId[] }).$in ?? []).map(String);
        return (opts.ownedCorpIds ?? []).some((id) => ids.includes(String(id)))
          ? { _id: new ObjectId() }
          : null;
      },
    }),
  } as never;
}

const userId = new ObjectId().toString();

describe("viewerHoldsShares", () => {
  it("is true for a character holder with shares", async () => {
    const char = new ObjectId();
    const corp = { shareholders: [{ characterId: char, shares: 2_500_000 }] } as never;
    expect(await viewerHoldsShares(fakeDb({ character: char }), corp, userId)).toBe(true);
  });

  it("is false for a viewer who is not on the cap table", async () => {
    const corp = { shareholders: [{ characterId: new ObjectId(), shares: 10 }] } as never;
    expect(await viewerHoldsShares(fakeDb({ character: new ObjectId() }), corp, userId)).toBe(
      false
    );
  });

  it("is false for a zero-share row and for anonymous viewers", async () => {
    const char = new ObjectId();
    const zero = { shareholders: [{ characterId: char, shares: 0 }] } as never;
    expect(await viewerHoldsShares(fakeDb({ character: char }), zero, userId)).toBe(false);
    const held = { shareholders: [{ characterId: char, shares: 5 }] } as never;
    expect(await viewerHoldsShares(fakeDb({ character: char }), held, undefined)).toBe(false);
  });

  it("is true when a corporation the viewer runs holds shares", async () => {
    const holderCorp = new ObjectId();
    const corp = { shareholders: [{ corporationId: holderCorp, shares: 100 }] } as never;
    expect(await viewerHoldsShares(fakeDb({ ownedCorpIds: [holderCorp] }), corp, userId)).toBe(
      true
    );
    expect(await viewerHoldsShares(fakeDb({ ownedCorpIds: [] }), corp, userId)).toBe(false);
  });
});
