import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { withPendingOrganizationResolution } from "./resolvePendingResolution";
import { payOrganizationAid } from "./aid";
import { queueAidAlignmentPull } from "@/lib/alignment/commands/queueAidAlignment";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/alignment/topology", () => ({
  loadAlignmentTopology: vi.fn(async () => ({ channels: [{ organizationId: "UN" }] })),
}));

it("commits activation, aid, growth and alignment together and excludes concurrent resolution", async () => {
  const { db, memory } = createTransactionalMemoryDb();
  const id = new ObjectId();
  memory.seed("gameState", [
    { _id: "current", currentTurn: 25, preset: "1953-default", startingYear: 1953 },
  ]);
  memory.seed("organizationLegislation", [
    { _id: id, organizationId: "UN", status: "pending", votes: [{ countryId: "US", vote: "yes" }] },
  ]);
  memory.seed("organizationFunds", [
    { _id: new ObjectId(), organizationId: "UN", currencyCountryId: "US", balanceLocal: 1000 },
  ]);
  memory.seed("federalBudget", [{ _id: new ObjectId(), countryId: "US", treasuryBalance: 1000 }]);
  memory.seed("states", [{ _id: "US-CA", countryId: "US" }]);
  memory.seed("macroMetrics", [{ _id: "US-CA", economic: { gdpGrowth: { value: 1 } } }]);
  const apply: Parameters<typeof withPendingOrganizationResolution>[2] = async (tx, row) => {
    expect(row.votes).toEqual([{ countryId: "US", vote: "yes" }]);
    await tx
      .collection("organizationLegislation")
      .updateOne({ _id: id }, { $set: { status: "active" } });
    expect(
      await payOrganizationAid(tx, "UN", "US", 100, { turn: 25, settlementKey: `resolution:${id}` })
    ).toBe(true);
    await queueAidAlignmentPull({
      db: tx,
      organizationId: "UN",
      recipient: "US",
      amountUsd: 100,
      amountLocal: 100,
      turn: 25,
      sourceResolutionId: id,
    });
  };
  const fault = withInjectedCrash(memory, {
    collection: "alignmentPlays",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: db.client });
  await expect(withPendingOrganizationResolution(fault.db, { _id: id }, apply)).rejects.toThrow();
  expect(memory.collection("organizationLegislation").docs[0].status).toBe("pending");
  expect(memory.collection("organizationFunds").docs[0].balanceLocal).toBe(1000);
  expect(memory.collection("federalBudget").docs[0].treasuryBalance).toBe(1000);
  expect(memory.collection("macroMetrics").docs[0]).toMatchObject({
    economic: { gdpGrowth: { value: 1 } },
  });
  expect(memory.collection("alignmentPlays").docs).toHaveLength(0);
  fault.disarm();
  const results = await Promise.all([
    withPendingOrganizationResolution(db, { _id: id }, apply),
    withPendingOrganizationResolution(db, { _id: id }, apply),
  ]);
  expect(results.sort()).toEqual([false, true]);
  expect(memory.collection("organizationLegislation").docs[0].status).toBe("active");
  expect(memory.collection("organizationFunds").docs[0].balanceLocal).toBe(900);
  expect(memory.collection("federalBudget").docs[0].treasuryBalance).toBe(1100);
  expect(memory.collection("alignmentPlays").docs).toHaveLength(1);
});
