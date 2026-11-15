import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";

vi.mock("@/lib/currency/corporationCapital", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/currency/corporationCapital")>()),
  getCurrencyFxRate: vi.fn().mockResolvedValue(1),
}));

import { creditTreasuryProceedsFromAnchor } from "./treasury";

describe("creditTreasuryProceedsFromAnchor with a once key", () => {
  it("credits the treasury a single time however often the same key is replayed", async () => {
    const memory = createInMemoryDb();
    memory.seed("federalBudget", [{ countryId: "US", currencyCode: "USD", treasuryBalance: 100 }]);
    const db = memory as unknown as Db;
    const now = new Date("2026-11-08T00:00:00Z");

    await creditTreasuryProceedsFromAnchor(db, "US", 250, now, {
      flow: "nationalization_compensation",
      onceKey: "abc_10",
    });
    await creditTreasuryProceedsFromAnchor(db, "US", 250, now, {
      flow: "nationalization_compensation",
      onceKey: "abc_10",
    });
    await creditTreasuryProceedsFromAnchor(db, "US", 70, now, {
      flow: "nationalization_compensation",
      onceKey: "def_11",
    });

    const budget = await memory.collection("federalBudget").findOne({ countryId: "US" });
    expect(budget?.treasuryBalance).toBe(420);
  });
});
