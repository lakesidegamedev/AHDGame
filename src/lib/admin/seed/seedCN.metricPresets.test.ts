import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb, bulkOps } from "@/lib/test-utils/mockDb";

type MetricSet = Record<string, Record<string, { value: number }>>;
type BaselineSet = { baselines: Record<string, Record<string, number>> };

function regionBaselineSet(db: MockDb, id: string): BaselineSet {
  const calls = db.collectionMocks.stateBaselines!.updateOne.mock.calls;
  const row = calls.find((c) => (c[0] as { _id: string })._id === id);
  return (row![1] as { $set: BaselineSet }).$set;
}

function regionMacroSet(db: MockDb, id: string): MetricSet {
  const calls = bulkOps(db.collectionMocks.macroMetrics!.bulkWrite);
  const row = calls.find((c) => (c[0] as { _id: string })._id === id);
  return (row![1] as { $set: MetricSet }).$set;
}

describe("seedCNStateMetrics — metric-preset overlay", () => {
  let db: MockDb;
  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
  });

  it("overlays CN-1991 authored values onto Huadong (property 45, debtToGdp 25)", async () => {
    const { seedCNStateMetrics } = await import("@/lib/admin/seed/seedCN");
    await seedCNStateMetrics(db as unknown as Db, true, () => {}, "1991-default");
    expect(regionMacroSet(db, "HD").economic.propertyValueIndex.value).toBe(45);
  });

  it("overlays CN-2019 authored values onto Huadong (property 200, debtToGdp 83)", async () => {
    const { seedCNStateMetrics } = await import("@/lib/admin/seed/seedCN");
    await seedCNStateMetrics(db as unknown as Db, true, () => {}, "2019-default");
    expect(regionMacroSet(db, "HD").economic.propertyValueIndex.value).toBe(200);
  });
});

describe("seedCNBaselines — metric-preset overlay (decay targets)", () => {
  let db: MockDb;
  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
  });

  it("aligns 1991 Huadong decay targets with the authored metric values", async () => {
    const { seedCNBaselines } = await import("@/lib/admin/seed/seedCN");
    await seedCNBaselines(db as unknown as Db, true, () => {}, "1991-default");
    const { baselines } = regionBaselineSet(db, "HD");
    expect(baselines.economic.propertyValueIndex).toBe(45);
    expect(baselines.governance.debtToGdp).toBe(25);
  });

  it("aligns 2019 Huadong decay targets with the authored 2019 values", async () => {
    const { seedCNBaselines } = await import("@/lib/admin/seed/seedCN");
    await seedCNBaselines(db as unknown as Db, true, () => {}, "2019-default");
    const { baselines } = regionBaselineSet(db, "HD");
    expect(baselines.economic.propertyValueIndex).toBe(200);
  });
});

describe("CN political baselines follow the authored eras", () => {
  it("resolves era-distinct national baselines for 1953, 1979 and 1991", async () => {
    // CN seeds its political board from year anchors, not the non-playable
    // board file. If an era's authored board stopped reaching the anchors,
    // two eras would collapse to the same numbers.
    const { baselineFor } = await import("@/lib/politicalMetrics/seeds/baselineAnchors");
    const families = ["economy.fiscal", "health.outcomes", "education.attainment"] as const;
    const years = [1953, 1979, 1991];
    const distinct = new Set(
      years.map((year) => families.map((f) => baselineFor("CN", f, year)).join("|"))
    );
    expect(distinct.size, "two eras resolved an identical board").toBe(years.length);
  });
});
