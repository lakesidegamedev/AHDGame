import type { Db } from "mongodb";
import { describe, expect, it } from "vitest";
import { driveConflictTurn, type ConflictParticipants } from "./driver";
import { applyConflictOutcome, normalizeConflictState, phaseFor } from "./engine";
import { FUTURE_CONFLICT_RESTING_PHASES, isFutureConflictFamily } from "./futureConflicts";
import { allLivingConflictDefs, livingConflictDef } from "./registry";
import { build2027ConflictOpening } from "./initialState2027";
import {
  EMPTY_WAVE_SIGNALS,
  waveAnnualChance,
  waveAnnualChances,
  waveGatesHold,
  yearFractionOfTurn,
} from "./rules/waveFamilies";
import {
  ANTIMICROBIAL_RESISTANCE_KEY,
  ARCTIC_OPENING_KEY,
  CLIMATE_MIGRATION_KEY,
  CRITICAL_MINERALS_KEY,
  ORBITAL_DEBRIS_KEY,
  GRID_CASCADE_KEY,
  SECOND_PANDEMIC_KEY,
  SOVEREIGN_DEBT_WAVE_KEY,
  WAVE_FAMILY_TABLES,
  waveFamilyKeys,
  waveFamilyTable,
  type WaveSignals,
} from "./rules/waveFamilyTables";
import type { LivingConflictDef, LivingConflictState } from "./types";

const WAVE_DEFS = waveFamilyKeys().map((key) => livingConflictDef(key)!);

function fakeDb(seed: Record<string, Partial<LivingConflictState>> = {}) {
  const store = new Map<string, unknown>(Object.entries(seed));
  const db = {
    collection() {
      return {
        async findOne(q: { defKey: string }) {
          return store.get(q.defKey) ?? null;
        },
        async updateOne(q: { defKey: string }, u: { $set: Record<string, unknown> }) {
          store.set(q.defKey, { ...((store.get(q.defKey) as object) ?? {}), ...u.$set });
        },
        find() {
          return { toArray: async () => [] };
        },
      };
    },
  };
  return { db: db as unknown as Db, store };
}

const members = (ids: string[]): ConflictParticipants => ({
  belligerents: ids,
  neighbors: [],
  blocMembers: [],
  bystanders: [],
});

function seeded(def: LivingConflictDef, phaseKey: string, tracks: Record<string, number>) {
  const phase = def.phases.find((candidate) => candidate.key === phaseKey)!;
  return normalizeConflictState(def, {
    defKey: def.key,
    hasOpened: true,
    status: "active",
    phaseLevel: phase.level,
    phaseTurns: 1,
    totalTurns: 1,
    tracks,
  });
}

async function stepFrom(def: LivingConflictDef, state: LivingConflictState) {
  const { db } = fakeDb({ [def.key]: state });
  const result = await driveConflictTurn(db, def, members(["UK"]), 5000, 2040, 0, {}, {});
  return { state: result.state, phase: phaseFor(def, result.state.phaseLevel)?.key };
}

function outcomeOf(def: LivingConflictDef, phaseKey: string, outcomeId: string) {
  return def.phases
    .find((phase) => phase.key === phaseKey)!
    .events.find((event) => event.response)!
    .response!.outcomes.find((outcome) => outcome.outcomeId === outcomeId)!;
}

const signals = (overrides: Partial<WaveSignals>): WaveSignals => ({
  ...EMPTY_WAVE_SIGNALS,
  ...overrides,
});

describe("wave family tables", () => {
  it("has a complete table for every registered wave family", () => {
    for (const key of waveFamilyKeys()) expect(() => waveFamilyTable(key)).not.toThrow();
  });

  it("throws on a missing family, a missing number or an unpreventable family", () => {
    expect(() => waveFamilyTable("no_such_family")).toThrow(/no table/);
    const template = WAVE_FAMILY_TABLES[SECOND_PANDEMIC_KEY];
    try {
      WAVE_FAMILY_TABLES.broken_a = {
        ...template,
        dynamics: { ...template.dynamics, peakAt: Number.NaN },
      };
      expect(() => waveFamilyTable("broken_a")).toThrow(/peakAt/);
      WAVE_FAMILY_TABLES.broken_b = {
        ...template,
        dynamics: { ...template.dynamics, restDecay: undefined as unknown as number },
      };
      expect(() => waveFamilyTable("broken_b")).toThrow(/restDecay/);
      WAVE_FAMILY_TABLES.broken_c = {
        ...template,
        opening: { ...template.opening, gates: [] },
      };
      expect(() => waveFamilyTable("broken_c")).toThrow(/prevented/);
    } finally {
      delete WAVE_FAMILY_TABLES.broken_a;
      delete WAVE_FAMILY_TABLES.broken_b;
      delete WAVE_FAMILY_TABLES.broken_c;
    }
  });
});

describe("wave family opening rules", () => {
  it("never opens when a gate fails, so good conditions prevent every family", () => {
    for (const key of waveFamilyKeys()) {
      const rule = waveFamilyTable(key).opening;
      const healthy = signals({
        healthPrevention: 95,
        healthEfficiency: 95,
        utilities: 95,
        stewardship: 95,
        integration: 95,
        openness: 95,
        integrity: 95,
        energySecurity: 5,
        rdIntensity: 0.1,
        gdpGrowth: 6,
        urbanization: 10,
        migrationRate: 0,
        debtToGdp: 20,
        tension: 0,
        yearFraction: 0.05,
      });
      expect(waveGatesHold(rule, "UK", healthy), key).toBe(false);
    }
  });

  it("raises a pandemic chance as health prevention falls", () => {
    const rule = waveFamilyTable(SECOND_PANDEMIC_KEY).opening;
    const base = { urbanization: 70 };
    const strong = waveAnnualChance(rule, signals({ ...base, healthPrevention: 65 }));
    const weak = waveAnnualChance(rule, signals({ ...base, healthPrevention: 30 }));
    expect(weak).toBeGreaterThan(strong);
    expect(weak).toBeLessThanOrEqual(rule.capAnnual);
    expect(waveGatesHold(rule, "UK", signals({ healthPrevention: 80 }))).toBe(false);
  });

  it("keeps the debt wave shut until three countries qualify together", () => {
    const stressed = signals({ debtToGdp: 140, gdpGrowth: 0 });
    const calm = signals({ debtToGdp: 60, gdpGrowth: 2 });
    const two = new Map([
      ["US", stressed],
      ["IT", stressed],
      ["DE", calm],
    ]);
    expect(
      [...waveAnnualChances(SOVEREIGN_DEBT_WAVE_KEY, two).values()].every((v) => v === 0)
    ).toBe(true);
    const three = new Map([...two, ["JP", stressed]]);
    const chances = waveAnnualChances(SOVEREIGN_DEBT_WAVE_KEY, three);
    expect([...chances.keys()].sort()).toEqual(["IT", "JP", "US"]);
    expect(chances.get("US")!).toBeGreaterThan(0);
  });

  it("opens the grid cascade only in the summer window", () => {
    const rule = waveFamilyTable(GRID_CASCADE_KEY).opening;
    const thin = { utilities: 30, stewardship: 30 };
    expect(waveGatesHold(rule, "US", signals({ ...thin, yearFraction: 0.55 }))).toBe(true);
    expect(waveGatesHold(rule, "US", signals({ ...thin, yearFraction: 0.1 }))).toBe(false);
    expect(yearFractionOfTurn(48 * 5 + 24)).toBe(0.5);
  });

  it("needs tension for a minerals squeeze and ignores low-tech economies", () => {
    const rule = waveFamilyTable(CRITICAL_MINERALS_KEY).opening;
    expect(waveGatesHold(rule, "US", signals({ tension: 20, rdIntensity: 3 }))).toBe(false);
    expect(waveGatesHold(rule, "US", signals({ tension: 60, rdIntensity: 0.5 }))).toBe(false);
    expect(waveGatesHold(rule, "US", signals({ tension: 60, rdIntensity: 3 }))).toBe(true);
  });
});

describe("climate, Arctic, resistance and orbit opening rules", () => {
  it("opens climate migration only under climate pressure with real inflows", () => {
    const rule = waveFamilyTable(CLIMATE_MIGRATION_KEY).opening;
    expect(waveGatesHold(rule, "DE", signals({ migrationRate: 0.6, stewardship: 30 }))).toBe(true);
    expect(waveGatesHold(rule, "DE", signals({ migrationRate: 0.6, stewardship: 80 }))).toBe(false);
    expect(waveGatesHold(rule, "DE", signals({ migrationRate: 0.05, stewardship: 30 }))).toBe(
      false
    );
    const open = waveAnnualChance(
      rule,
      signals({ migrationRate: 0.9, stewardship: 25, integration: 30 })
    );
    const calm = waveAnnualChance(
      rule,
      signals({ migrationRate: 0.3, stewardship: 50, integration: 55 })
    );
    expect(open).toBeGreaterThan(calm);
  });

  it("limits the Arctic scramble to countries with northern coasts", () => {
    const rule = waveFamilyTable(ARCTIC_OPENING_KEY).opening;
    const warm = signals({ stewardship: 30, tension: 60 });
    expect(waveGatesHold(rule, "RU", warm)).toBe(true);
    expect(waveGatesHold(rule, "US", warm)).toBe(true);
    expect(waveGatesHold(rule, "BR", warm)).toBe(false);
    expect(waveGatesHold(rule, "RU", signals({ stewardship: 90, tension: 60 }))).toBe(false);
  });

  it("grows antimicrobial resistance risk as prevention weakens", () => {
    const rule = waveFamilyTable(ANTIMICROBIAL_RESISTANCE_KEY).opening;
    expect(waveGatesHold(rule, "UK", signals({ healthPrevention: 80 }))).toBe(false);
    const weak = waveAnnualChance(rule, signals({ healthPrevention: 25, healthEfficiency: 30 }));
    const fair = waveAnnualChance(rule, signals({ healthPrevention: 50, healthEfficiency: 55 }));
    expect(weak).toBeGreaterThan(fair);
  });

  it("only exposes research-heavy space economies to orbital debris", () => {
    const rule = waveFamilyTable(ORBITAL_DEBRIS_KEY).opening;
    expect(waveGatesHold(rule, "US", signals({ rdIntensity: 1 }))).toBe(false);
    expect(waveGatesHold(rule, "US", signals({ rdIntensity: 3.5, tension: 50 }))).toBe(true);
  });
});

describe("wave family definitions", () => {
  it("registers every wave family as a post-2027 future conflict", () => {
    expect(WAVE_DEFS.length).toBe(waveFamilyKeys().length);
    for (const def of WAVE_DEFS) {
      expect(isFutureConflictFamily(def.key)).toBe(true);
      expect(FUTURE_CONFLICT_RESTING_PHASES[def.key]).toEqual(["rested"]);
      expect(def.fromYear).toBeGreaterThanOrEqual(2028);
      expect(allLivingConflictDefs()).toContain(def);
    }
  });

  it.each(WAVE_DEFS)("$key is inert in the 2027 opening and before its window", async (def) => {
    const opening = build2027ConflictOpening(def, { countries: new Set(["UK"]), populations: {} });
    expect(opening).toMatchObject({ hasOpened: false, status: "dormant" });
    const { db } = fakeDb({ [def.key]: opening });
    const early = await driveConflictTurn(
      db,
      def,
      members(["UK"]),
      100,
      def.fromYear! - 1,
      5,
      {},
      {
        "member:UK": 1,
        waveSignal: 1,
      }
    );
    expect(early.state.hasOpened).toBe(false);
    const noPressure = await driveConflictTurn(db, def, members(["UK"]), 101, def.fromYear!, 0);
    expect(noPressure.state.hasOpened).toBe(false);
    const opened = await driveConflictTurn(
      db,
      def,
      members(["UK"]),
      102,
      def.fromYear!,
      1,
      {},
      {
        "member:UK": 1,
        waveSignal: 1,
      }
    );
    expect(opened.state).toMatchObject({ hasOpened: true, phaseLevel: 1 });
  });

  it.each(WAVE_DEFS)("$key offers three levers plus doing nothing, in plain text", (def) => {
    for (const phase of def.phases) {
      for (const event of phase.events) {
        expect(`${event.headline}${event.body}`).not.toMatch(/[–—]/);
        const options = event.response!.decisionTrees.belligerent!.options ?? [];
        expect(options).toHaveLength(4);
        expect(options.map((o) => Object.keys(o.responseScores ?? {})[0]).filter(Boolean)).toEqual([
          "contain",
          "soften",
          "adapt",
        ]);
      }
    }
  });

  it.each(WAVE_DEFS)("$key resolves with no player or government action", async (def) => {
    const { db, store } = fakeDb({ [def.key]: seeded(def, "onset", { "member:UK": 1 }) });
    let rested = false;
    for (let turn = 1; turn <= 600 && !rested; turn++) {
      const { state, events } = await driveConflictTurn(
        db,
        def,
        members(["UK"]),
        turn,
        2040,
        0,
        {},
        {
          worldTension: 90,
        }
      );
      if (phaseFor(def, state.phaseLevel)?.key === "rested") rested = true;
      let next = state;
      for (const event of events) {
        const response = event.fired.event.response;
        if (!response) continue;
        const outcome = response.outcomes.find((o) => o.outcomeId === response.defaultOutcomeId)!;
        next = applyConflictOutcome(def, next, outcome);
      }
      store.set(def.key, next);
    }
    expect(rested).toBe(true);
  });

  it.each(WAVE_DEFS)("$key can be contained early by its strongest lever", async (def) => {
    const onset = seeded(def, "onset", { pressure: 40, "member:UK": 1 });
    const once = applyConflictOutcome(def, onset, outcomeOf(def, "onset", "contained"));
    const twice = applyConflictOutcome(def, once, outcomeOf(def, "onset", "contained"));
    const result = await stepFrom(def, twice);
    expect(result.phase).toBe("recovery");
  });

  it.each(WAVE_DEFS)("$key escalates, relapses and rests before a new wave", async (def) => {
    expect((await stepFrom(def, seeded(def, "onset", { pressure: 90 }))).phase).toBe("peak");
    expect((await stepFrom(def, seeded(def, "peak", { recovery: 90 }))).phase).toBe("recovery");
    expect(
      (await stepFrom(def, seeded(def, "recovery", { pressure: 90, escalation: 50 }))).phase
    ).toBe("peak");
    const settled = await stepFrom(def, seeded(def, "recovery", { escalation: 0, recovery: 90 }));
    expect(settled.phase).toBe("rested");
    expect(settled.state.status).toBe("settled");
    const cooling = await stepFrom(def, {
      ...seeded(def, "rested", { recoveryTurns: 20, waveSignal: 1 }),
      status: "settled",
    });
    expect(cooling.phase).toBe("rested");
    const renewed = await stepFrom(def, {
      ...seeded(def, "rested", { recoveryTurns: 96, waveSignal: 1 }),
      status: "settled",
    });
    expect(renewed.phase).toBe("onset");
  });

  it("makes doing nothing the most damaging peak outcome for a harmful family", () => {
    const def = livingConflictDef(SECOND_PANDEMIC_KEY)!;
    const health = (outcomeId: string) =>
      outcomeOf(def, "peak", outcomeId).effectsByRole!.belligerent!.find(
        (effect) => effect.metricField === "publicHealth"
      )!.value;
    expect(Math.abs(health("unchecked"))).toBeGreaterThan(Math.abs(health("adapted")));
    expect(Math.abs(health("adapted"))).toBeGreaterThan(Math.abs(health("softened")));
    expect(Math.abs(health("softened"))).toBeGreaterThan(Math.abs(health("contained")));
  });
});
