import { describe, expect, it, vi } from "vitest";
vi.mock("../utils/db", () => ({ connectDb: vi.fn(), closeDb: vi.fn() }));
import { repairWelcomeMails } from "./2026-11-23-repair-welcome-mail";

const old =
  "You have a character, a home state, $344,620 in campaign funds, and 25 bonus actions. That is more than most politicians start with.";

function fakeDb() {
  const updates: unknown[] = [];
  const db = {
    collection: () => ({
      find: () => ({
        async *[Symbol.asyncIterator]() {
          yield { _id: "m1", body: old };
        },
      }),
      updateOne: async (...args: unknown[]) => updates.push(args),
    }),
  };
  return { db: db as never, updates };
}

describe("repairWelcomeMails", () => {
  it("dry run writes nothing", async () => {
    const { db, updates } = fakeDb();
    expect((await repairWelcomeMails(db, { dryRun: true })).changed).toBe(1);
    expect(updates).toEqual([]);
  });
  it("apply writes the repaired body", async () => {
    const { db, updates } = fakeDb();
    await repairWelcomeMails(db, { dryRun: false });
    expect(JSON.stringify(updates)).toContain("opening figures");
  });
});
