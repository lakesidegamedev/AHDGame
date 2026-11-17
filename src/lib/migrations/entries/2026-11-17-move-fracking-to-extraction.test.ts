import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import {
  conventionalPatch,
  legacyToConventionalRatio,
  migration,
} from "./2026-11-17-move-fracking-to-extraction";
import { MIGRATIONS } from "../registry";
import { REQUIRED_STARTUP_MIGRATIONS } from "../startupMigrations";
import { SECTOR_STRATEGIES, getStrategy } from "@/lib/constants/sectorStrategies";
import { TECH_TREE } from "@/lib/constants/techTree/nodes";

interface TechNodeLike {
  effects: { kind: string; strategyId?: string }[];
}

describe("fracking moved from energy to extraction", () => {
  it("no energy method supplies oil or natural gas, and fracking is not an energy method", () => {
    const energy = SECTOR_STRATEGIES.energy;
    expect(energy.map((s) => s.id)).not.toContain("fracking");
    for (const s of energy) {
      expect(s.supply.oil ?? 0, s.id).toBe(0);
      expect(s.supply.natural_gas ?? 0, s.id).toBe(0);
    }
  });

  it("extraction offers Hydraulic Fracturing, tech gated, out-earning Oil & Gas", () => {
    const frack = getStrategy("extraction", "hydraulic_fracturing");
    const oilGas = getStrategy("extraction", "oil_gas");
    expect(frack.id).toBe("hydraulic_fracturing");
    expect(frack.requiresTechUnlock).toBe(true);
    expect(Object.keys(frack.supply).sort()).toEqual(["natural_gas", "oil"]);
    const total = (r: Record<string, number | undefined>) =>
      Object.values(r).reduce<number>((a, b) => a + (b ?? 0), 0);
    expect(total(frack.supply)).toBeGreaterThan(total(oilGas.supply));
    expect(total(frack.supply) - total(frack.demand)).toBeGreaterThan(
      total(oilGas.supply) - total(oilGas.demand)
    );
  });

  it("the research that unlocks it sits in the extraction tree and nothing unlocks fracking", () => {
    const unlocks = (sector: string): string[] => {
      const nodes = (TECH_TREE as unknown as Record<string, TechNodeLike[] | undefined>)[sector];
      return (nodes ?? [])
        .flatMap((n) => n.effects)
        .filter((e) => e.kind === "unlockStrategy")
        .map((e) => e.strategyId ?? "");
    };
    expect(unlocks("extraction")).toContain("hydraulic_fracturing");
    expect(unlocks("energy")).not.toContain("fracking");
    expect(unlocks("energy")).not.toContain("hydraulic_fracturing");
  });

  it("runs at boot and is registered", () => {
    expect(MIGRATIONS).toContain(migration);
    expect(REQUIRED_STARTUP_MIGRATIONS).toContain(migration);
    expect(migration.idempotent).toBe(true);
  });

  it("returns a sector to Conventional with the same nameplate and no open transition", () => {
    const ratio = legacyToConventionalRatio();
    const id = new ObjectId();
    const patch = conventionalPatch(
      {
        _id: id,
        corporationId: new ObjectId(),
        sectorType: "energy",
        capitalStock: 500,
        retoolRescaleApplied: true,
        otherOpexPerUnitAnchor: 10,
        buildQueue: [
          { unitsOrdered: 100, strategyId: "fracking" },
          { unitsOrdered: 50, strategyId: null },
        ],
      },
      ratio
    ) as { $set: Record<string, unknown>; $unset: Record<string, unknown> };
    expect(patch.$set.strategyId).toBe("standard");
    expect(patch.$set.capitalStock).toBeCloseTo(500 * ratio, 9);
    expect(patch.$set.otherOpexPerUnitAnchor).toBeCloseTo(10 / ratio, 9);
    const queue = patch.$set.buildQueue as Array<{ unitsOrdered: number; strategyId: unknown }>;
    expect(queue[0]).toMatchObject({ strategyId: "standard" });
    expect(queue[0].unitsOrdered).toBeCloseTo(100 * ratio, 9);
    expect(queue[1].strategyId).toBeNull();
    expect(Object.keys(patch.$unset)).toEqual(
      expect.arrayContaining(["transitionFromStrategyId", "transitionStartTurn"])
    );
  });

  it("leaves stock alone when the retool never rescaled it", () => {
    const patch = conventionalPatch(
      { _id: new ObjectId(), corporationId: new ObjectId(), capitalStock: 500 },
      legacyToConventionalRatio()
    ) as { $set: Record<string, unknown> };
    expect(patch.$set.capitalStock).toBeUndefined();
  });
});
