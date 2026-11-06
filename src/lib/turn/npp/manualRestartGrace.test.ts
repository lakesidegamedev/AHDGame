import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import { buildNppGlutMothballUpdates } from "./glutMothballing";
import { chooseCostMothballSector } from "./costMothball";
import { glutStaggerEligible } from "./cohort";
import type { SectorProfitInfo } from "./sectorProfitability";
import {
  COST_MOTHBALL_LOSS_TURNS,
  MANUAL_RESTART_GRACE_TURNS,
  inManualRestartGrace,
  manualRestartGraceEndsTurn,
} from "./nppCorporationTuning";
import { NPP_FLOOR_MOTHBALL_TURNS } from "./rules/marketSaturation";
import { ownerRestartFields } from "@/lib/corporations/commands/sectorOperations/ownerRestart";

const corp = { _id: new ObjectId(), countryId: "US" } as unknown as Corporation;
const eligibleTurn = (() => {
  for (let t = 100; t < 164; t += 1) if (glutStaggerEligible(corp._id.toString(), t)) return t;
  throw new Error("no stagger slot");
})();

const sp = (over: Partial<CorporateSector>): SectorProfitInfo => ({
  sector: {
    _id: new ObjectId(),
    stateId: "NY",
    countryId: "US",
    sectorType: "manufacturing",
    capitalStock: 100,
    soldFraction: 0.9,
    ...over,
  } as CorporateSector,
  income: -1,
  margin: -200,
  isProfitable: false,
  marginCategory: "loss",
});

const run = (sectors: SectorProfitInfo[], turn = eligibleTurn) =>
  buildNppGlutMothballUpdates({
    corporation: corp,
    turn,
    now: new Date(0),
    plantsEnabled: true,
    sectorProfits: sectors,
    divestedSectorIds: [],
    priceRatioOf: () => 2.5,
  });

describe("manual restart grace", () => {
  it("holds for exactly the grace window after the restart turn", () => {
    const s = { manualReactivatedTurn: 100 };
    expect(inManualRestartGrace(s, 100 + MANUAL_RESTART_GRACE_TURNS - 1)).toBe(true);
    expect(inManualRestartGrace(s, 100 + MANUAL_RESTART_GRACE_TURNS)).toBe(false);
    expect(inManualRestartGrace({}, 100)).toBe(false);
    expect(manualRestartGraceEndsTurn(s)).toBe(100 + MANUAL_RESTART_GRACE_TURNS);
    expect(manualRestartGraceEndsTurn({})).toBeNull();
  });

  it("owner restart resets both counters and records the turn", () => {
    expect(ownerRestartFields(77)).toEqual({
      pnlLossTurns: 0,
      producerZeroSalesTurns: 0,
      manualReactivatedTurn: 77,
    });
  });

  it("cost path: a chronic loser is mothballed without the marker", () => {
    const loser = sp({ pnlLossTurns: 37 });
    const updates = run([loser]);
    expect(updates).toHaveLength(1);
    expect(updates[0].update).toMatchObject({ $set: { mothballed: true } });
  });

  it("cost path: a manually restarted chronic loser is left running", () => {
    const loser = sp({ pnlLossTurns: 37, manualReactivatedTurn: eligibleTurn - 1 });
    expect(run([loser])).toEqual([]);
  });

  it("cost path: the hold lapses after the grace window", () => {
    const loser = sp({
      pnlLossTurns: 37,
      manualReactivatedTurn: eligibleTurn - MANUAL_RESTART_GRACE_TURNS,
    });
    expect(run([loser])).toHaveLength(1);
  });

  it("cost path: picks the next loser when the longest-running one is held", () => {
    const held = sp({ pnlLossTurns: 37, manualReactivatedTurn: eligibleTurn });
    const other = sp({ pnlLossTurns: COST_MOTHBALL_LOSS_TURNS });
    expect(
      chooseCostMothballSector([held, other], [], COST_MOTHBALL_LOSS_TURNS, eligibleTurn)
    ).toBe(other);
  });

  it("glut path: a held plant in a glutted market is not shed", () => {
    const glutted = sp({ soldFraction: 0.01, manualReactivatedTurn: eligibleTurn });
    const prices = () => 0.2;
    const updates = buildNppGlutMothballUpdates({
      corporation: corp,
      turn: eligibleTurn,
      now: new Date(0),
      plantsEnabled: true,
      sectorProfits: [glutted],
      divestedSectorIds: [],
      priceRatioOf: prices,
    });
    expect(updates).toEqual([]);
    const unheld = sp({ soldFraction: 0.01 });
    expect(
      buildNppGlutMothballUpdates({
        corporation: corp,
        turn: eligibleTurn,
        now: new Date(0),
        plantsEnabled: true,
        sectorProfits: [unheld],
        divestedSectorIds: [],
        priceRatioOf: prices,
      })
    ).toHaveLength(1);
  });

  it("floor-stuck path: a held plant at the throttle floor is not shed", () => {
    const stuck = sp({
      demandThrottleFactor: 0.1,
      demandIdleTurns: NPP_FLOOR_MOTHBALL_TURNS,
      manualReactivatedTurn: eligibleTurn,
    });
    expect(run([stuck])).toEqual([]);
    const unheld = sp({ demandThrottleFactor: 0.1, demandIdleTurns: NPP_FLOOR_MOTHBALL_TURNS });
    expect(run([unheld])).toHaveLength(1);
  });
});
