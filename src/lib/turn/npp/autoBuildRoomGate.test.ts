import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import { candidate, candidatesByCountry } from "./__fixtures__/marketCandidates";
import { CAPACITY_ANCHOR_YEAR } from "@/lib/constants/capacityEconomy";
import { AUTOPILOT_MODIFIERS } from "@/lib/corporations/autopilot";
import { makeNppCorpDecision } from "./makeCorpDecision";
import type { PlacementSignals } from "./marketSignals";
import { evaluateAutoBuildRoomGate } from "@/lib/corporations/rules/autoBuildRoomGate";

const PLANTS = {
  enabled: true,
  eraUnitScale: 1,
  year: CAPACITY_ANCHOR_YEAR,
  preset: "2019-default",
  primeRateOf: () => 0,
  costOfLivingOf: () => null,
} as const;

function run(args: { autopilot: boolean; stage?: number; room: number | null }) {
  const corp = {
    _id: new ObjectId(),
    type: "energy",
    countryId: "US",
    headquartersState: "ND",
    liquidCurrencyCode: "USD",
    liquidCapital: 36_800_000,
    ceoType: args.autopilot ? "character" : "npp",
    ceoId: new ObjectId(),
    userId: args.autopilot ? new ObjectId() : undefined,
    autopilot: args.autopilot ? { enabledTurn: 1 } : undefined,
    logisticsStrength: 1000,
  } as unknown as Corporation;
  const specs: Array<[string, string, number]> = [
    ["energy", "ND", 52_528],
    ["energy", "WY", 53_976],
  ];
  const sectors = specs.map(
    ([sectorType, stateId, units]) =>
      ({
        _id: new ObjectId(),
        corporationId: corp._id,
        sectorType,
        countryId: "US",
        stateId,
        revenue: 15_000_000,
        profitMargin: 33,
        plantsPnl: { revenue: 15_000_000, costs: 10_000_000, profit: 5_000_000 },
        capitalStock: units,
        operatingCapacityUnits: units,
        producedUnits: units,
        soldUnits: units,
        buildQueue: [],
      }) as unknown as CorporateSector
  );
  const pools = specs.map(([sectorType, stateId]) => candidate({ sectorType, stateId } as never));
  const signals: PlacementSignals = { unmetDemandUnitsOf: () => args.room };
  const decision = makeNppCorpDecision(
    {
      corp,
      sectors,
      turn: 242,
      now: new Date("2026-01-01"),
      modifiers: AUTOPILOT_MODIFIERS,
      strategyLoopEnabled: false,
      ...(args.stage ? { buildRoomStage: args.stage } : {}),
    },
    candidatesByCountry(pools),
    new Set(),
    () => 2,
    PLANTS,
    signals
  );
  return decision;
}

describe("automatic build room gate", () => {
  for (const autopilot of [true, false]) {
    const who = autopilot ? "autopilot" : "computer-run";

    it(`${who}: a market with no unmet demand gets no build once the stage is on`, () => {
      const decision = run({ autopilot, stage: 1, room: 0 });
      expect(decision.reinvestments ?? []).toEqual([]);
      const gates = (decision.capacityObservations ?? []).map((o) => o.outcome);
      expect(gates).toContain("no_build_room");
    });

    it(`${who}: an unmeasured room gets no build once the stage is on`, () => {
      const decision = run({ autopilot, stage: 1, room: null });
      expect(decision.reinvestments ?? []).toEqual([]);
    });

    it(`${who}: a market with room builds the same as with the stage off`, () => {
      const on = run({ autopilot, stage: 1, room: 1_000_000 });
      const off = run({ autopilot, room: 1_000_000 });
      expect((on.reinvestments ?? []).length).toBeGreaterThan(0);
      expect((on.reinvestments ?? []).map((b) => [b.units, Math.round(b.costLocal)])).toEqual(
        (off.reinvestments ?? []).map((b) => [b.units, Math.round(b.costLocal)])
      );
    });
  }

  it("computer-run company with the stage off still builds without room", () => {
    const decision = run({ autopilot: false, room: 0 });
    expect((decision.reinvestments ?? []).length).toBeGreaterThan(0);
  });
});

describe("evaluateAutoBuildRoomGate", () => {
  it("is inert while the stage is off", () => {
    expect(evaluateAutoBuildRoomGate({ stage: 0, roomUnits: 0, demandLed: false })).toBeNull();
    expect(
      evaluateAutoBuildRoomGate({ stage: undefined, roomUnits: null, demandLed: false })
    ).toBeNull();
  });
  it("refuses no room and unmeasured room", () => {
    expect(evaluateAutoBuildRoomGate({ stage: 1, roomUnits: 0, demandLed: false })).toBe(
      "no_build_room"
    );
    expect(evaluateAutoBuildRoomGate({ stage: 1, roomUnits: null, demandLed: false })).toBe(
      "no_build_room"
    );
  });
  it("passes measured room and demand-led builds", () => {
    expect(evaluateAutoBuildRoomGate({ stage: 1, roomUnits: 5, demandLed: false })).toBeNull();
    expect(evaluateAutoBuildRoomGate({ stage: 1, roomUnits: 0, demandLed: true })).toBeNull();
  });
});
