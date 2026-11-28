import { expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { processAllStateDemographics } from "./demographicEffects";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
function world(canadianLaw = false) {
  const { db, memory } = createTransactionalMemoryDb();
  memory.seed("gameState", [{ _id: "current", currentTurn: 100, preset: "2019-default" }]);
  memory.seed("states", [
    { _id: "AL", countryId: "US" },
    { _id: "ON", countryId: "CA" },
  ]);
  memory.seed(
    "stateDemographics",
    ["AL", "ON"].map((id) => ({
      _id: id,
      countryId: id === "ON" ? "CA" : "US",
      categoryWeights: {},
      groups: {},
      lastUpdated: new Date(),
    }))
  );
  memory.seed("legislationTypes", [
    {
      _id: "synthetic",
      demographicEffects: [{ dim: "age", bucket: "young", target: "turnout", direction: 1 }],
    },
  ]);
  memory.seed("statePolicies", [
    { _id: "us-law", stateId: "federal", legislationTypeId: "synthetic", economic: 3 },
    ...(canadianLaw
      ? [{ _id: "ca-law", stateId: "ca_national", legislationTypeId: "synthetic", economic: -3 }]
      : []),
  ]);
  return { db, memory };
}
it("never applies US national law to a Canadian province", async () => {
  const { db, memory } = world();
  await processAllStateDemographics(db, undefined, 100);
  expect(memory.collection("stateDemographics").docs[0].layer1TurnoutOverrides).toBeDefined();
  expect(memory.collection("stateDemographics").docs[1].layer1TurnoutOverrides).toBeUndefined();
});
it("applies Canada's own national law and keeps a settled turn frozen across retries", async () => {
  const { db, memory } = world(true);
  await Promise.all([
    processAllStateDemographics(db, undefined, 100),
    processAllStateDemographics(db, undefined, 100),
  ]);
  const canadian = memory.collection("stateDemographics").docs[1];
  expect((canadian.layer1TurnoutOverrides as { age: { young: number } }).age.young).toBeLessThan(0);
  const settled = structuredClone(canadian);
  memory.collection("statePolicies").docs[1].economic = 3;
  await processAllStateDemographics(db, undefined, 100);
  expect(memory.collection("stateDemographics").docs[1]).toEqual(settled);
});
it("rolls back an interrupted demographic batch before replaying the turn", async () => {
  const { db, memory } = world(true);
  const fault = withInjectedCrash(memory, {
    collection: "stateDemographics",
    op: "bulkWrite",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: db.client });
  await expect(processAllStateDemographics(fault.db, undefined, 100)).rejects.toThrow();
  expect(
    memory.collection("stateDemographics").docs.every((row) => !row.layer1TurnoutOverrides)
  ).toBe(true);
  fault.disarm();
  await processAllStateDemographics(db, undefined, 100);
  expect(memory.collection("stateDemographics").docs[1].layer1TurnoutOverrides).toBeDefined();
});
