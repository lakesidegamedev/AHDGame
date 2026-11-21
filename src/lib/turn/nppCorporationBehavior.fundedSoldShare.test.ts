/**
 * AI rules that act on a plant's sold share read the funded sale on a funded
 * turn: wage policy, the production policy cap, glut mothballing, the strategy
 * pivot signal and the stranded divest. Each rule is pinned three ways: on a
 * funded turn with the legacy figure and the funded sale disagreeing in both
 * directions, on a legacy world (unchanged), and with no current funded sale
 * (no evidence, never "sold nothing" and never the legacy figure).
 */
import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import {
  glutStaggerEligible,
  makeNppCorpDecision,
  type CommodityPriceRatioFn,
  type NppPlantsContext,
} from "./nppCorporationBehavior";
import { ceoArchetypeModifiers } from "./ceoArchetype";
import { CAPACITY_ANCHOR_YEAR } from "@/lib/constants/capacityEconomy";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { MarketCandidate } from "./npp/marketCandidates";
import type { NppCorpDecisionContext } from "./npp/corpDecisionTypes";

const TURN = 100;
const EPOCH = "epoch-funded";
const FUNDED = { fundedWorldEpoch: EPOCH, transitionFirstFundedTurn: 2 } as const;

const plantsCtx: NppPlantsContext = {
  enabled: true,
  eraUnitScale: 1,
  year: CAPACITY_ANCHOR_YEAR,
  preset: "2019-default",
  primeRateOf: () => 0,
  costOfLivingOf: () => null,
};

function idWithEligibility(eligible: boolean): ObjectId {
  for (;;) {
    const id = new ObjectId();
    if (glutStaggerEligible(id.toString(), TURN) === eligible) return id;
  }
}

function corp(overrides: Partial<Corporation> = {}): Corporation {
  return {
    _id: idWithEligibility(true),
    countryId: "US",
    type: "chemical_industries",
    headquartersState: "TX",
    liquidCapital: 50_000_000,
    ceoType: "npp",
    ...overrides,
  } as unknown as Corporation;
}

/** A receipt settled this turn: `sold` of 100 offered units. */
function receipt(sold: number, over: Record<string, unknown> = {}) {
  return { worldEpoch: EPOCH, turn: TURN, offeredUnits: 100, soldUnits: sold, ...over };
}

function sector(over: Partial<CorporateSector> = {}): CorporateSector {
  return {
    _id: new ObjectId(),
    sectorType: "chemical_industries",
    countryId: "US",
    stateId: "TX",
    revenue: 10_000_000,
    realizedRevenue: 10_000_000,
    profitMargin: 30,
    effectiveProfitMargin: 30,
    targetGrowthRate: 2,
    wageLevel: 1,
    ...over,
  } as unknown as CorporateSector;
}

function decide(
  sectors: CorporateSector[],
  priceRatioOf: CommodityPriceRatioFn,
  extra: Partial<NppCorpDecisionContext> = {},
  c: Corporation = corp(),
  plants: NppPlantsContext | undefined = plantsCtx
) {
  return makeNppCorpDecision(
    {
      corp: c,
      sectors,
      turn: TURN,
      now: new Date(),
      modifiers: ceoArchetypeModifiers("cautious"),
      ...extra,
    },
    new Map<string, MarketCandidate[]>(),
    new Set<string>(),
    priceRatioOf,
    plants
  );
}

const setsOf = (d: ReturnType<typeof decide>, field: string, id: ObjectId) =>
  d.sectorUpdates
    .filter((u) => u.filter._id === id)
    .map((u) => (u.update.$set ?? {}) as Record<string, unknown>)
    .filter((s) => field in s)
    .map((s) => s[field]);

/** Balanced prices with a healthy margin: only the sold share can push a glut wage. */
const balanced: CommodityPriceRatioFn = () => 1;

describe("wage policy reads the funded sale", () => {
  it("cuts toward the glut wage when the funded sale is low and the legacy figure is high", () => {
    const s = sector({ soldFraction: 0.9, producerSettlement: receipt(20) } as never);
    expect(setsOf(decide([s], balanced, FUNDED), "wageLevel", s._id)).toEqual([0.98]);
  });

  it("holds the baseline when the funded sale is high and the legacy figure is low", () => {
    const s = sector({ soldFraction: 0.1, producerSettlement: receipt(90) } as never);
    expect(setsOf(decide([s], balanced, FUNDED), "wageLevel", s._id)).toEqual([]);
  });

  it("has no evidence without a current funded sale, whatever the legacy figure says", () => {
    const stale = sector({
      soldFraction: 0.1,
      producerSettlement: receipt(0, { turn: TURN - 2 }),
    } as never);
    const none = sector({ soldFraction: 0.1 });
    const nothingOffered = sector({
      soldFraction: 0.1,
      producerSettlement: receipt(0, { offeredUnits: 0 }),
    } as never);
    const otherWorld = sector({
      soldFraction: 0.1,
      producerSettlement: receipt(0, { worldEpoch: "earlier-world" }),
    } as never);
    for (const s of [stale, none, nothingOffered, otherWorld])
      expect(setsOf(decide([s], balanced, FUNDED), "wageLevel", s._id)).toEqual([]);
  });

  it("is unchanged on a legacy world: the legacy figure decides", () => {
    const low = sector({ soldFraction: 0.1, producerSettlement: receipt(90) } as never);
    expect(setsOf(decide([low], balanced), "wageLevel", low._id)).toEqual([0.98]);
    const high = sector({ soldFraction: 0.9, producerSettlement: receipt(10) } as never);
    expect(setsOf(decide([high], balanced), "wageLevel", high._id)).toEqual([]);
  });

  it("reads the legacy figure before the first funded turn", () => {
    const s = sector({ soldFraction: 0.1, producerSettlement: receipt(90) } as never);
    const early = { fundedWorldEpoch: EPOCH, transitionFirstFundedTurn: TURN + 1 };
    expect(setsOf(decide([s], balanced, early), "wageLevel", s._id)).toEqual([0.98]);
  });
});

describe("production policy cap reads the funded sale", () => {
  /** Shortage prices push a positive policy target; low fill caps it at 0. */
  const shortage: CommodityPriceRatioFn = () => 1.5;

  it("caps the policy at 0 when the funded sale is low and the legacy figure is high", () => {
    const s = sector({
      productionPolicy: 1,
      soldFraction: 0.9,
      producerSettlement: receipt(20),
    } as never);
    expect(setsOf(decide([s], shortage, FUNDED), "productionPolicy", s._id)).toEqual([0]);
  });

  it("lets the policy ramp when the funded sale is high and the legacy figure is low", () => {
    const s = sector({
      productionPolicy: 0,
      soldFraction: 0.1,
      producerSettlement: receipt(90),
    } as never);
    const sets = setsOf(decide([s], shortage, FUNDED), "productionPolicy", s._id);
    expect(sets).toHaveLength(1);
    expect(sets[0] as number).toBeGreaterThan(0);
  });

  it("does not cap without a current funded sale", () => {
    const s = sector({ productionPolicy: 0, soldFraction: 0.1 });
    const sets = setsOf(decide([s], shortage, FUNDED), "productionPolicy", s._id);
    expect(sets).toHaveLength(1);
    expect(sets[0] as number).toBeGreaterThan(0);
  });

  it("is unchanged on a legacy world", () => {
    const s = sector({
      productionPolicy: 1,
      soldFraction: 0.1,
      producerSettlement: receipt(90),
    } as never);
    expect(setsOf(decide([s], shortage), "productionPolicy", s._id)).toEqual([0]);
  });
});

describe("glut mothballing reads the funded sale", () => {
  const glut: CommodityPriceRatioFn = () => 0.58;
  const mothballed = (d: ReturnType<typeof decide>) =>
    d.sectorUpdates
      .filter((u) => (u.update.$set as Record<string, unknown>)?.mothballed === true)
      .map((u) => u.filter._id);

  it("sheds the plant whose funded sale is low, not the one the legacy figure calls low", () => {
    const reallyLow = sector({ soldFraction: 0.9, producerSettlement: receipt(5) } as never);
    const legacyLow = sector({ soldFraction: 0.05, producerSettlement: receipt(95) } as never);
    expect(mothballed(decide([reallyLow, legacyLow], glut, FUNDED))).toEqual([reallyLow._id]);
  });

  it("sheds nothing when only the legacy figure reads a glut", () => {
    const a = sector({ soldFraction: 0.05, producerSettlement: receipt(95) } as never);
    const b = sector({ soldFraction: 0.05 });
    expect(mothballed(decide([a, b], glut, FUNDED))).toEqual([]);
  });

  it("is unchanged on a legacy world", () => {
    const reallyLow = sector({ soldFraction: 0.9, producerSettlement: receipt(5) } as never);
    const legacyLow = sector({ soldFraction: 0.05, producerSettlement: receipt(95) } as never);
    expect(mothballed(decide([reallyLow, legacyLow], glut))).toEqual([legacyLow._id]);
  });

  it("resets the funded low-sale streak when a funded world restarts a plant", () => {
    const cold = sector({ mothballed: true, fundedLowSaleTurns: 9 } as never);
    const d = decide([cold, sector()], () => 1.3, FUNDED);
    const restart = d.sectorUpdates.find(
      (u) =>
        u.filter._id === cold._id && (u.update.$set as Record<string, unknown>).mothballed === false
    );
    expect(restart?.update.$set).toMatchObject({ fundedLowSaleTurns: 0 });
    const legacy = decide([cold, sector()], () => 1.3);
    const legacyRestart = legacy.sectorUpdates.find((u) => u.filter._id === cold._id);
    expect(legacyRestart?.update.$set).not.toHaveProperty("fundedLowSaleTurns");
  });
});

describe("strategy pivot signal reads the funded sale", () => {
  const autopilotCorp = () =>
    corp({ autopilot: { enabled: true }, ceoType: "character" } as unknown as Partial<Corporation>);

  it("counts sectors as unable to sell by their funded sale", () => {
    const sectors = [
      sector({ soldFraction: 0.9, producerSettlement: receipt(10) } as never),
      sector({ soldFraction: 0.9, producerSettlement: receipt(10) } as never),
      sector({ soldFraction: 0.1, producerSettlement: receipt(90) } as never),
    ];
    expect(
      decide(sectors, balanced, FUNDED, autopilotCorp()).autopilotSignals?.chronicLowFill
    ).toBe(true);
    expect(decide(sectors, balanced, {}, autopilotCorp()).autopilotSignals?.chronicLowFill).toBe(
      false
    );
  });

  it("does not count sectors with no current funded sale as unable to sell", () => {
    const sectors = [sector({ soldFraction: 0.1 }), sector({ soldFraction: 0.1 })];
    expect(
      decide(sectors, balanced, FUNDED, autopilotCorp()).autopilotSignals?.chronicLowFill
    ).toBe(false);
    expect(decide(sectors, balanced, {}, autopilotCorp()).autopilotSignals?.chronicLowFill).toBe(
      true
    );
  });
});

describe("stranded divest on a funded turn", () => {
  const profitable = () => sector();
  const divested = (d: ReturnType<typeof decide>) =>
    (d.divestedSectorIds ?? []).map((id) => id.toString());

  it("divests on the funded streak and a current low funded sale", () => {
    const stranded = sector({
      sectorType: "manufacturing",
      fundedLowSaleTurns: 12,
      lowFillTurns: 0,
      producerSettlement: receipt(10),
    } as never);
    expect(divested(decide([profitable(), stranded], balanced, FUNDED))).toContain(
      stranded._id.toString()
    );
  });

  it("ignores the legacy counter on a funded turn", () => {
    const legacyOnly = sector({
      sectorType: "manufacturing",
      fundedLowSaleTurns: 0,
      lowFillTurns: 40,
      producerSettlement: receipt(10),
    } as never);
    expect(divested(decide([profitable(), legacyOnly], balanced, FUNDED))).not.toContain(
      legacyOnly._id.toString()
    );
  });

  it("does not divest a plant selling half or more, or with no current sale", () => {
    const selling = sector({
      sectorType: "manufacturing",
      fundedLowSaleTurns: 30,
      producerSettlement: receipt(60),
    } as never);
    const noSale = sector({ sectorType: "manufacturing", fundedLowSaleTurns: 30 } as never);
    const d = decide([profitable(), selling, noSale], balanced, FUNDED);
    expect(divested(d)).not.toContain(selling._id.toString());
    expect(divested(d)).not.toContain(noSale._id.toString());
  });

  it("orders candidates by the funded streak", () => {
    const shorter = sector({
      sectorType: "manufacturing",
      fundedLowSaleTurns: 13,
      lowFillTurns: 99,
      producerSettlement: receipt(10),
    } as never);
    const longer = sector({
      sectorType: "manufacturing",
      fundedLowSaleTurns: 20,
      lowFillTurns: 12,
      producerSettlement: receipt(10),
    } as never);
    const d = decide([profitable(), shorter, longer], balanced, FUNDED);
    expect(divested(d)).toContain(longer._id.toString());
    expect(divested(d)).not.toContain(shorter._id.toString());
  });

  it("is unchanged on a legacy world: the legacy counter decides", () => {
    const stranded = sector({
      sectorType: "manufacturing",
      fundedLowSaleTurns: 0,
      lowFillTurns: 12,
    } as never);
    expect(divested(decide([profitable(), stranded], balanced))).toContain(stranded._id.toString());
  });
});
