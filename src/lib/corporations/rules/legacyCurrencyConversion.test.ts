import { expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { legacyHistoryMoneyUpdate, legacyHistoryMoneyMapUpdate } from "./legacyCurrencyConversion";
it("converts losses, gains and signed tax adjustments at the same rate", async () => {
  const db = createInMemoryDb();
  db.seed("history", [
    { _id: "one", income: -100, revenue: 100, zero: 0, nullable: null, taxes: { US: 20, CA: -10 } },
  ]);
  await db.collection("history").updateOne({ _id: "one" }, [
    {
      $set: {
        ...legacyHistoryMoneyUpdate(["income", "revenue", "zero", "nullable"], 150),
        ...legacyHistoryMoneyMapUpdate(["taxes"], 150),
      },
    },
  ]);
  expect(db.collection("history").docs[0]).toMatchObject({
    income: -15000,
    revenue: 15000,
    zero: 0,
    nullable: null,
    taxes: { US: 3000, CA: -1500 },
  });
});
it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
  "refuses an invalid conversion rate %s",
  (rate) => {
    expect(() => legacyHistoryMoneyUpdate(["income"], rate)).toThrow();
    expect(() => legacyHistoryMoneyMapUpdate(["taxes"], rate)).toThrow();
  }
);
