import type { Document } from "mongodb";
import { describe, expect, it } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { migration } from "./2026-09-02-state-party-org-rekey";
const row = {
  _id: "NW_7",
  countryId: "DD",
  stateId: "NW",
  partyId: "1",
  treasury: 500,
  politicalStrength: 25,
  organization: 30,
};
describe(migration.id, () => {
  it("dry run leaves resources and identity untouched", async () => {
    const { db } = createTransactionalMemoryDb();
    await db.collection<Document & { _id: string }>("statePartyOrg").insertOne(row);
    const report = await migration.execute(db, { dryRun: true });
    expect(report.documentsDeleted).toBe(0);
    expect(
      await db.collection<Document & { _id: string }>("statePartyOrg").findOne({ _id: row._id })
    ).toEqual(row);
  });
  it.each(["deleteOne", "insertOne"] as const)(
    "rolls back a landed %s and retries without losing resources",
    async (op) => {
      const { db, memory } = createTransactionalMemoryDb();
      await db.collection<Document & { _id: string }>("statePartyOrg").insertOne(row);
      const fault = withInjectedCrash(memory, {
        collection: "statePartyOrg",
        op,
        onCall: 1,
        afterWrite: true,
      });
      await expect(migration.execute(fault.db, { dryRun: false })).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(
        await db.collection<Document & { _id: string }>("statePartyOrg").findOne({ _id: row._id })
      ).toEqual(row);
      await migration.execute(db, { dryRun: false });
      await migration.execute(db, { dryRun: false });
      expect(
        await db.collection<Document & { _id: string }>("statePartyOrg").findOne({ _id: "NW_1" })
      ).toEqual({ ...row, _id: "NW_1" });
      expect(
        await db.collection<Document & { _id: string }>("statePartyOrg").countDocuments({})
      ).toBe(1);
    }
  );
  it.each(["NW_1", "NW_9"])("retains both chapters when %s collides", async (otherId) => {
    const { db } = createTransactionalMemoryDb();
    const other = { ...row, _id: otherId, treasury: 700, politicalStrength: 9 };
    await db.collection<Document & { _id: string }>("statePartyOrg").insertMany([row, other]);
    const result = await migration.execute(db, { dryRun: false });
    expect(result.documentsDeleted).toBe(0);
    expect(
      await db.collection<Document & { _id: string }>("statePartyOrg").find({}).toArray()
    ).toEqual([row, other]);
    expect(result.notes?.join(" ")).toContain("require reconciliation");
  });
  it("does not steal a different chapter's canonical key", async () => {
    const { db } = createTransactionalMemoryDb();
    const holder = { ...row, _id: "NW_1", countryId: "US", partyId: "1", treasury: 1000 };
    await db.collection<Document & { _id: string }>("statePartyOrg").insertMany([row, holder]);
    await migration.execute(db, { dryRun: false });
    expect(
      await db.collection<Document & { _id: string }>("statePartyOrg").findOne({ _id: row._id })
    ).toEqual(row);
    expect(
      await db.collection<Document & { _id: string }>("statePartyOrg").findOne({ _id: holder._id })
    ).toEqual(holder);
  });
});
