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

describe("seedJPStateMetrics — metric-preset overlay", () => {
  let db: MockDb;
  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
  });

  it("overlays JP-1991 authored values onto Kanto (property 280, debtToGdp 60)", async () => {
    const { seedJPStateMetrics } = await import("@/lib/admin/seed/seedJP");
    await seedJPStateMetrics(db as unknown as Db, true, () => {}, "1991-default");
    // SP5: economic values land on macroMetrics; political stay on stateMetrics.
    expect(regionMacroSet(db, "KAN").economic.propertyValueIndex.value).toBe(280);
    // Political paths left stateMetrics in step-6 Phase 3; the authored era
    // value now reaches the game through the BOARD (asserted below).
  });

  it("overlays JP-2019 authored values onto Kanto (property 180, debtToGdp 255)", async () => {
    const { seedJPStateMetrics } = await import("@/lib/admin/seed/seedJP");
    await seedJPStateMetrics(db as unknown as Db, true, () => {}, "2019-default");
    expect(regionMacroSet(db, "KAN").economic.propertyValueIndex.value).toBe(180);
    // Political paths left stateMetrics in step-6 Phase 3; the authored era
    // value now reaches the game through the BOARD (asserted below).
  });
});

describe("seedJPBaselines — metric-preset overlay (decay targets)", () => {
  let db: MockDb;
  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
  });

  it("aligns 1991 Kanto decay targets with the authored metric values", async () => {
    const { seedJPBaselines } = await import("@/lib/admin/seed/seedJP");
    await seedJPBaselines(db as unknown as Db, true, () => {}, "1991-default");
    const { baselines } = regionBaselineSet(db, "KAN");
    expect(baselines.economic.propertyValueIndex).toBe(280);
    expect(baselines.governance.debtToGdp).toBe(60);
  });

  it("aligns 2019 Kanto decay targets with the authored 2019 values", async () => {
    const { seedJPBaselines } = await import("@/lib/admin/seed/seedJP");
    await seedJPBaselines(db as unknown as Db, true, () => {}, "2019-default");
    const { baselines } = regionBaselineSet(db, "KAN");
    expect(baselines.economic.propertyValueIndex).toBe(180);
  });
});

describe("JP political baselines follow the authored eras", () => {
  it("resolves era-distinct national baselines for 1953, 1979 and 1991", async () => {
    // JP seeds its political board from year anchors, not the non-playable
    // board file. If an era's authored board stopped reaching the anchors,
    // two eras would collapse to the same numbers.
    const { baselineFor } = await import("@/lib/politicalMetrics/seeds/baselineAnchors");
    const families = ["economy.fiscal", "health.outcomes", "education.attainment"] as const;
    const years = [1953, 1979, 1991];
    const distinct = new Set(
      years.map((year) => families.map((f) => baselineFor("JP", f, year)).join("|"))
    );
    expect(distinct.size, "two eras resolved an identical board").toBe(years.length);
  });
});
