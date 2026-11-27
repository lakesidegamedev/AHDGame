import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { migration } from "./2026-11-16-split-renewables-power-method";
import { MIGRATIONS } from "../registry";
import { REQUIRED_STARTUP_MIGRATIONS } from "../startupMigrations";
import { SECTOR_STRATEGIES } from "@/lib/constants/sectorStrategies";

vi.mock("@/lib/db/sessionDb", async () =>
  (await import("@/lib/test-utils/atomicDomainMock")).atomicDomainMock()
);

interface Call {
  collection: string;
  op: string;
  args: unknown[];
}

function fakeDb(subsidies: Array<Record<string, unknown>>, counts: Record<string, number>) {
  const calls: Call[] = [];
  const db = {
    collection: (name: string) => ({
      countDocuments: async (filter: unknown) => {
        calls.push({ collection: name, op: "count", args: [filter] });
        return counts[name] ?? 0;
      },
      updateMany: async (...args: unknown[]) => {
        calls.push({ collection: name, op: "updateMany", args });
        return { modifiedCount: counts[name] ?? 0 };
      },
      findOne: async (filter: Record<string, unknown>) =>
        subsidies.find((row) => row._id === filter._id) ?? null,
      find: () => ({ toArray: async () => (name === "subsidies" ? subsidies : []) }),
      updateOne: async (...args: unknown[]) => {
        calls.push({ collection: name, op: "updateOne", args });
        return { modifiedCount: 1 };
      },
      insertOne: async (...args: unknown[]) => {
        calls.push({ collection: name, op: "insertOne", args });
        return { acknowledged: true };
      },
    }),
  } as unknown as Db;
  return { db, calls };
}

describe("2026-11-16-split-renewables-power-method", () => {
  it("runs at boot, is registered, and is safe to repeat", () => {
    expect(MIGRATIONS).toContain(migration);
    expect(REQUIRED_STARTUP_MIGRATIONS).toContain(migration);
    expect(migration.idempotent).toBe(true);
  });

  it("leaves no energy method named renewables and defines both halves", () => {
    const ids = SECTOR_STRATEGIES.energy.map((s) => s.id);
    expect(ids).not.toContain("renewables");
    expect(ids).toEqual(expect.arrayContaining(["wind", "solar", "hydroelectric", "gas_fired"]));
  });

  it("moves sectors to wind and keeps a renewables subsidy covering wind and solar", async () => {
    const { db, calls } = fakeDb(
      [{ _id: "sub1", targetStrategyId: "renewables", rate: 0.1, countryId: "US" }],
      { corporateSectors: 2, bills: 1, stateBills: 0 }
    );
    const result = await migration.execute(db, { dryRun: false });

    const sectorWrites = calls.filter(
      (c) => c.collection === "corporateSectors" && c.op === "updateMany"
    );
    expect(sectorWrites.map((c) => c.args[1])).toEqual([
      { $set: { strategyId: "wind" } },
      { $set: { transitionFromStrategyId: "wind" } },
      { $set: { "parentDirectedStrategy.strategyId": "wind" } },
      { $set: { "buildQueue.$[order].strategyId": "wind" } },
    ]);
    for (const write of sectorWrites) expect(JSON.stringify(write.args[0])).toContain("renewables");

    const retarget = calls.find((c) => c.collection === "subsidies" && c.op === "updateOne");
    expect(retarget?.args).toEqual([
      { _id: "sub1", targetStrategyId: "renewables" },
      { $set: { targetStrategyId: "wind" } },
    ]);
    const copy = calls.find((c) => c.collection === "subsidies" && c.op === "insertOne");
    expect(copy?.args[0]).toEqual({ targetStrategyId: "solar", rate: 0.1, countryId: "US" });

    const billWrite = calls.find((c) => c.collection === "bills" && c.op === "updateMany");
    expect(billWrite?.args[1]).toEqual({ $set: { "provisions.$[p].targetStrategyId": "wind" } });
    expect(result.documentsUpdated).toBeGreaterThan(0);
  });

  it("writes nothing on a dry run", async () => {
    const { db, calls } = fakeDb([{ _id: "sub1", targetStrategyId: "renewables" }], {
      corporateSectors: 3,
    });
    const result = await migration.execute(db, { dryRun: true });
    expect(calls.filter((c) => c.op !== "count")).toEqual([]);
    expect(result.documentsUpdated).toBe(0);
    expect(result.documentsScanned).toBeGreaterThan(0);
  });
});
