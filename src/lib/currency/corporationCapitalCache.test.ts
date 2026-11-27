import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { loadFxRatesByCurrency, resetCorpFxRateCacheForTests } from "./corporationCapital";
describe("FX cache authority boundaries", () => {
  beforeEach(resetCorpFxRateCacheForTests);
  const fixture = (rate: number) => {
    const f = createTransactionalMemoryDb();
    f.memory.seed("gameState", [{ _id: "current", worldEpochId: "first-world" }]);
    f.memory.seed("exchangeRates", [{ _id: "USD", currencyCode: "USD", rate }]);
    return f;
  };
  it("never shares quotes or in-flight loads across supplied databases", async () => {
    const a = fixture(1),
      b = fixture(100);
    const [first, second] = await Promise.all([
      loadFxRatesByCurrency(a.db),
      loadFxRatesByCurrency(b.db),
    ]);
    expect(first.get("USD")).toBe(1);
    expect(second.get("USD")).toBe(100);
  });
  it("reloads immediately after a world reset even inside the cache lifetime", async () => {
    const f = fixture(1);
    expect((await loadFxRatesByCurrency(f.db)).get("USD")).toBe(1);
    await f.memory
      .collection("gameState")
      .updateOne({ _id: "current" }, { $set: { worldEpochId: "second-world" } });
    await f.memory.collection("exchangeRates").updateOne({ _id: "USD" }, { $set: { rate: 100 } });
    expect((await loadFxRatesByCurrency(f.db)).get("USD")).toBe(100);
  });
  it("deduplicates same-world quote scans and protects cached maps from caller mutation", async () => {
    const f = fixture(1);
    const scan = vi.spyOn(f.memory.collection("exchangeRates"), "find");
    const maps = await Promise.all([loadFxRatesByCurrency(f.db), loadFxRatesByCurrency(f.db)]);
    maps[0].set("USD", 99);
    expect((await loadFxRatesByCurrency(f.db)).get("USD")).toBe(1);
    expect(scan).toHaveBeenCalledTimes(1);
  });
});
