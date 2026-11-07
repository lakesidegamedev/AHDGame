import type { Db } from "mongodb";
import { describe, expect, it } from "vitest";
import { driveConflictTurn, type ConflictParticipants } from "./driver";
import { applyConflictOutcome, normalizeConflictState, phaseFor } from "./engine";
import { allLivingConflictDefs, livingConflictDef } from "./registry";
import { AI_LABOUR_SHOCK_DEF } from "./defs/aiLabourShock";
import { PACIFIC_STRAIT_DEF } from "./defs/pacificStrait";
import { INFRASTRUCTURE_CYBERATTACK_DEF } from "./defs/infrastructureCyberattack";
import { FUTURE_CONFLICT_RESTING_PHASES, planFutureConflictTurn } from "./futureConflicts";
import { resolveConflictParticipants } from "./rules/participants";
import { build2027ConflictOpening } from "./initialState2027";
import type { LivingConflictDef, LivingConflictState } from "./types";

function fakeDb(seed: Record<string, Partial<LivingConflictState>> = {}) {
  const store = new Map<string, unknown>(Object.entries(seed));
  const db = {
    collection(name: string) {
      return {
        async findOne(q: { defKey: string }) {
          return name === "livingConflicts" ? (store.get(q.defKey) ?? null) : null;
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

const memberParticipants = (members: string[]): ConflictParticipants => ({
  belligerents: members,
  neighbors: [],
  blocMembers: [],
  bystanders: [],
});

const WORLD = new Set(["US", "CN", "UK", "DE", "FR", "JP", "KR", "AU", "IN", "BR"]);

function seeded(
  def: LivingConflictDef,
  phaseKey: string,
  tracks: Record<string, number>,
  status: LivingConflictState["status"] = "active"
): LivingConflictState {
  const phase = def.phases.find((candidate) => candidate.key === phaseKey)!;
  return normalizeConflictState(def, {
    defKey: def.key,
    hasOpened: true,
    status,
    phaseLevel: phase.level,
    phaseTurns: 1,
    totalTurns: 1,
    tracks,
  });
}

/** One driven turn from a seeded state, returning the next phase key. */
async function stepFrom(
  def: LivingConflictDef,
  state: LivingConflictState,
  participants: ConflictParticipants,
  observed: Record<string, number> = {},
  year = 2032
) {
  const { db } = fakeDb({ [def.key]: state });
  const result = await driveConflictTurn(db, def, participants, 5000, year, 0, {}, observed);
  return { state: result.state, phase: phaseFor(def, result.state.phaseLevel)?.key, result };
}

/** Run with nobody responding: every response window takes its default outcome. */
async function runWithoutPolicy(
  def: LivingConflictDef,
  participants: ConflictParticipants,
  observed: Record<string, number>,
  maxTurns: number
): Promise<{ phase: string | undefined; turns: number; visited: Set<string> }> {
  const opening = normalizeConflictState(def, {
    defKey: def.key,
    hasOpened: true,
    status: "active",
    phaseLevel: 1,
    tracks: { "member:UK": 1 },
  });
  const { db, store } = fakeDb({ [def.key]: opening });
  const resting = FUTURE_CONFLICT_RESTING_PHASES[def.key];
  const visited = new Set<string>();
  for (let turn = 1; turn <= maxTurns; turn++) {
    const { state, events } = await driveConflictTurn(
      db,
      def,
      participants,
      turn,
      2032,
      0,
      {},
      observed
    );
    const phase = phaseFor(def, state.phaseLevel)?.key;
    if (phase) visited.add(phase);
    if (phase && resting.includes(phase)) return { phase, turns: turn, visited };
    let next = state;
    for (const event of events) {
      const response = event.fired.event.response;
      if (!response) continue;
      const outcome = response.outcomes.find(
        (item) => item.outcomeId === response.defaultOutcomeId
      )!;
      next = applyConflictOutcome(def, next, outcome);
    }
    store.set(def.key, next);
  }
  return { phase: undefined, turns: maxTurns, visited };
}

function outcomeOf(def: LivingConflictDef, phaseKey: string, outcomeId: string) {
  return def.phases
    .find((phase) => phase.key === phaseKey)!
    .events.find((event) => event.response)!
    .response!.outcomes.find((outcome) => outcome.outcomeId === outcomeId)!;
}

describe("post-2027 living-conflict registry", () => {
  it("registers the three families after every older family", () => {
    const keys = allLivingConflictDefs().map((def) => def.key);
    expect(keys.slice(-3)).toEqual([
      "ai_labour_shock",
      "pacific_strait_crisis",
      "infrastructure_cyberattack",
    ]);
    expect(livingConflictDef("ai_labour_shock")?.fromYear).toBe(2029);
    expect(livingConflictDef("pacific_strait_crisis")).toMatchObject({
      fromYear: 2028,
      untilYear: 2045,
    });
    expect(livingConflictDef("infrastructure_cyberattack")?.fromYear).toBe(2028);
  });

  it.each([AI_LABOUR_SHOCK_DEF, PACIFIC_STRAIT_DEF, INFRASTRUCTURE_CYBERATTACK_DEF])(
    "$key is inert in the 2027 opening and needs live pressure to open",
    async (def) => {
      const opening = build2027ConflictOpening(def, { countries: WORLD, populations: {} });
      expect(opening).toMatchObject({ hasOpened: false, status: "dormant" });
      const { db } = fakeDb({ [def.key]: opening });
      const participants =
        def.key === PACIFIC_STRAIT_DEF.key
          ? resolveConflictParticipants(def, WORLD)
          : memberParticipants(["UK"]);
      const early = await driveConflictTurn(db, def, participants, 1249, 2027, 5);
      expect(early.state.hasOpened).toBe(false);
      const noPressure = await driveConflictTurn(db, def, participants, 1250, 2030, 0);
      expect(noPressure.state.hasOpened).toBe(false);
      expect(def.minimumOpeningPressure).toBe(1);
      for (const phase of def.phases)
        for (const event of phase.events) expect(event.headline).not.toMatch(/[–—]/);
    }
  );

  it.each([AI_LABOUR_SHOCK_DEF, PACIFIC_STRAIT_DEF, INFRASTRUCTURE_CYBERATTACK_DEF])(
    "$key resolves with no player or government action",
    async (def) => {
      const participants =
        def.key === PACIFIC_STRAIT_DEF.key
          ? resolveConflictParticipants(def, WORLD)
          : memberParticipants(["UK"]);
      const run = await runWithoutPolicy(def, participants, { worldTension: 90 }, 600);
      expect(FUTURE_CONFLICT_RESTING_PHASES[def.key]).toContain(run.phase);
    }
  );
});

describe("AI labour shock", () => {
  const def = AI_LABOUR_SHOCK_DEF;
  const uk = memberParticipants(["UK"]);

  it("opens on a hit after 2029 with the hit country as its belligerent", async () => {
    const { db } = fakeDb();
    const opened = await driveConflictTurn(
      db,
      def,
      uk,
      1700,
      2030,
      1,
      {},
      {
        "member:UK": 1,
        waveSignal: 1,
      }
    );
    expect(opened.state).toMatchObject({ hasOpened: true, phaseLevel: 1, openedYear: 2030 });
    expect(opened.state.tracks?.["member:UK"]).toBe(1);
    expect(opened.events.map((event) => event.affectedNations)).toEqual([["UK"]]);
    const before = fakeDb();
    const tooEarly = await driveConflictTurn(before.db, def, uk, 1600, 2028, 1);
    expect(tooEarly.state.hasOpened).toBe(false);
  });

  it("escalates into a populist backlash and de-escalates when it fades", async () => {
    const up = await stepFrom(def, seeded(def, "displacement", { backlash: 60 }), uk);
    expect(up.phase).toBe("backlash");
    const down = await stepFrom(def, seeded(def, "backlash", { backlash: 20 }), uk);
    expect(down.phase).toBe("displacement");
  });

  it("resolves as reformed, absorbed or entrenched", async () => {
    const reform = applyConflictOutcome(
      def,
      seeded(def, "displacement", { reform: 30, displacement: 50 }),
      outcomeOf(def, "displacement", "reform_package")
    );
    const reformed = await stepFrom(def, reform, uk);
    expect(reformed.phase).toBe("reformed");
    expect(reformed.state.status).toBe("settled");
    const absorbed = await stepFrom(def, seeded(def, "displacement", { adjustment: 80 }), uk);
    expect(absorbed.phase).toBe("absorbed");
    const entrenched = await stepFrom(
      def,
      seeded(def, "backlash", { adjustment: 80, backlash: 70 }),
      uk
    );
    expect(entrenched.phase).toBe("entrenched");
  });

  it("rests before a new wave can begin", async () => {
    const cooling = await stepFrom(
      def,
      seeded(def, "absorbed", { recoveryTurns: 20 }, "settled"),
      uk,
      { waveSignal: 1 }
    );
    expect(cooling.phase).toBe("absorbed");
    const renewed = await stepFrom(
      def,
      seeded(def, "absorbed", { recoveryTurns: 96 }, "settled"),
      uk,
      { waveSignal: 1 }
    );
    expect(renewed.phase).toBe("displacement");
    expect(renewed.state.status).toBe("active");
  });
});

describe("Pacific strait crisis", () => {
  const def = PACIFIC_STRAIT_DEF;
  const participants = resolveConflictParticipants(def, WORLD);

  it("names China as claimant, the United States as guarantor and counts both as principals", () => {
    expect(participants).toMatchObject({ belligerents: ["CN"], backerA: "US" });
    expect(def.severeRoles).toEqual(["belligerent", "backer_a"]);
  });

  it("does not open without the claimant or after 2045", async () => {
    const { db } = fakeDb();
    const missing = await driveConflictTurn(
      db,
      def,
      resolveConflictParticipants(def, new Set(["US", "JP"])),
      2000,
      2032,
      1
    );
    expect(missing.state.hasOpened).toBe(false);
    const late = await driveConflictTurn(db, def, participants, 2001, 2046, 1);
    expect(late.state.hasOpened).toBe(false);
  });

  it("climbs the ladder only while world tension stays high", async () => {
    const hot = await stepFrom(def, seeded(def, "posturing", { brinkmanship: 45 }), participants, {
      worldTension: 60,
    });
    expect(hot.phase).toBe("exclusion_zone");
    const cool = await stepFrom(def, seeded(def, "posturing", { brinkmanship: 45 }), participants, {
      worldTension: 30,
    });
    expect(cool.phase).toBe("posturing");
    const quarantine = await stepFrom(
      def,
      seeded(def, "quarantine", { brinkmanship: 85 }),
      participants,
      { worldTension: 70 }
    );
    expect(quarantine.phase).toBe("standoff");
  });

  it("offers an off-ramp into talks from every rung", async () => {
    for (const rung of ["posturing", "exclusion_zone", "quarantine", "standoff"]) {
      const next = await stepFrom(
        def,
        seeded(def, rung, { brinkmanship: 85, talks: 55 }),
        participants,
        { worldTension: 90 }
      );
      expect(next.phase).toBe("talks");
      expect(next.state.status).toBe("negotiating");
    }
    const eased = await stepFrom(def, seeded(def, "standoff", { brinkmanship: 50 }), participants, {
      worldTension: 90,
    });
    expect(eased.phase).toBe("quarantine");
  });

  it("settles from talks and never forces a war", async () => {
    const opened = applyConflictOutcome(
      def,
      seeded(def, "talks", { talks: 55 }, "negotiating"),
      outcomeOf(def, "talks", "talks_open")
    );
    const settled = await stepFrom(def, opened, participants, { worldTension: 50 });
    expect(settled.phase).toBe("managed_peace");
    expect(settled.state.status).toBe("settled");
    for (const phase of def.phases)
      for (const event of phase.events) {
        for (const outcome of event.response?.outcomes ?? []) {
          expect(outcome.nextConflictStatus).toBeUndefined();
          expect(outcome.civilianLoss).toBeUndefined();
        }
      }
  });

  it("puts chip sanctions on the claimant and shocks electronics output", () => {
    const sanctions = outcomeOf(def, "quarantine", "sanctions_imposed");
    expect(sanctions.tradeSanction).toMatchObject({
      targetRole: "belligerent",
      commodity: "electronics",
    });
    const escalation = outcomeOf(def, "quarantine", "escalation");
    expect(
      escalation.effectsByRole?.neighbor?.some(
        (effect) => effect.sectorType === "technology" && effect.physicality === "physical"
      )
    ).toBe(true);
  });
});

describe("infrastructure cyberattack", () => {
  const def = INFRASTRUCTURE_CYBERATTACK_DEF;
  const uk = memberParticipants(["UK"]);

  it("escalates an unchecked intrusion into outages", async () => {
    const spread = applyConflictOutcome(
      def,
      seeded(def, "intrusion", { intrusion: 50 }),
      outcomeOf(def, "intrusion", "attack_spreads")
    );
    const outage = await stepFrom(def, spread, uk);
    expect(outage.phase).toBe("outage");
  });

  it("contains a hardened intrusion before it causes outages", async () => {
    const hardened = applyConflictOutcome(
      def,
      seeded(def, "intrusion", { intrusion: 50, hardening: 25 }),
      outcomeOf(def, "intrusion", "hardened")
    );
    const contained = await stepFrom(def, hardened, uk);
    expect(contained.phase).toBe("restoration");
  });

  it("recovers from outages and rests once systems are restored", async () => {
    const repaired = await stepFrom(def, seeded(def, "outage", { restoration: 40 }), uk);
    expect(repaired.phase).toBe("restoration");
    const restored = await stepFrom(
      def,
      seeded(def, "restoration", { outage: 5, restoration: 70 }),
      uk
    );
    expect(restored.phase).toBe("restored");
    expect(restored.state.status).toBe("settled");
  });

  it("charges outage damage only once systems are actually down", () => {
    const intrusion = outcomeOf(def, "intrusion", "attack_spreads");
    const outage = outcomeOf(def, "outage", "attack_spreads");
    expect(intrusion.effectsByRole?.belligerent).toHaveLength(1);
    expect(outage.effectsByRole?.belligerent?.length).toBeGreaterThan(1);
  });
});

describe("future conflict turn planning", () => {
  it("reads no signals and stays empty before a family's window", async () => {
    const { db } = fakeDb();
    const plan = await planFutureConflictTurn(db, AI_LABOUR_SHOCK_DEF, {
      turn: 1300,
      year: 2027,
      availableCountryIds: WORLD,
      regionCountryIds: WORLD,
      tension: 100,
      load: new Map(),
    });
    expect(plan.externalPressure).toBe(0);
    expect(plan.participants.belligerents).toEqual([]);
  });

  it("opens the strait only when a roll passes at high tension", async () => {
    const { db } = fakeDb();
    const context = {
      year: 2030,
      availableCountryIds: WORLD,
      regionCountryIds: WORLD,
      load: new Map<string, number>(),
    };
    const calm = await planFutureConflictTurn(db, PACIFIC_STRAIT_DEF, {
      ...context,
      turn: 1,
      tension: 20,
    });
    expect(calm.externalPressure).toBe(0);
    let opened = 0;
    for (let turn = 0; turn < 480; turn++) {
      const plan = await planFutureConflictTurn(db, PACIFIC_STRAIT_DEF, {
        ...context,
        turn,
        tension: 100,
      });
      opened += plan.externalPressure;
      expect(plan.observedTrackValues.worldTension).toBe(100);
    }
    // About 0.75 a year over ten years, from deterministic rolls.
    expect(opened).toBeGreaterThan(3);
    expect(opened).toBeLessThan(20);
    const blocked = await planFutureConflictTurn(db, PACIFIC_STRAIT_DEF, {
      ...context,
      turn: 1,
      tension: 100,
      load: new Map([["US", 2]]),
    });
    expect(blocked.externalPressure).toBe(0);
  });
});
