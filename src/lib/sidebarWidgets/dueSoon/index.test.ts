import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { collectDueSoon, DUE_SOON_LIMIT, loadDueSoon } from "./index";
import type { DueSoonItem } from "./types";
import { dueSoonContext, fakeDueSoonDb } from "./__tests__/fakeDb";

function item(id: string, due: Partial<Pick<DueSoonItem, "dueTurn" | "dueAt">>): DueSoonItem {
  return {
    kind: "billVote",
    id,
    subject: id,
    href: `/x/${id}`,
    dueTurn: null,
    dueAt: null,
    ...due,
  };
}

describe("collectDueSoon", () => {
  it("merges sources soonest first across turns and dates, and drops duplicates", async () => {
    const { db } = fakeDueSoonDb({});
    // currentTurn 100, now 2026-01-01T00:00Z; one turn is one hour.
    const data = await collectDueSoon(dueSoonContext(db), [
      async () => [item("late", { dueTurn: 110 }), item("next", { dueTurn: 101 })],
      async () => [
        item("dated", { dueAt: "2026-01-01T03:00:00.000Z" }),
        item("next", { dueTurn: 101 }),
      ],
    ]);
    expect(data.items.map((row) => row.id)).toEqual(["next", "dated", "late"]);
    expect(data).toMatchObject({ currentTurn: 100, asOf: "2026-01-01T00:00:00.000Z", total: 3 });
  });

  it("caps the list but counts everything, and survives a failing source", async () => {
    const { db } = fakeDueSoonDb({});
    const many = Array.from({ length: DUE_SOON_LIMIT + 3 }, (_, i) =>
      item(`b${i}`, { dueTurn: 101 + i })
    );
    const data = await collectDueSoon(dueSoonContext(db), [
      async () => many,
      async () => {
        throw new Error("down");
      },
    ]);
    expect(data.items).toHaveLength(DUE_SOON_LIMIT);
    expect(data.total).toBe(DUE_SOON_LIMIT + 3);
  });
});

describe("loadDueSoon", () => {
  it("returns null without an active character, and for imperial characters", async () => {
    const findOne = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
      _id: new ObjectId(),
      activeCharacterId: new ObjectId(),
      activeCharacterType: "imperial",
    });
    const db = { collection: () => ({ findOne }) } as unknown as Db;
    expect(await loadDueSoon(db, new ObjectId().toString())).toBeNull();
    expect(await loadDueSoon(db, new ObjectId().toString())).toBeNull();
  });

  it("returns an empty list for a character with nothing waiting", async () => {
    const characterId = new ObjectId();
    const { db } = fakeDueSoonDb({
      users: [{ _id: new ObjectId(), activeCharacterId: characterId }],
      characters: [{ _id: characterId, countryId: "US" }],
      gameState: [{ _id: "current", currentTurn: 42 }],
    });
    expect(await loadDueSoon(db, new ObjectId().toString())).toMatchObject({
      currentTurn: 42,
      total: 0,
      items: [],
    });
  });
});
