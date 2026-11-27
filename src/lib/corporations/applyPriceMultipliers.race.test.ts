import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { applyPriceMultipliers } from "./applyPriceMultipliers";
const corporationId = new ObjectId();
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("corporations", [
    {
      _id: corporationId,
      countryId: "US",
      type: "energy",
      fundamentalSharePrice: 100,
      sharePrice: 100,
      publicFloat: 1000,
      totalShares: 10000,
      orderFlowMultiplier: 1,
      orderFlowWindowBuyValue: 100,
      orderFlowWindowSellValue: 40,
    },
  ]);
  return f;
}
describe("price window publication", () => {
  it("preserves trade flow arriving after the priced snapshot", async () => {
    const { db, memory } = fixture();
    const corps = memory.collection("corporations"),
      bulk = corps.bulkWrite.bind(corps);
    vi.spyOn(corps, "bulkWrite").mockImplementationOnce(async (ops) => {
      await corps.updateOne(
        { _id: corporationId },
        { $inc: { orderFlowWindowBuyValue: 50, orderFlowWindowSellValue: 20 } }
      );
      return bulk(ops);
    });
    expect((await applyPriceMultipliers(db)).updated).toBe(1);
    expect(await db.collection("corporations").findOne({})).toMatchObject({
      orderFlowWindowBuyValue: 50,
      orderFlowWindowSellValue: 20,
      priceMultiplierRevision: 1,
    });
  });
  it("does not consume flow against a changed fundamental or share structure", async () => {
    const { db, memory } = fixture();
    const corps = memory.collection("corporations"),
      bulk = corps.bulkWrite.bind(corps);
    vi.spyOn(corps, "bulkWrite").mockImplementationOnce(async (ops) => {
      await corps.updateOne(
        { _id: corporationId },
        { $set: { fundamentalSharePrice: 200, totalShares: 20000 } }
      );
      return bulk(ops);
    });
    expect((await applyPriceMultipliers(db)).updated).toBe(0);
    expect(await db.collection("corporations").findOne({})).toMatchObject({
      sharePrice: 100,
      orderFlowWindowBuyValue: 100,
      orderFlowWindowSellValue: 40,
    });
  });
  it("overlapping passes cannot consume the same snapshot twice, even when price stays unchanged", async () => {
    const { db, memory } = fixture();
    const corps = memory.collection("corporations"),
      bulk = corps.bulkWrite.bind(corps);
    await corps.updateOne({}, { $set: { publicFloat: 0 } });
    let arrivals = 0,
      release = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(corps, "bulkWrite").mockImplementation(async (ops) => {
      if (++arrivals === 2) release();
      await barrier;
      return bulk(ops);
    });
    const replies = await Promise.all([applyPriceMultipliers(db), applyPriceMultipliers(db)]);
    expect(replies.reduce((sum, r) => sum + r.updated, 0)).toBe(1);
    expect(await db.collection("corporations").findOne({})).toMatchObject({
      sharePrice: 100,
      priceMultiplierRevision: 1,
      orderFlowWindowBuyValue: 0,
      orderFlowWindowSellValue: 0,
    });
  });
});
