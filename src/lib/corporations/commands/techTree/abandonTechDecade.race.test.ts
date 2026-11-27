import { expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { abandonTechDecade } from "./abandonTechDecade";
import { sectorNodeId } from "@/lib/constants/techTree";
function fixture() {
  const memory = createInMemoryDb();
  const corporation = {
    _id: new ObjectId(),
    name: "Test",
    type: "energy",
    marketingStrength: 100,
    logisticsStrength: 0,
    liquidCapital: 500,
    techDecadeLane: { "2019": "sector" },
    unlockedTechNodeIds: [sectorNodeId("energy", "2019", 4)],
  } as unknown as Corporation;
  memory.seed("corporations", [corporation as never]);
  return { memory, corporation };
}
it("overlapping abandonment reverses a one-time grant once", async () => {
  const { memory, corporation } = fixture();
  const results = await Promise.all([
    abandonTechDecade(memory as never, corporation, "2019", 2020),
    abandonTechDecade(memory as never, corporation, "2019", 2020),
  ]);
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(memory.collection("corporations").docs[0]).toMatchObject({
    marketingStrength: 60,
    liquidCapital: 500,
    unlockedTechNodeIds: [],
  });
});
it("retains a concurrent strength spend rather than recreating or over-debiting it", async () => {
  const { memory, corporation } = fixture();
  memory.collection("corporations").docs[0].marketingStrength = 0;
  expect((await abandonTechDecade(memory as never, corporation, "2019", 2020)).ok).toBe(false);
  expect(memory.collection("corporations").docs[0].marketingStrength).toBe(0);
});
it("a landed write with a lost acknowledgement cannot reverse the grant again", async () => {
  const { memory, corporation } = fixture();
  const fault = withInjectedCrash(memory, {
    collection: "corporations",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  await expect(abandonTechDecade(fault.db, corporation, "2019", 2020)).rejects.toThrow();
  expect(fault.crashed).toBe(true);
  expect((await abandonTechDecade(fault.db, corporation, "2019", 2020)).ok).toBe(false);
  expect(memory.collection("corporations").docs[0].marketingStrength).toBe(60);
});
