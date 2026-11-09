import { describe, expect, it } from "vitest";
import {
  SHORTAGE_GROWTH_FINANCE_CONTRIBUTION_SHARE,
  SHORTAGE_GROWTH_FINANCE_DEFAULTS,
  boundShortageGrowthFinanceCandidates,
  evaluateShortageGrowthFinance,
  resolveShortageGrowthFinanceConfig,
  sectorBookPressure,
  shortageGrowthCashContributionLimit,
  shortageGrowthFinanceUnits,
  sizeShortageGrowthFinance,
  type ShortageGrowthFinanceCandidateFacts,
} from "./shortageGrowthFinance";

const config = resolveShortageGrowthFinanceConfig({ nppShortageGrowthFinanceStage: 1 })!;

describe("resolveShortageGrowthFinanceConfig", () => {
  it("is off at stage 0 or absent", () => {
    expect(resolveShortageGrowthFinanceConfig(null)).toBeNull();
    expect(resolveShortageGrowthFinanceConfig({})).toBeNull();
    expect(resolveShortageGrowthFinanceConfig({ nppShortageGrowthFinanceStage: 0 })).toBeNull();
  });

  it("uses defaults and accepts positive overrides only", () => {
    expect(config).toEqual(SHORTAGE_GROWTH_FINANCE_DEFAULTS);
    expect(
      resolveShortageGrowthFinanceConfig({
        nppShortageGrowthFinanceStage: 1,
        nppShortageGrowthFinanceCandidateLimit: 256.7,
        nppShortageGrowthFinanceMaxPaybackTurns: -5,
        nppShortageGrowthFinanceMaxExposureProfitTurns: 12,
      })
    ).toEqual({ candidateLimit: 256, maxPaybackTurns: 100, maxExposureProfitTurns: 12 });
  });
});

describe("evaluateShortageGrowthFinance", () => {
  // 100 units earn 500 a turn: 5 a unit. A unit costs 400, so payback is 80 turns.
  const base = {
    config,
    pressure: 1.6,
    sectorProfitLocal: 500,
    operatingCapacityUnits: 100,
    perUnitBuildCostLocal: 400,
  };

  it("finances a short, profitable lane that pays back in time", () => {
    expect(evaluateShortageGrowthFinance(base)).toEqual({
      eligible: true,
      pressure: 1.6,
      paybackTurns: 80,
    });
  });

  it("refuses a lane that is not short", () => {
    expect(evaluateShortageGrowthFinance({ ...base, pressure: 1.2 })).toEqual({
      eligible: false,
      reason: "not_short",
    });
    expect(evaluateShortageGrowthFinance({ ...base, pressure: undefined })).toMatchObject({
      reason: "not_short",
    });
  });

  it("accepts the threshold: buyers got exactly 75% of what they ordered", () => {
    expect(evaluateShortageGrowthFinance({ ...base, pressure: 1.33 }).eligible).toBe(true);
  });

  it("refuses an unprofitable plant", () => {
    expect(evaluateShortageGrowthFinance({ ...base, sectorProfitLocal: 0 })).toMatchObject({
      reason: "unprofitable",
    });
    expect(evaluateShortageGrowthFinance({ ...base, sectorProfitLocal: -10 })).toMatchObject({
      reason: "unprofitable",
    });
  });

  it("refuses a long payback", () => {
    // 600 a unit at 5 a turn: 120 turns.
    expect(evaluateShortageGrowthFinance({ ...base, perUnitBuildCostLocal: 600 })).toMatchObject({
      reason: "payback_too_long",
    });
  });

  it("refuses an unpriced build", () => {
    expect(evaluateShortageGrowthFinance({ ...base, perUnitBuildCostLocal: 0 })).toMatchObject({
      reason: "unpriced",
    });
  });
});

describe("sectorBookPressure", () => {
  const books = new Map([
    ["food|world", 1.8],
    ["retail|US", 1.1],
  ]);
  it("reads the lane the plant delivered most of, in this world", () => {
    const receipt = {
      worldEpoch: "e1",
      products: [
        { commodity: "food", book: "world", deliveredUnits: 30 },
        { commodity: "retail", book: "US", deliveredUnits: 5 },
      ],
    };
    expect(sectorBookPressure(receipt, "e1", books)).toBe(1.8);
    expect(sectorBookPressure(receipt, "e2", books)).toBeUndefined();
    expect(sectorBookPressure(undefined, "e1", books)).toBeUndefined();
  });
});

describe("sizing and cash share", () => {
  const units = (cashSizedUnits: number, contributionLimitLocal: number) =>
    shortageGrowthFinanceUnits({
      cashSizedUnits,
      stepCapUnits: 40,
      perUnitCostLocal: 100,
      contributionLimitLocal,
    });

  it("requests one growth step when the cash share carries it", () => {
    expect(units(0, 1_000_000)).toBe(40);
  });

  it("shrinks the step to what the cash share can carry", () => {
    // 1,000 x 0.9 slack / 0.2575 share / 100 a unit = 34.9 units.
    expect(SHORTAGE_GROWTH_FINANCE_CONTRIBUTION_SHARE).toBeCloseTo(0.2575, 6);
    expect(units(0, 1_000)).toBe(34);
    expect(units(0, 0)).toBe(0);
  });

  it("never sizes below what cash already covers", () => {
    expect(units(55, 0)).toBe(55);
  });

  it("lets cash below the floor contribute up to a quarter of what is held", () => {
    expect(shortageGrowthCashContributionLimit(100_000, 150_000)).toBe(25_000);
    expect(shortageGrowthCashContributionLimit(200_000, 150_000)).toBe(50_000);
    expect(shortageGrowthCashContributionLimit(400_000, 150_000)).toBe(250_000);
    expect(shortageGrowthCashContributionLimit(0, 150_000)).toBe(0);
    expect(shortageGrowthCashContributionLimit(-5, 150_000)).toBe(0);
  });
});

describe("boundShortageGrowthFinanceCandidates", () => {
  const fact = (
    over: Partial<ShortageGrowthFinanceCandidateFacts>
  ): ShortageGrowthFinanceCandidateFacts => ({
    corporationId: "a",
    sectorId: "s1",
    pressure: 1.5,
    paybackTurns: 50,
    principalLocal: 7_500,
    contributionLocal: 2_500,
    cashContributionLimitLocal: 25_000,
    unitsOrdered: 10,
    ...over,
  });
  const richExposure = () => ({ outstandingLocal: 0, profitPerTurnLocal: 10_000 });

  it("ranks by pressure over payback when the cap binds", () => {
    const candidates = [
      fact({ corporationId: "a", sectorId: "slow", paybackTurns: 95, pressure: 2 }),
      fact({ corporationId: "b", sectorId: "fast", paybackTurns: 40, pressure: 1.4 }),
      fact({ corporationId: "c", sectorId: "deep", paybackTurns: 40, pressure: 2 }),
    ];
    const { selected, rejected } = boundShortageGrowthFinanceCandidates(
      candidates,
      { candidateLimit: 2, maxExposureProfitTurns: 24 },
      richExposure
    );
    expect(selected.map((c) => c.sectorId)).toEqual(["deep", "fast"]);
    expect(rejected).toEqual([{ candidate: candidates[0], reason: "over_cap" }]);
  });

  it("keeps outstanding construction finance within the profit multiple", () => {
    // Ceiling 24 x 1,000 = 24,000; 10,000 is already out, so one 7,500 loan fits, a second does not.
    const exposure = () => ({ outstandingLocal: 10_000, profitPerTurnLocal: 1_000 });
    const { selected, rejected } = boundShortageGrowthFinanceCandidates(
      [fact({ sectorId: "s1" }), fact({ sectorId: "s2" })],
      { candidateLimit: 10, maxExposureProfitTurns: 24 },
      exposure
    );
    expect(selected.map((c) => c.sectorId)).toEqual(["s1"]);
    expect(rejected.map((r) => r.reason)).toEqual(["over_exposure"]);
  });

  it("refuses a company with no profit or no borrower reading", () => {
    const { selected } = boundShortageGrowthFinanceCandidates(
      [fact({ corporationId: "loss" }), fact({ corporationId: "unknown" })],
      { candidateLimit: 10, maxExposureProfitTurns: 24 },
      (id) => (id === "loss" ? { outstandingLocal: 0, profitPerTurnLocal: 0 } : undefined)
    );
    expect(selected).toHaveLength(0);
  });

  it("keeps a company's combined cash contribution within its share", () => {
    const { selected, rejected } = boundShortageGrowthFinanceCandidates(
      [
        fact({ sectorId: "s1", contributionLocal: 15_000 }),
        fact({ sectorId: "s2", contributionLocal: 15_000 }),
      ],
      { candidateLimit: 10, maxExposureProfitTurns: 24 },
      richExposure
    );
    expect(selected.map((c) => c.sectorId)).toEqual(["s1"]);
    expect(rejected.map((r) => r.reason)).toEqual(["over_cash_share"]);
  });
});

describe("sizeShortageGrowthFinance", () => {
  const finance = (pressure: number | undefined) => ({ config, pressureOf: () => pressure });
  const facts = {
    sectorProfitLocal: 500,
    operatingCapacityUnits: 100,
    perUnitBuildCostLocal: 400,
    stepCapUnits: 50,
    cashLocal: 100_000,
    cashFloorLocal: 150_000,
  };

  it("sizes a qualifying sector to its cash share", () => {
    // 25,000 x 0.9 / 0.2575 / 400 = 218 units, capped at the 50-unit step.
    expect(sizeShortageGrowthFinance(finance(1.6), {}, facts)).toEqual({
      growthUnits: 50,
      shortageGrowth: { pressure: 1.6, paybackTurns: 80 },
    });
  });

  it("returns null when the lane is not short or no step is open", () => {
    expect(sizeShortageGrowthFinance(finance(1.1), {}, facts)).toBeNull();
    expect(sizeShortageGrowthFinance(finance(1.6), {}, { ...facts, stepCapUnits: 0 })).toBeNull();
  });
});
