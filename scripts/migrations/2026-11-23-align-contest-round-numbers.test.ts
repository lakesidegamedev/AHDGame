import { describe, it, expect, vi } from "vitest";

vi.mock("../utils/db", () => ({ connectDb: vi.fn(), closeDb: vi.fn() }));

import { alignContestRoundNumbers } from "./2026-11-23-align-contest-round-numbers";

function fakeDb(rows: unknown[]) {
  const updateOne = vi.fn();
  const db = {
    collection: () => ({
      find: () => ({ toArray: async () => rows }),
      updateOne,
    }),
  };
  return { db: db as never, updateOne };
}

const t = new Date(Date.UTC(2026, 10, 15, 3));
const rows = [
  { _id: "kingmaker:6", kind: "kingmaker", roundNumber: 6, startedAt: t },
  { _id: "influence_gain:7", kind: "influence_gain", roundNumber: 7, startedAt: t },
];

describe("alignContestRoundNumbers", () => {
  it("dry run writes nothing", async () => {
    const { db, updateOne } = fakeDb(rows);
    expect((await alignContestRoundNumbers(db, { dryRun: true })).changed).toBe(1);
    expect(updateOne).not.toHaveBeenCalled();
  });
  it("apply lifts the laggard", async () => {
    const { db, updateOne } = fakeDb(rows);
    await alignContestRoundNumbers(db, { dryRun: false });
    expect(updateOne).toHaveBeenCalledWith({ _id: "kingmaker:6" }, { $set: { roundNumber: 7 } });
  });
});
