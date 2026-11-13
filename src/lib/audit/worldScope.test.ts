import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { currentWorldFilter, withCurrentWorld, worldStartOf } from "./worldScope";

const START_SECONDS = 1_800_000_000;
const EPOCH = ObjectId.createFromTime(START_SECONDS).toHexString();

type Clause = { worldEpochId: unknown; _id?: { $gte: ObjectId } };

function matches(row: { worldEpochId?: string; _id: ObjectId }): boolean {
  const filter = currentWorldFilter(EPOCH) as { $or: Clause[] };
  return filter.$or.some((clause) => {
    if (clause.worldEpochId !== null) return row.worldEpochId === clause.worldEpochId;
    if (row.worldEpochId !== undefined) return false;
    return (
      row._id.getTimestamp().getTime() >=
      (clause._id as { $gte: ObjectId }).$gte.getTimestamp().getTime()
    );
  });
}

describe("currentWorldFilter", () => {
  it("derives the world start from the epoch id", () => {
    expect(worldStartOf(EPOCH)?.getTime()).toBe(START_SECONDS * 1000);
    expect(worldStartOf("nope")).toBeNull();
  });

  it("keeps a row stamped with the current world", () => {
    expect(
      matches({ worldEpochId: EPOCH, _id: ObjectId.createFromTime(START_SECONDS - 500) })
    ).toBe(true);
  });

  it("drops a row stamped with another world", () => {
    const other = ObjectId.createFromTime(START_SECONDS - 9000).toHexString();
    expect(matches({ worldEpochId: other, _id: ObjectId.createFromTime(START_SECONDS + 10) })).toBe(
      false
    );
  });

  it("keeps an unstamped row created after the world began", () => {
    expect(matches({ _id: ObjectId.createFromTime(START_SECONDS + 10) })).toBe(true);
    expect(matches({ _id: ObjectId.createFromTime(START_SECONDS) })).toBe(true);
  });

  it("drops an unstamped row created before the world began", () => {
    expect(matches({ _id: ObjectId.createFromTime(START_SECONDS - 1) })).toBe(false);
  });

  it("can age rows by createdAt instead of the id", () => {
    const filter = currentWorldFilter(EPOCH, "createdAt") as {
      $or: Array<Record<string, unknown>>;
    };
    expect(filter.$or[1]).toEqual({
      worldEpochId: null,
      createdAt: { $gte: new Date(START_SECONDS * 1000) },
    });
  });

  it("excludes nothing when no world is active", () => {
    expect(currentWorldFilter(null)).toEqual({});
    const filter = { turn: 5 };
    expect(withCurrentWorld(filter, undefined)).toBe(filter);
  });

  it("ANDs the scope onto a filter that already has an $or", () => {
    const base = { $or: [{ a: 1 }, { b: 2 }] };
    expect(withCurrentWorld(base, EPOCH)).toEqual({
      $and: [base, currentWorldFilter(EPOCH)],
    });
  });
});
