import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { STATE_BILL_PARTY_NPP_INDEX } from "@/lib/legislature/stateBillPartyNppIndex";
import { migration } from "./2026-10-27-party-npp-regional-bills";
describe("Party NPP regional bill migration", () => {
  it("does not write in dry-run mode or backfill legacy bills", async () => {
    const db = createMockDb();
    await migration.execute(db as unknown as Db, { dryRun: true });
    expect(db.collection).not.toHaveBeenCalled();
  });
  it("creates the same partial unique index used by reset bootstrap", async () => {
    const db = createMockDb();
    await migration.execute(db as unknown as Db, { dryRun: false });
    expect(db.collection("stateBills").createIndex).toHaveBeenCalledWith(
      STATE_BILL_PARTY_NPP_INDEX.key,
      STATE_BILL_PARTY_NPP_INDEX.options
    );
    expect(STATE_BILL_PARTY_NPP_INDEX.options.partialFilterExpression.status.$in).toContain(
      "vote_closing"
    );
  });
});
