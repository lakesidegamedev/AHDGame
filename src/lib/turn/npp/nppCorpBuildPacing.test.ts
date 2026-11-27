import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import { CAPACITY_ANCHOR_YEAR } from "@/lib/constants/capacityEconomy";
import { foundingStarterUnits } from "@/lib/corporations/foundingPlant";
import { ceoArchetypeModifiers } from "@/lib/turn/ceoArchetype";
import { makeNppCorpDecision } from "@/lib/turn/nppCorporationBehavior";
import type { PlacementSignals } from "./marketSignals";
import { createPaceLedger } from "./buildPacingShell";
import { NPP_PACE_UNMET_SHARE, NPP_PACE_UNREADABLE_GAP_PLANTS } from "./nppCorporationTuning";
import { pacedGrowthUnits, paceRoomUnits, priceSignalPersisted } from "./rules/buildPacing";
import { pacedCandidate } from "./reinvestCandidatePool";
import { candidate, candidatesByCountry } from "./__fixtures__/marketCandidates";

const TURN = 25;
const LANE = "manufacturing";
const STARTER = foundingStarterUnits(LANE);

const plants = {
  enabled: true,
  eraUnitScale: 1,
  year: CAPACITY_ANCHOR_YEAR,
  preset: "2019-default",
  primeRateOf: () => 0,
  costOfLivingOf: () => null,
};

function npp(): Corporation {
  return {
    _id: new ObjectId(),
    countryId: "US",
    type: LANE,
    headquartersState: "NY",
    liquidCapital: 5_000_000_000,
    ceoType: "npp",
  } as unknown as Corporation;
}

function filler(): CorporateSector {
  return {
    _id: new ObjectId(),
    sectorType: "technology",
    countryId: "US",
    stateId: "NY",
    revenue: 10_000_000,
    profitMargin: 30,
    effectiveProfitMargin: 30,
    targetGrowthRate: 2,
  } as unknown as CorporateSector;
}

/** One turn's signals: a measured gap, claims netting it, and the pace ledger. */
function turnSignals(args: {
  gross: number;
  inFlight?: number;
  persisted?: boolean;
}): PlacementSignals & { granted: () => number } {
  let claimed = args.inFlight ?? 0;
  let granted = 0;
  const key = (cell: { stateId: string; sectorType: string }) =>
    `${cell.stateId}|${cell.sectorType}`;
  const ledger = createPaceLedger({
    gapKeyOf: key,
    grossUnmetOf: () => args.gross,
    inFlightOf: () => args.inFlight ?? 0,
  });
  return {
    unmetDemandUnitsOf: () => Math.max(0, args.gross - claimed),
    claimDemandUnits: (cell, units) => {
      claimed += units;
      granted += units;
      ledger.grant(cell, units);
    },
    paceRoomUnitsOf: (cell, pending, options) => ledger.roomOf(cell, pending, options),
    ...(args.persisted === undefined ? {} : { priceSignalPersistedOf: () => args.persisted! }),
    granted: () => granted,
  };
}

/** Every NPP corp decides in turn; kept decisions are claimed before the next corp reads. */
function runPass(signals: PlacementSignals, corps: number) {
  const founded: number[] = [];
  for (let n = 0; n < corps; n++) {
    const decision = makeNppCorpDecision(
      {
        corp: npp(),
        sectors: [filler()],
        turn: TURN,
        now: new Date(),
        modifiers: ceoArchetypeModifiers("cautious"),
      },
      candidatesByCountry([candidate({ stateId: "NY" })]),
      new Set<string>(),
      () => null,
      plants,
      signals
    );
    for (const claim of decision.demandClaims ?? []) signals.claimDemandUnits!(claim, claim.units);
    for (const sector of decision.newSectors ?? []) {
      founded.push(sector.starterOrder?.unitsOrdered ?? 0);
    }
  }
  return founded;
}

describe("buildPacing rules", () => {
  it("allows a share of the gap left after queued capacity, sized by the gap", () => {
    const plantUnits = 10;
    const base = { grantedAgainstGapUnits: 0, plantUnits };
    // A gap a hundred plants wide is no longer held to a fixed plant count.
    expect(paceRoomUnits({ ...base, netUnmetUnits: 1000 })).toBe(1000 * NPP_PACE_UNMET_SHARE);
    expect(paceRoomUnits({ ...base, netUnmetUnits: 60 })).toBeCloseTo(60 * NPP_PACE_UNMET_SHARE);
  });

  it("subtracts what was already granted and never goes negative", () => {
    expect(paceRoomUnits({ netUnmetUnits: 60, grantedAgainstGapUnits: 100, plantUnits: 10 })).toBe(
      0
    );
    expect(paceRoomUnits({ netUnmetUnits: 60, grantedAgainstGapUnits: 10, plantUnits: 10 })).toBe(
      20
    );
  });

  it("always admits one plant against a small open gap, and none against none", () => {
    const base = { grantedAgainstGapUnits: 0, plantUnits: 10 };
    expect(paceRoomUnits({ ...base, netUnmetUnits: 12 })).toBe(10);
    expect(paceRoomUnits({ ...base, netUnmetUnits: 0 })).toBe(0);
  });

  it("holds an unreadable gap to a few plants", () => {
    expect(paceRoomUnits({ netUnmetUnits: null, grantedAgainstGapUnits: 0, plantUnits: 10 })).toBe(
      NPP_PACE_UNREADABLE_GAP_PLANTS * 10
    );
  });

  it("nets capacity under construction out of the gap", () => {
    const ledger = createPaceLedger({
      gapKeyOf: (cell) => `${cell.countryId}|${cell.sectorType}`,
      grossUnmetOf: () => STARTER * 10,
      inFlightOf: () => STARTER * 6,
    });
    const cell = { stateId: "NY", countryId: "US", sectorType: LANE };
    expect(ledger.roomOf(cell, [])).toBe(STARTER * 4 * NPP_PACE_UNMET_SHARE);
    ledger.grant(cell, STARTER);
    expect(ledger.roomOf(cell, [])).toBe(STARTER * 4 * NPP_PACE_UNMET_SHARE - STARTER);
    const covered = createPaceLedger({
      gapKeyOf: (c) => `${c.countryId}|${c.sectorType}`,
      grossUnmetOf: () => STARTER * 10,
      inFlightOf: () => STARTER * 10,
    });
    expect(covered.roomOf(cell, [])).toBe(0);
  });

  it("cuts growth to whole plants and to nothing below one plant", () => {
    const wholePlants = true;
    expect(pacedGrowthUnits({ growthUnits: 100, roomUnits: 25, plantUnits: 10, wholePlants })).toBe(
      20
    );
    expect(pacedGrowthUnits({ growthUnits: 100, roomUnits: 9, plantUnits: 10, wholePlants })).toBe(
      0
    );
    expect(pacedGrowthUnits({ growthUnits: 5, roomUnits: 25, plantUnits: 10, wholePlants })).toBe(
      5
    );
  });

  it("keeps the replacement leg when growth is cut", () => {
    const result = pacedCandidate(
      { units: 50, growthUnits: 40, replacementUnits: 10 },
      { roomUnits: 0, plantUnits: 10, wholePlants: true }
    );
    expect(result).toEqual({ units: 10, growthUnits: 0 });
  });

  it("needs the price at or above base on both snapshots", () => {
    expect(priceSignalPersisted([[1.4, 1.2]])).toBe(true);
    expect(priceSignalPersisted([[2.4, 0.9]])).toBe(false);
    expect(priceSignalPersisted([[2.4, null]])).toBe(false);
    expect(priceSignalPersisted([[null, null]])).toBe(true);
    expect(priceSignalPersisted([])).toBe(true);
    expect(priceSignalPersisted([[0.9, 1.5]])).toBe(false);
    expect(
      priceSignalPersisted([
        [0.9, 0.9],
        [1.1, 1.3],
      ])
    ).toBe(true);
  });
});

describe("NPP build pacing", () => {
  it("many NPPs reading one large gap order no more than the budget in a turn", () => {
    const gross = STARTER * 40;
    const signals = turnSignals({ gross, persisted: true });
    const founded = runPass(signals, 12);
    const total = founded.reduce((sum, units) => sum + units, 0);
    expect(total).toBeLessThanOrEqual(gross * NPP_PACE_UNMET_SHARE);
    expect(total).toBeGreaterThan(0);
  });

  it("a gap far wider than six plants is no longer held to six plants a turn", () => {
    const ledger = createPaceLedger({
      gapKeyOf: (cell) => `${cell.countryId}|${cell.sectorType}`,
      grossUnmetOf: () => STARTER * 40,
    });
    const cell = { stateId: "NY", countryId: "US", sectorType: LANE };
    expect(ledger.roomOf(cell, [])).toBe(STARTER * 20);
    expect(ledger.roomOf(cell, [])).toBeGreaterThan(STARTER * 6);
  });

  it("a balanced market gets no new NPP builds", () => {
    expect(runPass(turnSignals({ gross: 0, persisted: true }), 12)).toEqual([]);
  });

  it("capacity already queued counts against the gap, so a full queue admits nothing", () => {
    const gross = STARTER * 6;
    const signals = turnSignals({ gross, inFlight: gross, persisted: true });
    expect(runPass(signals, 12)).toEqual([]);
  });

  it("capacity already queued shrinks the turn's budget to the gap it leaves", () => {
    const gross = STARTER * 20;
    const inFlight = STARTER * 16;
    const founded = runPass(turnSignals({ gross, inFlight, persisted: true }), 12);
    const total = founded.reduce((sum, units) => sum + units, 0);
    expect(total).toBeLessThanOrEqual((gross - inFlight) * NPP_PACE_UNMET_SHARE);
  });

  it("a one-turn price spike founds nothing, and a held signal does", () => {
    const gross = STARTER * 10;
    expect(runPass(turnSignals({ gross, persisted: false }), 6)).toEqual([]);
    expect(runPass(turnSignals({ gross, persisted: true }), 6).length).toBeGreaterThan(0);
  });

  it("a genuine shortage is filled over several turns without overshooting", () => {
    const demand = STARTER * 24;
    let online = 0;
    let arriving = 0;
    const perTurn: number[] = [];
    for (let turn = 0; turn < 14; turn++) {
      online += arriving;
      // Orders placed last turn land before this turn's reading; none are left in flight.
      arriving = 0;
      const signals = turnSignals({ gross: Math.max(0, demand - online), persisted: true });
      const founded = runPass(signals, 12);
      arriving = founded.reduce((sum, units) => sum + units, 0);
      perTurn.push(arriving);
    }
    online += arriving;
    expect(perTurn[0]).toBeLessThanOrEqual(demand * NPP_PACE_UNMET_SHARE);
    expect(online).toBeLessThanOrEqual(demand);
    expect(online).toBeGreaterThanOrEqual(demand * 0.9);
    expect(perTurn.filter((units) => units > 0).length).toBeGreaterThan(3);
  });

  it("a player autopilot corporation decides the same with the pacing signals on or off", () => {
    const gross = STARTER * 40;
    const corp = {
      ...npp(),
      ceoType: "character",
      autopilot: { enabledTurn: 1, advisories: [], notifiedTurn: {} },
    } as unknown as Corporation;
    const sector = filler();
    const decide = (signals: PlacementSignals) =>
      makeNppCorpDecision(
        {
          corp,
          sectors: [sector],
          turn: TURN,
          now: new Date(0),
          modifiers: ceoArchetypeModifiers("cautious"),
        },
        candidatesByCountry([candidate({ stateId: "NY" })]),
        new Set<string>(),
        () => null,
        plants,
        signals
      );
    const paced = turnSignals({ gross, persisted: false });
    // A grant that leaves no room, and a signal that has not held.
    paced.claimDemandUnits!({ stateId: "NY", countryId: "US", sectorType: LANE }, gross);
    const { paceRoomUnitsOf: _room, priceSignalPersistedOf: _held, ...unpaced } = paced;
    void _room;
    void _held;
    expect(JSON.stringify(decide(paced).newSectors)).toBe(
      JSON.stringify(decide(unpaced).newSectors)
    );
    expect(JSON.stringify(decide(paced).reinvestments)).toBe(
      JSON.stringify(decide(unpaced).reinvestments)
    );
  });
});
