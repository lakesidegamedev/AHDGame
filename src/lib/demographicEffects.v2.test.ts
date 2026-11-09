import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import type { StateDemographics } from "@/lib/db/types/demographics";
import type { DemographicEffect } from "@/lib/db/types/legislation";
// Side-effect import: populates stateCensusData so real Layer-1 cells derive.
import "@/lib/seeds/stateDemographics";
import { clearGranularElectorateCache } from "@/lib/demographics/granularElectorate";
import { censusStateLean } from "@/lib/demographics/censusLean";
import {
  LEAN_SHIFT_RATE_PER_TURN,
  LEAN_MAX_DEVIATION_FROM_BASELINE,
  TURNOUT_SHIFT_RATE_PER_TURN,
  TURNOUT_MAX_DEVIATION_FROM_BASELINE,
  LEAN_TURNOUT_DECAY_RATE_PER_TURN,
  calculateDemographicShiftsByTarget,
  calculateDurableDemographicShiftsByTarget,
  subtractDurableShifts,
  clampDemographicEffectMagnitude,
  applyBandedShift,
  applyBaselineDecay,
  buildDemographicUpdates,
  processAllStateDemographics,
} from "./demographicEffects";
import type { ActivePolicy, LegislationTypeMap } from "./policyEffects";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const FIXED_DATE = new Date("2026-01-01T00:00:00Z");
const NO_COLLEGE = "education:no_college";
const NC_PATH = "layer1PositionOverrides.education.no_college";

function makePolicy(overrides: Partial<ActivePolicy>): ActivePolicy {
  return {
    _id: "policy1",
    stateId: "PA",
    legislationTypeId: "leg1",
    economic: 0,
    social: 0,
    selectedOptionId: "opt1",
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    scopeMultiplier: 1.0,
    ...overrides,
  } as ActivePolicy;
}

function makeLegTypeMap(
  entries: Array<{ id: string; demographicEffects: DemographicEffect[] }>
): LegislationTypeMap {
  const map: LegislationTypeMap = new Map();
  for (const entry of entries) {
    map.set(entry.id, { _id: entry.id, demographicEffects: entry.demographicEffects } as never);
  }
  return map;
}

function makeDemographics(overrides?: Partial<StateDemographics>): StateDemographics {
  return {
    _id: "PA",
    countryId: "US",
    categoryWeights: {},
    groups: {},
    lastUpdated: FIXED_DATE,
    ...overrides,
  };
}

const empty = () => ({ economicLean: {}, socialLean: {}, turnout: {} });

const lean = (key: string, value: number) => ({ ...empty(), economicLean: { [key]: value } });

// ─── Magnitude clamp ────────────────────────────────────────────────────────

describe("clampDemographicEffectMagnitude", () => {
  it("defaults to 1 when absent or non-finite", () => {
    expect(clampDemographicEffectMagnitude(undefined)).toBe(1);
    expect(clampDemographicEffectMagnitude(Number.NaN)).toBe(1);
    expect(clampDemographicEffectMagnitude(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("clamps to [0.25, 3]", () => {
    expect(clampDemographicEffectMagnitude(0.1)).toBe(0.25);
    expect(clampDemographicEffectMagnitude(1.5)).toBe(1.5);
    expect(clampDemographicEffectMagnitude(50)).toBe(3);
  });
});

// ─── Shift routing ──────────────────────────────────────────────────────────

describe("calculateDemographicShiftsByTarget", () => {
  const bucket = (target: DemographicEffect["target"], extra?: Partial<DemographicEffect>) =>
    ({
      dim: "education",
      bucket: "no_college",
      target,
      direction: 1,
      ...extra,
    }) as DemographicEffect;

  it("computes lean shifts at LEAN_SHIFT_RATE_PER_TURN with the strength/scope scaling", () => {
    const legTypeMap = makeLegTypeMap([
      { id: "leg1", demographicEffects: [bucket("economicLean")] },
    ]);
    const full = calculateDemographicShiftsByTarget([makePolicy({ economic: 3 })], legTypeMap)
      .economicLean[NO_COLLEGE];
    expect(full).toBeCloseTo(LEAN_SHIFT_RATE_PER_TURN, 10);

    const half = calculateDemographicShiftsByTarget(
      [makePolicy({ economic: 1.5, scopeMultiplier: 0.5 })],
      legTypeMap
    ).economicLean[NO_COLLEGE];
    expect(half).toBeCloseTo(LEAN_SHIFT_RATE_PER_TURN * 0.25, 10);
  });

  it("a max-strength state law crosses 1.0 lean within 20-40 turns", () => {
    const turns = 1 / LEAN_SHIFT_RATE_PER_TURN;
    expect(turns).toBeGreaterThanOrEqual(20);
    expect(turns).toBeLessThanOrEqual(40);
  });

  it("computes socialLean and turnout channels independently", () => {
    const legTypeMap = makeLegTypeMap([
      { id: "leg1", demographicEffects: [bucket("socialLean"), bucket("turnout")] },
    ]);
    const shifts = calculateDemographicShiftsByTarget([makePolicy({ economic: 3 })], legTypeMap);
    expect(shifts.economicLean).toEqual({});
    expect(shifts.socialLean[NO_COLLEGE]).toBeCloseTo(LEAN_SHIFT_RATE_PER_TURN, 10);
    expect(shifts.turnout[NO_COLLEGE]).toBeCloseTo(TURNOUT_SHIFT_RATE_PER_TURN, 10);
  });

  it("applies the magnitude multiplier, clamped to [0.25, 3]", () => {
    const at = (magnitude: number) =>
      calculateDemographicShiftsByTarget(
        [makePolicy({ economic: 3 })],
        makeLegTypeMap([
          { id: "leg1", demographicEffects: [bucket("economicLean", { magnitude })] },
        ])
      ).economicLean[NO_COLLEGE];
    expect(at(2)).toBeCloseTo(LEAN_SHIFT_RATE_PER_TURN * 2, 10);
    expect(at(99)).toBeCloseTo(LEAN_SHIFT_RATE_PER_TURN * 3, 10);
    expect(at(0.01)).toBeCloseTo(LEAN_SHIFT_RATE_PER_TURN * 0.25, 10);
  });

  it("negative policy strength flips the shift direction", () => {
    const shifts = calculateDemographicShiftsByTarget(
      [makePolicy({ economic: -3 })],
      makeLegTypeMap([{ id: "leg1", demographicEffects: [bucket("economicLean")] }])
    );
    expect(shifts.economicLean[NO_COLLEGE]).toBeCloseTo(-LEAN_SHIFT_RATE_PER_TURN, 10);
  });

  it("ignores population effects and effects that name only a voter group", () => {
    const legTypeMap = makeLegTypeMap([
      {
        id: "leg1",
        demographicEffects: [
          bucket(undefined),
          bucket("population"),
          { groupId: "union_trades", target: "economicLean", direction: 1 },
        ],
      },
    ]);
    const shifts = calculateDemographicShiftsByTarget([makePolicy({ economic: 3 })], legTypeMap);
    expect(shifts).toEqual(empty());
  });

  it("is deterministic for the same input", () => {
    const legTypeMap = makeLegTypeMap([{ id: "leg1", demographicEffects: [bucket("turnout")] }]);
    const results = Array.from({ length: 5 }, () =>
      JSON.stringify(calculateDemographicShiftsByTarget([makePolicy({ economic: 2 })], legTypeMap))
    );
    expect(new Set(results).size).toBe(1);
  });
});

// ─── Band clamp + decay primitives ──────────────────────────────────────────

describe("applyBandedShift", () => {
  it("caps cumulative deviation at baseline + maxDeviation", () => {
    const next = applyBandedShift(-1.6, -3, 2, LEAN_MAX_DEVIATION_FROM_BASELINE, -5, 5);
    expect(next).toBe(-1.5); // baseline −3 + band 1.5
  });

  it("caps at baseline − maxDeviation for negative shifts", () => {
    const next = applyBandedShift(-4.4, -3, -2, LEAN_MAX_DEVIATION_FROM_BASELINE, -5, 5);
    expect(next).toBe(-4.5);
  });

  it("never snaps a value already outside the band inward", () => {
    // Seeded/admin value −0.5 with baseline −3 is above the band edge (−1.5).
    const pushedOut = applyBandedShift(-0.5, -3, 0.1, LEAN_MAX_DEVIATION_FROM_BASELINE, -5, 5);
    expect(pushedOut).toBe(-0.5); // cannot move further out

    const pulledBack = applyBandedShift(-0.5, -3, -0.1, LEAN_MAX_DEVIATION_FROM_BASELINE, -5, 5);
    expect(pulledBack).toBeCloseTo(-0.6, 9); // moving back toward the band is allowed
  });

  it("respects the absolute lean bounds (±5)", () => {
    expect(applyBandedShift(4.9, 4.5, 2, LEAN_MAX_DEVIATION_FROM_BASELINE, -5, 5)).toBe(5);
    expect(applyBandedShift(-4.9, -4.5, -2, LEAN_MAX_DEVIATION_FROM_BASELINE, -5, 5)).toBe(-5);
  });

  it("respects the absolute turnout bounds (0-100)", () => {
    expect(applyBandedShift(95, 92, 20, TURNOUT_MAX_DEVIATION_FROM_BASELINE, 0, 100)).toBe(100);
    expect(applyBandedShift(4, 8, -20, TURNOUT_MAX_DEVIATION_FROM_BASELINE, 0, 100)).toBe(0);
  });

  it("cumulative lean deviation converges to the band edge, never past it", () => {
    let lean = -3;
    const baseline = -3;
    for (let turn = 0; turn < 100; turn++) {
      lean = applyBandedShift(
        lean,
        baseline,
        LEAN_SHIFT_RATE_PER_TURN,
        LEAN_MAX_DEVIATION_FROM_BASELINE,
        -5,
        5
      );
      expect(lean - baseline).toBeLessThanOrEqual(LEAN_MAX_DEVIATION_FROM_BASELINE + 1e-9);
    }
    expect(lean).toBeCloseTo(baseline + LEAN_MAX_DEVIATION_FROM_BASELINE, 9);
  });

  it("cumulative turnout deviation converges to its band edge", () => {
    let turnout = 63;
    const baseline = 63;
    for (let turn = 0; turn < 200; turn++) {
      turnout = applyBandedShift(
        turnout,
        baseline,
        TURNOUT_SHIFT_RATE_PER_TURN,
        TURNOUT_MAX_DEVIATION_FROM_BASELINE,
        0,
        100
      );
    }
    expect(turnout).toBeCloseTo(baseline + TURNOUT_MAX_DEVIATION_FROM_BASELINE, 9);
  });
});

describe("applyBaselineDecay", () => {
  it("decays proportionally toward baseline at 0.25%/turn of remaining distance", () => {
    const next = applyBaselineDecay(-1.5, -3);
    expect(next).toBeCloseTo(-1.5 - 1.5 * LEAN_TURNOUT_DECAY_RATE_PER_TURN, 9);
  });

  it("decays from both sides of baseline", () => {
    expect(applyBaselineDecay(-4, -3)).toBeGreaterThan(-4);
    expect(applyBaselineDecay(-2, -3)).toBeLessThan(-2);
  });

  it("returns the value unchanged at/near baseline (no write churn)", () => {
    expect(applyBaselineDecay(-3, -3)).toBe(-3);
    expect(applyBaselineDecay(-3.00005, -3)).toBe(-3.00005);
  });

  it("never overshoots baseline", () => {
    let value = 73;
    for (let turn = 0; turn < 5000; turn++) {
      value = applyBaselineDecay(value, 63);
      expect(value).toBeGreaterThanOrEqual(63);
    }
  });
});

// ─── Durable legislation through processAllStateDemographics (persisting fake DB) ───

/**
 * Minimal PERSISTING fake `Db`: needed here because proving "durable, no decay
 * after repeal" requires observing state across MANY simulated turns, the
 * same reason `eraCheckpointTurn.test.ts` builds one for
 * `processEraCheckpointsTurn`.
 */
function setDeep(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  for (const part of parts) {
    if (part === "__proto__" || part === "constructor" || part === "prototype") return;
  }
  let current = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (key === "__proto__" || key === "constructor" || key === "prototype") return;
    const existing = current[key];
    if (existing === null || typeof existing !== "object") {
      current[key] = /^(0|[1-9]\d*)$/.test(parts[i + 1]) ? [] : {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

interface FakeBulkOp {
  updateOne: { filter: { _id: string }; update: { $set: Record<string, unknown> } };
}

function createPersistingFakeDb(fixtures: {
  states: Array<{ _id: string; countryId: string }>;
  statePolicies: Array<Record<string, unknown>>;
  legislationTypes: Array<Record<string, unknown>>;
  stateDemographics: StateDemographics[];
  demographicDefaults: StateDemographics[];
  gameState: Record<string, unknown>;
}) {
  const stores = {
    states: new Map(fixtures.states.map((d) => [d._id, d as Record<string, unknown>])),
    statePolicies: new Map(fixtures.statePolicies.map((d, i) => [String(d._id ?? `p${i}`), d])),
    legislationTypes: new Map(fixtures.legislationTypes.map((d) => [String(d._id), d])),
    stateDemographics: new Map(
      fixtures.stateDemographics.map((d) => [d._id, d as unknown as Record<string, unknown>])
    ),
    demographicDefaults: new Map(
      fixtures.demographicDefaults.map((d) => [d._id, d as unknown as Record<string, unknown>])
    ),
  };
  let gameStateDoc: Record<string, unknown> = { ...fixtures.gameState };

  function makeCollection(name: keyof typeof stores) {
    const store = stores[name];
    return {
      find: () => ({ toArray: async () => [...store.values()] }),
      bulkWrite: async (ops: FakeBulkOp[]) => {
        for (const op of ops) {
          const doc = store.get(op.updateOne.filter._id);
          if (!doc) continue;
          for (const [path, value] of Object.entries(op.updateOne.update.$set)) {
            setDeep(doc as Record<string, unknown>, path, value);
          }
        }
        return { modifiedCount: ops.length, matchedCount: ops.length };
      },
    };
  }

  const db = {
    collection: (name: string) => {
      if (name === "gameState") {
        return {
          findOne: async () => gameStateDoc,
          bulkWrite: async () => ({}),
        };
      }
      // Media editorial flag lives here; absent means off.
      if (name === "gameConfig") return { findOne: async () => null };
      return makeCollection(name as keyof typeof stores);
    },
  } as unknown as Db;

  return { db, stores, setGameState: (doc: Record<string, unknown>) => (gameStateDoc = doc) };
}

// ─── buildDemographicUpdates ────────────────────────────────────────────────

describe("buildDemographicUpdates", () => {
  const drifted = (economicLean: number, socialLean = 0) =>
    makeDemographics({
      layer1PositionOverrides: { education: { no_college: { economicLean, socialLean } } },
    });

  it("drifts lean and turnout overlays from zero when a law is active", () => {
    const updates = buildDemographicUpdates(makeDemographics(), {
      economicLean: { [NO_COLLEGE]: LEAN_SHIFT_RATE_PER_TURN },
      socialLean: {},
      turnout: { "age:young": TURNOUT_SHIFT_RATE_PER_TURN },
    });
    expect(updates[`${NC_PATH}.economicLean`]).toBeCloseTo(LEAN_SHIFT_RATE_PER_TURN, 10);
    expect(updates["layer1TurnoutOverrides.age.young"]).toBeCloseTo(
      TURNOUT_SHIFT_RATE_PER_TURN,
      10
    );
    expect(Object.keys(updates).some((k) => k.startsWith("groups."))).toBe(false);
  });

  it("a bucket with no active shift decays toward zero", () => {
    const updates = buildDemographicUpdates(drifted(-1.5), empty());
    expect(updates[`${NC_PATH}.economicLean`]).toBeCloseTo(
      -1.5 + 1.5 * LEAN_TURNOUT_DECAY_RATE_PER_TURN,
      9
    );
  });

  it("an active shift suppresses decay for that bucket and axis only", () => {
    const updates = buildDemographicUpdates(drifted(1, 1), lean(NO_COLLEGE, 0.02));
    expect(updates[`${NC_PATH}.economicLean`]).toBeCloseTo(1.02, 9);
    expect(updates[`${NC_PATH}.socialLean`]).toBeCloseTo(1 - LEAN_TURNOUT_DECAY_RATE_PER_TURN, 9);
  });

  it("sustained max shift stays inside the deviation band", () => {
    let doc = makeDemographics();
    for (let turn = 0; turn < 200; turn++) {
      const updates = buildDemographicUpdates(doc, lean(NO_COLLEGE, LEAN_SHIFT_RATE_PER_TURN));
      const next = updates[`${NC_PATH}.economicLean`];
      if (next === undefined) break;
      doc = drifted(next);
      expect(next).toBeLessThanOrEqual(LEAN_MAX_DEVIATION_FROM_BASELINE + 1e-9);
    }
    expect(doc.layer1PositionOverrides?.education?.no_college?.economicLean).toBeCloseTo(
      LEAN_MAX_DEVIATION_FROM_BASELINE,
      9
    );
  });

  describe("newsroom pull", () => {
    const buckets = ["race:black", "race:white"];

    it("adds the same step to every bucket of the dimension on each axis", () => {
      const updates = buildDemographicUpdates(
        makeDemographics(),
        empty(),
        { economic: 0.004, social: -0.002 },
        buckets
      );
      for (const dimBucket of ["race.black", "race.white"]) {
        expect(updates[`layer1PositionOverrides.${dimBucket}.economicLean`]).toBeCloseTo(0.004, 10);
        expect(updates[`layer1PositionOverrides.${dimBucket}.socialLean`]).toBeCloseTo(-0.002, 10);
      }
    });

    it("rides on top of drift written the same turn", () => {
      const updates = buildDemographicUpdates(
        makeDemographics(),
        lean("race:black", 0.03),
        { economic: 0.004, social: 0 },
        buckets
      );
      expect(updates["layer1PositionOverrides.race.black.economicLean"]).toBeCloseTo(0.034, 10);
      expect(updates["layer1PositionOverrides.race.white.economicLean"]).toBeCloseTo(0.004, 10);
    });

    it("stays on the lean axis", () => {
      const doc = makeDemographics({
        layer1PositionOverrides: { race: { black: { economicLean: 4.999, socialLean: 0 } } },
      });
      const updates = buildDemographicUpdates(doc, empty(), { economic: 0.5, social: 0 }, [
        "race:black",
      ]);
      expect(updates["layer1PositionOverrides.race.black.economicLean"]).toBe(5);
    });

    it("writes nothing for a zero pull", () => {
      expect(
        buildDemographicUpdates(makeDemographics(), empty(), { economic: 0, social: 0 }, buckets)
      ).toEqual({});
    });
  });
});

// ─── Durable ("permanent") legislation ──────────────────────────────────────

describe("calculateDurableDemographicShiftsByTarget", () => {
  const effect = (extra: Partial<DemographicEffect>): DemographicEffect =>
    ({ dim: "race", bucket: "white", direction: 1, ...extra }) as DemographicEffect;
  const run = (effects: DemographicEffect[], policies?: ActivePolicy[]) =>
    calculateDurableDemographicShiftsByTarget(
      policies ?? [makePolicy({ legislationTypeId: "landmark", economic: 3 })],
      makeLegTypeMap([{ id: "landmark", demographicEffects: effects }])
    );

  it("isolates only permanent:true lean-axis effects, ignoring ordinary ones", () => {
    const durable = run([
      effect({ target: "economicLean", permanent: true }),
      effect({ target: "socialLean" }),
    ]);
    expect(durable.economicLean["race:white"]).toBeCloseTo(LEAN_SHIFT_RATE_PER_TURN, 9);
    expect(durable.socialLean["race:white"]).toBeUndefined();
  });

  it("excludes permanent population effects", () => {
    expect(run([effect({ target: "population", permanent: true })])).toEqual(empty());
  });

  it("includes permanent turnout effects (the enfranchisement channel)", () => {
    const durable = run([effect({ target: "turnout", permanent: true })]);
    expect(durable.turnout["race:white"]).toBeCloseTo(TURNOUT_SHIFT_RATE_PER_TURN, 9);
  });

  it("nets opposing durable effects on the same bucket and axis", () => {
    const legTypeMap = makeLegTypeMap([
      { id: "a", demographicEffects: [effect({ target: "economicLean", permanent: true })] },
      {
        id: "b",
        demographicEffects: [
          effect({ target: "economicLean", permanent: true, direction: -1, magnitude: 3 }),
        ],
      },
    ]);
    const durable = calculateDurableDemographicShiftsByTarget(
      [
        makePolicy({ legislationTypeId: "a", economic: 3 }),
        makePolicy({ legislationTypeId: "b", economic: 3 }),
      ],
      legTypeMap
    );
    expect(durable.economicLean["race:white"]).toBeCloseTo(-2 * LEAN_SHIFT_RATE_PER_TURN, 9);
  });
});

describe("subtractDurableShifts", () => {
  it("removes the durable portion from the total, leaving the temporary rate", () => {
    const total = {
      economicLean: { a: 0.05, b: 0.02 },
      socialLean: {},
      turnout: { a: 0.4 },
    };
    const durable = { economicLean: { a: 0.035 }, socialLean: {}, turnout: { a: 0.25 } };
    const temporary = subtractDurableShifts(total, durable);
    expect(temporary.economicLean.a).toBeCloseTo(0.015, 10);
    expect(temporary.economicLean.b).toBe(0.02);
    expect(temporary.turnout.a).toBeCloseTo(0.15, 10);
  });

  it("is a no-op when durable is empty", () => {
    const total = { economicLean: { a: 0.03 }, socialLean: {}, turnout: {} };
    expect(subtractDurableShifts(total, empty())).toEqual(total);
  });
});

// ─── The turn phase ─────────────────────────────────────────────────────────

function stateDoc(id: string, countryId = "US"): StateDemographics {
  return makeDemographics({ _id: id, countryId: countryId as StateDemographics["countryId"] });
}

const law = (id: string, effects: Array<Record<string, unknown>>) => ({
  _id: id,
  demographicEffects: effects,
});

const policyOn = (
  stateId: string,
  legislationTypeId: string,
  id = `p-${stateId}-${legislationTypeId}`
) => ({
  _id: id,
  stateId,
  legislationTypeId,
  economic: 3,
  social: 0,
  effectDirection: 1,
  enactedAt: FIXED_DATE,
  enactedTurn: 1,
  policyOptionId: "opt",
  policyOptionIndex: 6,
});

function world(opts: {
  stateIds?: string[];
  policies?: Array<Record<string, unknown>>;
  laws?: Array<Record<string, unknown>>;
  docs?: StateDemographics[];
  defaults?: StateDemographics[];
  countryId?: string;
}) {
  const stateIds = opts.stateIds ?? ["AL"];
  const countryId = opts.countryId ?? "US";
  return createPersistingFakeDb({
    states: stateIds.map((s) => ({ _id: s, countryId })),
    statePolicies: opts.policies ?? [],
    legislationTypes: opts.laws ?? [],
    stateDemographics: opts.docs ?? stateIds.map((s) => stateDoc(s, countryId)),
    demographicDefaults: opts.defaults ?? stateIds.map((s) => stateDoc(s, countryId)),
    gameState: { _id: "current", preset: "2019-default" },
  });
}

const overlay = (
  doc: unknown,
  file: "lean" | "turnout",
  dim: string,
  bucket: string,
  axis = "economicLean"
) => {
  const d = doc as StateDemographics;
  return file === "lean"
    ? (d.layer1PositionOverrides?.[dim]?.[bucket] as Record<string, number> | undefined)?.[axis]
    : d.layer1TurnoutOverrides?.[dim]?.[bucket];
};

async function runTurns(db: Db, turns: number) {
  for (let turn = 0; turn < turns; turn++) await processAllStateDemographics(db);
}

describe("processAllStateDemographics", () => {
  const tempLaw = law("temp-law", [
    { dim: "race", bucket: "white", target: "economicLean", direction: 1 },
    { dim: "age", bucket: "young", target: "turnout", direction: 1 },
  ]);

  it("drifts bucket overlays, refreshes the cached leans and writes no group fields", async () => {
    clearGranularElectorateCache();
    const { db, stores } = world({
      laws: [tempLaw],
      policies: [policyOn("AL", "temp-law")],
    });

    const updated = await processAllStateDemographics(db);

    expect(updated).toBe(1);
    const doc = stores.stateDemographics.get("AL") as unknown as StateDemographics;
    expect(overlay(doc, "lean", "race", "white")).toBeCloseTo(LEAN_SHIFT_RATE_PER_TURN, 9);
    expect(overlay(doc, "turnout", "age", "young")).toBeCloseTo(TURNOUT_SHIFT_RATE_PER_TURN, 9);
    expect(doc.groups).toEqual({});
    expect(typeof doc.cachedEconomicLean).toBe("number");
    expect(Number.isFinite(doc.cachedSocialLean)).toBe(true);
    const stateRow = stores.states.get("AL") as Record<string, unknown>;
    expect(stateRow.cachedEconomicLean).toBe(doc.cachedEconomicLean);
  });

  it("the cached lean is the census lean of the drifted document", async () => {
    clearGranularElectorateCache();
    const { db, stores } = world({
      laws: [tempLaw],
      policies: [policyOn("AL", "temp-law")],
    });
    await runTurns(db, 30);
    const doc = stores.stateDemographics.get("AL") as unknown as StateDemographics;
    const census = censusStateLean(doc, {
      countryId: "US",
      stateId: "AL",
      preset: "2019-default",
    });
    expect(doc.cachedEconomicLean).toBe(census.economicLean);
    expect(doc.cachedSocialLean).toBe(census.socialLean);
  });

  it("is deterministic across identical worlds", async () => {
    const run = async () => {
      clearGranularElectorateCache();
      const { db, stores } = world({ laws: [tempLaw], policies: [policyOn("AL", "temp-law")] });
      await runTurns(db, 10);
      const { lastUpdated: _lastUpdated, ...rest } = stores.stateDemographics.get("AL") as Record<
        string,
        unknown
      >;
      return JSON.stringify(rest);
    };
    expect(await run()).toBe(await run());
  });

  it("policy-less states decay stored drift toward zero", async () => {
    const drifted = {
      ...stateDoc("AL"),
      layer1PositionOverrides: { race: { white: { economicLean: -1.5, socialLean: 0 } } },
    };
    const { db, stores } = world({ docs: [drifted] });
    await processAllStateDemographics(db);
    const doc = stores.stateDemographics.get("AL");
    expect(overlay(doc, "lean", "race", "white")).toBeCloseTo(
      -1.5 + 1.5 * LEAN_TURNOUT_DECAY_RATE_PER_TURN,
      9
    );
  });

  it("a region without a census keeps working and gets no cached lean", async () => {
    const { db, stores } = world({
      stateIds: ["ZZ1"],
      countryId: "ZZ",
      docs: [
        {
          ...stateDoc("ZZ1", "ZZ"),
          layer1PositionOverrides: { race: { white: { economicLean: 1, socialLean: 0 } } },
        },
      ],
    });
    await expect(processAllStateDemographics(db)).resolves.toBe(1);
    const doc = stores.stateDemographics.get("ZZ1") as unknown as StateDemographics;
    expect(doc.cachedEconomicLean).toBeUndefined();
  });

  describe("durable ('permanent') legislation", () => {
    const durableLaw = law("landmark", [
      { dim: "race", bucket: "white", target: "economicLean", direction: 1, permanent: true },
      { dim: "race", bucket: "black", target: "turnout", direction: 1, permanent: true },
    ]);

    it("relocates the base overlay on the defaults doc and survives repeal", async () => {
      clearGranularElectorateCache();
      const { db, stores } = world({
        laws: [durableLaw],
        policies: [policyOn("AL", "landmark")],
      });
      await runTurns(db, 60);

      const base = overlay(stores.demographicDefaults.get("AL"), "lean", "race", "white");
      expect(base).toBeGreaterThan(0);
      expect(base).toBeCloseTo(60 * LEAN_SHIFT_RATE_PER_TURN, 6);
      expect(overlay(stores.demographicDefaults.get("AL"), "turnout", "race", "black")).toBeCloseTo(
        60 * TURNOUT_SHIFT_RATE_PER_TURN,
        6
      );
      // Durable shifts leave no temporary deviation on the live doc.
      expect(overlay(stores.stateDemographics.get("AL"), "lean", "race", "white")).toBeUndefined();

      stores.statePolicies.clear();
      await runTurns(db, 40);
      expect(overlay(stores.demographicDefaults.get("AL"), "lean", "race", "white")).toBeCloseTo(
        base as number,
        9
      );
    });

    it("is national in scope: a federal law moves every state identically", async () => {
      const { db, stores } = world({
        stateIds: ["AL", "CA", "NY"],
        laws: [durableLaw],
        policies: [policyOn("federal", "landmark")],
      });
      await runTurns(db, 50);
      const values = ["AL", "CA", "NY"].map((s) =>
        overlay(stores.demographicDefaults.get(s), "lean", "race", "white")
      );
      expect(values[0]).toBeGreaterThan(0);
      expect(values[1]).toBeCloseTo(values[0] as number, 9);
      expect(values[2]).toBeCloseTo(values[0] as number, 9);
    });

    it("is beatable by a stronger opposing durable law", async () => {
      const opposing = law("opposing", [
        {
          dim: "race",
          bucket: "white",
          target: "economicLean",
          direction: -1,
          magnitude: 3,
          permanent: true,
        },
      ]);
      const { db, stores } = world({
        laws: [durableLaw, opposing],
        policies: [policyOn("AL", "landmark"), policyOn("AL", "opposing")],
      });
      await runTurns(db, 60);
      const base = overlay(stores.demographicDefaults.get("AL"), "lean", "race", "white") as number;
      expect(base).toBeLessThan(0);
    });
  });
});
