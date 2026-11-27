import { expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { distributeConversionSpreadsBatch } from "./marketMaker";
import { runJournaledStep } from "@/lib/turn/corporation/resume/journal";
function setup() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("centralBanks", [
    { _id: "US", forexRevenue: 0 },
    { _id: "JP", spreadFeeReserveBalances: { USD: 0 } },
  ]);
  return {
    ...f,
    fees: [{ fee: 100, fromCurrency: "USD" as const, toCurrency: "JPY" as const }],
    key: { key: "corporation-operating-fx:100", turn: 100 },
  };
}
it("rolls back a partially distributed bank batch and its receipt, then applies the frozen fee once", async () => {
  const f = setup(),
    banks = f.memory.collection("centralBanks"),
    bulk = banks.bulkWrite.bind(banks);
  vi.spyOn(banks, "bulkWrite").mockImplementationOnce(async (ops) => {
    await bulk(ops.slice(0, 1));
    throw new Error("interrupted bank fee distribution");
  });
  await expect(distributeConversionSpreadsBatch(f.db, f.fees, f.key)).rejects.toThrow(
    "interrupted bank fee distribution"
  );
  expect(banks.docs[0].forexRevenue).toBe(0);
  expect(f.memory.collection("bankMoneyMoves").docs).toHaveLength(0);
  await Promise.all([0, 1].map(() => distributeConversionSpreadsBatch(f.db, f.fees, f.key)));
  expect(banks.docs[0].forexRevenue).toBe(25);
  expect(banks.docs[1].spreadFeeReserveBalances).toEqual({ USD: 50 });
  expect(f.memory.collection("bankMoneyMoves").docs).toHaveLength(1);
  await distributeConversionSpreadsBatch(f.db, [{ ...f.fees[0], fee: 1000 }], f.key);
  expect(banks.docs[0].forexRevenue).toBe(25);
});
it.each([0, 1, 2])(
  "resumes after fee delivery but before the phase completion marker at resilience stage %s",
  async (stage) => {
    const f = setup(),
      context = { db: f.db, stage, turn: 100 };
    await expect(
      runJournaledStep(context, "conversionSpreads", "rerun", async () => {
        await distributeConversionSpreadsBatch(f.db, f.fees, f.key);
        throw new Error("interrupted phase completion");
      })
    ).rejects.toThrow("interrupted phase completion");
    await runJournaledStep(context, "conversionSpreads", "rerun", () =>
      distributeConversionSpreadsBatch(f.db, f.fees, f.key)
    );
    expect(f.memory.collection("centralBanks").docs[0].forexRevenue).toBe(25);
    expect(f.memory.collection("centralBanks").docs[1].spreadFeeReserveBalances).toEqual({
      USD: 50,
    });
  }
);
