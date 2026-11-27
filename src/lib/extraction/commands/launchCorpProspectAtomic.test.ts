import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { launchCorpProspect } from "./launchCorpProspect";
vi.mock("@/lib/era/context", () => ({ getEraContext: async () => ({ year: 2027 }) }));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn().mockResolvedValue(undefined) }));
it("restores cash after an interrupted survey insert and starts one survey under overlapping retries", async () => {
  const f = createTransactionalMemoryDb();
  const corp = {
    _id: new ObjectId(),
    type: "extraction",
    countryId: "US",
    liquidCurrencyCode: "USD",
    liquidCapital: 10_000_000,
  } as Corporation;
  f.memory.seed("corporations", [{ ...corp }]);
  f.memory.seed("corporateSectors", [
    {
      _id: new ObjectId(),
      corporationId: corp._id,
      stateId: "TX",
      countryId: "US",
      sectorType: "extraction",
    },
  ]);
  f.memory.seed("stateResourceCapacity", [
    { _id: "US:TX", countryId: "US", stateId: "TX", resources: { oil: 1000 } },
  ]);
  f.memory.seed("exchangeRates", [{ _id: "USD", currencyCode: "USD", rate: 1 }]);
  const collection = f.memory.collection("prospectingSurveys"),
    original = collection.insertOne.bind(collection);
  const insert = vi
    .spyOn(collection, "insertOne")
    .mockRejectedValueOnce(new Error("interrupted survey insert"));
  const run = () =>
    launchCorpProspect(f.db, corp, { stateId: "TX", resource: "oil" }, 100, new Date(0));
  await expect(run()).rejects.toThrow("interrupted survey insert");
  expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(10_000_000);
  expect(collection.docs).toHaveLength(0);
  insert.mockImplementation(original);
  const results = await Promise.all([run(), run()]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(collection.docs).toHaveLength(1);
  const success = results.find((r) => r.ok);
  if (!success?.ok) throw new Error("Missing survey");
  expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(
    10_000_000 - success.costs.costLocal
  );
});
