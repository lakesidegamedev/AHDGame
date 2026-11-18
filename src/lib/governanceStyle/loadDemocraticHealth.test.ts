import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { POLITICAL_METRIC_FAMILIES } from "@/lib/politicalMetrics/families";
import type { PoliticalMetricId } from "@/lib/politicalMetrics/types";
import { loadDemocraticHealth } from "./loadDemocraticHealth";

const resetHealth = vi.hoisted(() => ({
  read: vi.fn(async () => ({ status: "not_v2" }) as unknown),
}));
vi.mock("@/lib/resetMetrics/readDemocraticHealth", () => ({
  readResetDemocraticHealth: resetHealth.read,
}));

function values(overrides: Partial<Record<PoliticalMetricId, number>> = {}) {
  return Object.fromEntries(
    POLITICAL_METRIC_FAMILIES.map((family) => [family.id, overrides[family.id] ?? 70])
  ) as Record<PoliticalMetricId, number>;
}

describe("loadDemocraticHealth", () => {
  beforeEach(() => {
    resetHealth.read.mockReset();
    resetHealth.read.mockResolvedValue({ status: "not_v2" });
  });

  it("uses the v2 score for a v2 country, never its decaying political board", async () => {
    resetHealth.read.mockResolvedValue({ status: "ready", value: 54.5 });
    const db: MockDb = createMockDb();
    db.collection("politicalMetrics")
      .find()
      .toArray.mockResolvedValue([{ _id: "A", countryId: "US", values: values({}) }]);
    expect(await loadDemocraticHealth(db as unknown as Db, "US", null)).toBe(54.5);
  });

  it("is neutral when a v2 country's board cannot be read", async () => {
    resetHealth.read.mockResolvedValue({ status: "unavailable" });
    const db: MockDb = createMockDb();
    db.collection("politicalMetrics")
      .find()
      .toArray.mockResolvedValue([{ _id: "A", countryId: "US", values: values({}) }]);
    expect(await loadDemocraticHealth(db as unknown as Db, "US", null)).toBeNull();
  });

  it("returns the population-weighted Governance Style health score", async () => {
    const db: MockDb = createMockDb();
    db.collection("politicalMetrics")
      .find()
      .toArray.mockResolvedValue([
        { _id: "A", countryId: "US", values: values() },
        { _id: "B", countryId: "US", values: values({ "order.courts": 50 }) },
      ]);
    db.collection("states")
      .find()
      .toArray.mockResolvedValue([
        { _id: "A", population: 3_000_000 },
        { _id: "B", population: 1_000_000 },
      ]);

    const health = await loadDemocraticHealth(db as unknown as Db, "US", {
      preset: "1953-default",
      presidentialTenureByCountry: {},
    });

    expect(health).toBeCloseTo(69.5, 1);
  });

  it("returns null when no political-metrics board exists", async () => {
    const db: MockDb = createMockDb();
    const health = await loadDemocraticHealth(db as unknown as Db, "US", null);
    expect(health).toBeNull();
  });
});
