import { CORPORATION_TYPES } from "@/lib/constants/corporations";
import { describe, expect, it } from "vitest";
import {
  constantPriceOutput,
  sumObservedOutput,
  blendOutputGrowthSignal,
  outputHistorySpanTurns,
  intermediateShare,
  valueAddedOutput,
  outputVolumeOnBasis,
  resolveOutputBasis,
} from "./outputVolume";

describe("constant-price production", () => {
  it.each(CORPORATION_TYPES)("supports the canonical production basket for %s", (sectorType) => {
    const value = constantPriceOutput({ sectorType, producedUnits: 100 }, 48);
    expect(value).not.toBeNull();
    expect(value).toBeGreaterThan(0);
    expect(constantPriceOutput({ sectorType, producedUnits: 50 }, 48)).toBeCloseTo(value! / 2);
  });

  it("values physical quantities without income, market prices or currency inputs", () => {
    const base = { sectorType: "manufacturing" as const, producedUnits: 100 };
    const value = constantPriceOutput(base, 48)!;
    expect(value).toBeGreaterThan(0);
    expect(constantPriceOutput({ ...base, producedUnits: 95 }, 48)).toBeCloseTo(value * 0.95);
    expect(constantPriceOutput({ ...base, producedUnits: 0 }, 48)).toBe(0);
  });

  it("keeps constant-price output equal for the vehicles lane and the vehicle-model row", () => {
    const legacy = {
      sectorType: "manufacturing_vehicles",
      producedUnits: 100,
      strategyId: "ev",
    } as const;
    const modeled = {
      ...legacy,
      sectorType: "manufacturing",
      industryModel: "vehicles",
    } as const;
    expect(constantPriceOutput(modeled, 48)).toBe(constantPriceOutput(legacy, 48));
  });

  it("keeps canonical entertainment media on the entertainment lane volume basis", () => {
    const legacy = { sectorType: "media_entertainment" as const, producedUnits: 100 };
    const canonical = {
      sectorType: "media" as const,
      mediaDiscriminator: "entertainment" as const,
      producedUnits: 100,
    };
    expect(constantPriceOutput(canonical, 48)).toBe(constantPriceOutput(legacy, 48));
  });

  it.each([undefined, NaN, Infinity, -1])("rejects missing or invalid production %s", (units) => {
    expect(
      constantPriceOutput({ sectorType: "manufacturing", producedUnits: units }, 48)
    ).toBeNull();
  });

  it("requires a complete observation but accepts an observed shutdown", () => {
    expect(sumObservedOutput([])).toBeNull();
    expect(sumObservedOutput([{ outputVolume: 100 }, {}])).toBeNull();
    expect(sumObservedOutput([{ outputVolume: 100 }, { outputVolume: NaN }])).toBeNull();
    expect(sumObservedOutput([{ outputVolume: 100 }, { outputVolume: 0 }])).toBe(100);
    expect(sumObservedOutput([{ outputVolume: 0 }])).toBe(0);
  });
});

describe("physical measurement transition", () => {
  it("ends the handoff permanently despite nearest-year baseline oscillation", () => {
    const snapshots = Array.from({ length: 7 }, (_, index) => ({ turn: index * 8, value: 100 }));
    for (let turn = 48; turn < 56; turn++) {
      expect(blendOutputGrowthSignal(10, 0, outputHistorySpanTurns(snapshots, turn))).toBe(0);
    }
  });

  it("bridges both inflated and deflated prior signals without overriding output afterward", () => {
    for (const prior of [-10, 15]) {
      expect(blendOutputGrowthSignal(prior, 0, 8)).toBe(prior);
      expect(blendOutputGrowthSignal(prior, 0, 28)).toBe(prior / 2);
      expect(blendOutputGrowthSignal(prior, -5, 48)).toBe(-5);
      expect(blendOutputGrowthSignal(prior, null, 48)).toBe(prior);
    }
  });
});

describe("value added versus gross output", () => {
  type Sector = Parameters<typeof constantPriceOutput>[0];
  const LANES = [
    "energy",
    "manufacturing",
    "retail",
    "technology",
    "financial",
  ] as const satisfies readonly Sector["sectorType"][];
  // Units that make every lane produce 100 of gross output at the basket.
  const unitsFor = (sectorType: Sector["sectorType"], gross: number): number =>
    gross / constantPriceOutput({ sectorType, producedUnits: 1 }, 48)!;
  const region = (gross: Partial<Record<(typeof LANES)[number], number>>): Sector[] =>
    LANES.map((sectorType) => ({
      sectorType,
      producedUnits: unitsFor(sectorType, gross[sectorType] ?? 100),
    }));
  const total = (sectors: Sector[], f: typeof constantPriceOutput) =>
    sectors.reduce((sum, s) => sum + (f(s, 48) ?? 0), 0);
  const growthPct = (before: Sector[], after: Sector[], f: typeof constantPriceOutput) =>
    (total(after, f) / total(before, f) - 1) * 100;

  it("subtracts the inputs a production method buys", () => {
    for (const sectorType of LANES) {
      const s = { sectorType, producedUnits: unitsFor(sectorType, 100) };
      const share = intermediateShare(s, 48);
      expect(share).toBeGreaterThan(0.3);
      expect(share).toBeLessThan(0.8);
      expect(valueAddedOutput(s, 48)!).toBeCloseTo(100 * (1 - share), 6);
    }
  });

  it("reconciles a hand-worked chain: only the last stage's value added is new output", () => {
    // Ore 100 (no inputs) -> steel 150 (uses 100 ore) -> cars 300 (uses 150 steel).
    // Gross output sums to 550; value added is 100 + 50 + 150 = 300 = final cars.
    const stages = [
      { gross: 100, inputs: 0 },
      { gross: 150, inputs: 100 },
      { gross: 300, inputs: 150 },
    ];
    expect(stages.reduce((s, x) => s + x.gross, 0)).toBe(550);
    expect(stages.reduce((s, x) => s + (x.gross - x.inputs), 0)).toBe(300);
  });

  it("matches gross output growth when every lane grows together", () => {
    const before = region({});
    const after = region({
      energy: 103,
      manufacturing: 103,
      retail: 103,
      technology: 103,
      financial: 103,
    });
    expect(growthPct(before, after, constantPriceOutput)).toBeCloseTo(3, 6);
    expect(growthPct(before, after, valueAddedOutput)).toBeCloseTo(3, 6);
  });

  it("weights lanes by what they add, not what they churn", () => {
    const before = region({});
    const techUp = region({ technology: 110 });
    const retailUp = region({ retail: 110 });
    const gross = (a: Sector[]) => growthPct(before, a, constantPriceOutput);
    const added = (a: Sector[]) => growthPct(before, a, valueAddedOutput);
    // Same gross lift, but technology keeps more of its output than retail.
    expect(gross(techUp)).toBeCloseTo(gross(retailUp), 6);
    expect(added(techUp)).toBeGreaterThan(added(retailUp) * 2);
    // Recorded comparison (percent growth, current -> corrected).
    expect([gross(techUp), added(techUp)].map((x) => +x.toFixed(2))).toEqual([2, 2.86]);
    expect([gross(retailUp), added(retailUp)].map((x) => +x.toFixed(2))).toEqual([2, 1.24]);
  });

  it("counts unsold output as production and ignores price-only changes", () => {
    const s = { sectorType: "manufacturing" as const, producedUnits: 100 };
    // Units produced but unsold go to inventory: soldUnits is not an input here.
    expect(valueAddedOutput({ ...s, ...{ soldUnits: 10 } }, 48)).toBe(valueAddedOutput(s, 48));
    // No price argument exists on the basis: price-only changes cannot move it.
    expect(valueAddedOutput(s, 48)).toBe(valueAddedOutput({ ...s }, 49));
  });
});

describe("output basis marker", () => {
  const sector = { sectorType: "retail" as const, producedUnits: 100 };

  it("reads only an explicit value_added marker as value added", () => {
    expect(resolveOutputBasis("value_added")).toBe("value_added");
    expect(resolveOutputBasis("gross")).toBe("gross");
    expect(resolveOutputBasis(undefined)).toBe("gross");
    expect(resolveOutputBasis("VALUE_ADDED")).toBe("gross");
    expect(resolveOutputBasis(1)).toBe("gross");
  });

  it("leaves the legacy basis byte for byte equal to gross output", () => {
    for (const sectorType of CORPORATION_TYPES) {
      const s = { sectorType, producedUnits: 137 };
      expect(outputVolumeOnBasis(s, 48, resolveOutputBasis(undefined))).toBe(
        constantPriceOutput(s, 48)
      );
    }
  });

  it("measures a fresh world on value added", () => {
    const gross = constantPriceOutput(sector, 48)!;
    const added = outputVolumeOnBasis(sector, 48, "value_added")!;
    expect(added).toBe(valueAddedOutput(sector, 48));
    expect(added).toBeLessThan(gross);
  });

  it("returns null when production is unobserved on either basis", () => {
    const missing = { sectorType: "retail" as const };
    expect(outputVolumeOnBasis(missing, 48, "gross")).toBeNull();
    expect(outputVolumeOnBasis(missing, 48, "value_added")).toBeNull();
  });

  it("gives different growth on the two bases for uneven lane growth", () => {
    const mk = (tech: number, retail: number) => [
      { sectorType: "technology" as const, producedUnits: tech },
      { sectorType: "retail" as const, producedUnits: retail },
    ];
    const total = (rows: ReturnType<typeof mk>, basis: "gross" | "value_added") =>
      rows.reduce((sum, row) => sum + outputVolumeOnBasis(row, 48, basis)!, 0);
    const before = mk(100, 100);
    const after = mk(120, 100);
    const growth = (basis: "gross" | "value_added") =>
      (total(after, basis) / total(before, basis) - 1) * 100;
    expect(growth("value_added")).not.toBeCloseTo(growth("gross"), 3);
    // Uniform growth is basis independent.
    const uniform = mk(103, 103);
    expect(total(uniform, "gross") / total(before, "gross")).toBeCloseTo(
      total(uniform, "value_added") / total(before, "value_added"),
      9
    );
  });
});
