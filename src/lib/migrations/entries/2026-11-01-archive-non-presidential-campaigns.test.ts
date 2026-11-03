import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { migration } from "./2026-11-01-archive-non-presidential-campaigns";

function mockDb() {
  const pres = new ObjectId();
  const senate = new ObjectId();
  const commons = new ObjectId();
  const campaigns = [
    { _id: new ObjectId(), electionId: pres, funds: 900 },
    { _id: new ObjectId(), electionId: senate, funds: 120 },
    { _id: new ObjectId(), electionId: senate, funds: -30 },
    { _id: new ObjectId(), electionId: commons, funds: 50 },
  ];
  const elections = [
    { _id: pres, countryId: "US", electionType: "president" },
    { _id: senate, countryId: "US", electionType: "senate" },
    { _id: commons, countryId: "UK", electionType: "commons" },
  ];
  const updateMany = vi.fn(async () => ({ modifiedCount: 3 }));
  const db = {
    collection: (name: string) => ({
      find: () => ({ toArray: async () => (name === "campaigns" ? campaigns : elections) }),
      updateMany,
    }),
  } as unknown as Db;
  return { db, updateMany, campaigns };
}

describe("2026-11-01-archive-non-presidential-campaigns migration", () => {
  it("archives every non-presidential campaign and leaves its funds in place", async () => {
    const { db, updateMany, campaigns } = mockDb();
    const result = await migration.execute(db, { dryRun: false });
    const [filter, update] = updateMany.mock.calls[0] as unknown as [
      { _id: { $in: ObjectId[] } },
      { $set: Record<string, unknown> },
    ];
    expect(filter._id.$in).toEqual([campaigns[1]._id, campaigns[2]._id, campaigns[3]._id]);
    expect(update.$set).toMatchObject({ status: "archived", archivedReason: "ineligible" });
    expect(update.$set).not.toHaveProperty("funds");
    expect(result.documentsUpdated).toBe(3);
    expect(result.notes).toEqual([
      "archived 1 UK/commons campaign(s), 50 local funds left on them",
      "archived 2 US/senate campaign(s), 90 local funds left on them",
    ]);
  });

  it("writes nothing on a dry run", async () => {
    const { db, updateMany } = mockDb();
    const result = await migration.execute(db, { dryRun: true });
    expect(updateMany).not.toHaveBeenCalled();
    expect(result.notes?.[0]).toMatch(/^would archive 1 UK\/commons/);
  });
});
