import { describe, expect, it } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { rewindHalfTick } from "./rewindHalfTick";
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("states", [
    {
      _id: "TX",
      gdp: 1100,
      outputGap: 0.4,
      subhourStep: { turn: 10, fraction: 0.5 },
      subhourBase: {
        growth: {
          turn: 10,
          gdp: { base: 1000, written: 1100 },
          outputGap: { base: 0.2, written: 0.4 },
        },
      },
    },
  ]);
  f.memory.seed("exchangeRates", [
    {
      _id: "CA",
      rate: 2,
      subhourStep: { turn: 10, fraction: 0.5 },
      subhourBase: { forex: { turn: 10, rate: { base: 1, written: 2 } } },
    },
  ]);
  return f;
}
describe("half-tick rewind publication", () => {
  it.each(["states", "exchangeRates"])(
    "a landed %s failure cannot leave a partial rewind",
    async (collection) => {
      const { db, memory } = fixture();
      const fault = withInjectedCrash(memory, {
        collection,
        op: "bulkWrite",
        onCall: 1,
        afterWrite: true,
      });
      await expect(rewindHalfTick(fault.db, 10)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect((await db.collection("states").findOne({}))?.gdp).toBe(1100);
      expect((await db.collection("exchangeRates").findOne({}))?.rate).toBe(2);
      await rewindHalfTick(db, 10);
      await rewindHalfTick(db, 10);
      expect((await db.collection("states").findOne({}))?.gdp).toBe(1000);
      expect((await db.collection("exchangeRates").findOne({}))?.rate).toBe(1);
    }
  );
  it("never clears a future tick or a future system baseline", async () => {
    const { db, memory } = fixture();
    memory.collection("states").docs[0].subhourStep = { turn: 11, fraction: 0.5 };
    memory.collection("exchangeRates").docs[0].subhourBase = {
      forex: { turn: 11, rate: { base: 1, written: 2 } },
    };
    const result = await rewindHalfTick(db, 10);
    expect(result.rewound.states).toBe(0);
    expect(result.rewound.exchangeRates).toBe(0);
    expect((await db.collection("states").findOne({}))?.subhourStep).toEqual({
      turn: 11,
      fraction: 0.5,
    });
    expect((await db.collection("exchangeRates").findOne({}))?.subhourBase).toBeDefined();
  });
});
