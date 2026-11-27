import { expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { migration } from "./2026-06-02-index-fund-real-bonds";

function fixture() {
  const memory = createInMemoryDb();
  memory.seed("indexFunds", [
    {
      _id: new ObjectId(),
      cashAnchor: 100,
      bondAllocations: [{ countryId: "US", principalAnchor: 50 }],
    },
  ]);
  return memory;
}
it("concurrent conversions redeem one original synthetic claim", async () => {
  const memory = fixture();
  const results = await Promise.all([
    migration.execute(memory as never, { dryRun: false } as never),
    migration.execute(memory as never, { dryRun: false } as never),
  ]);
  expect(memory.collection("indexFunds").docs[0].cashAnchor).toBe(150);
  expect(results.reduce((sum, result) => sum + result.documentsUpdated!, 0)).toBe(1);
});
it("a lost acknowledgement cannot restore the redeemed claim on retry", async () => {
  const memory = fixture();
  const fault = withInjectedCrash(memory, {
    collection: "indexFunds",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  await expect(migration.execute(fault.db, { dryRun: false } as never)).rejects.toThrow();
  expect(fault.crashed).toBe(true);
  await migration.execute(fault.db, { dryRun: false } as never);
  expect(memory.collection("indexFunds").docs[0].cashAnchor).toBe(150);
  expect(memory.collection("indexFunds").docs[0].bondAllocations).toBeUndefined();
});
