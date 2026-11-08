import { describe, expect, it } from "vitest";
import { makeDefinition } from "./testFixtures";
import { createCrisisInstance } from "./instance";
import { acceptLeverUses } from "./severity";
import {
  LEDGER_LIMIT,
  computeAccountability,
  electoralSwing,
  recordInaction,
  recordLeverUses,
  totalCostByHolder,
} from "./accountability";
import type { CrisisInstance } from "./types";

const def = makeDefinition();

function inst(extra: Partial<CrisisInstance> = {}): CrisisInstance {
  return { ...createCrisisInstance(def, 0), stage: "peak", severity: 60, ...extra };
}

describe("recordLeverUses", () => {
  it("writes one row per accepted use with cost, mitigation and severity", () => {
    const start = inst();
    const accepted = acceptLeverUses(
      start,
      def,
      [{ leverId: "stimulus", holderId: "gov", intensity: 0.5 }],
      4
    );
    const next = recordLeverUses(start, accepted, 4);
    expect(next.ledger).toEqual([
      {
        turn: 4,
        stage: "peak",
        role: "headOfState",
        holderId: "gov",
        leverId: "stimulus",
        cost: { treasuryCash: 500, approval: { group: "fiscalHawks", points: 1 } },
        mitigation: 3,
        severity: 60,
      },
    ]);
    expect(start.ledger).toEqual([]);
  });

  it("leaves a resolved or empty case untouched", () => {
    const start = inst({ stage: "resolved" });
    expect(recordLeverUses(start, [], 1)).toBe(start);
  });

  it("bounds the ledger", () => {
    let state = inst();
    const accepted = acceptLeverUses(state, def, [{ leverId: "rate-cut", holderId: "a" }], 1);
    for (let i = 0; i < LEDGER_LIMIT + 20; i++) state = recordLeverUses(state, accepted, i);
    expect(state.ledger).toHaveLength(LEDGER_LIMIT);
  });
});

describe("recordInaction", () => {
  const holders = {
    headOfState: ["gov"],
    centralBankChair: ["chair"],
    legislature: ["speaker"],
    corpCeo: ["ceo"],
  };

  it("blames holders of offered levers who did nothing, and not those who acted", () => {
    const start = inst();
    const acted = recordLeverUses(
      start,
      acceptLeverUses(start, def, [{ leverId: "rate-cut", holderId: "chair" }], 5),
      5
    );
    const next = recordInaction(acted, def, holders, 5);
    const idle = next.ledger
      .filter((e) => e.leverId === null)
      .map((e) => `${e.role}:${e.holderId}`);
    expect(idle.sort()).toEqual(["headOfState:gov", "legislature:speaker"]);
  });

  it("does not blame roles with no lever in the definition", () => {
    const next = recordInaction(inst(), def, holders, 5);
    expect(next.ledger.some((e) => e.role === "corpCeo")).toBe(false);
  });

  it("respects lever stage windows", () => {
    const onlyBill = makeDefinition({ levers: [def.levers[2]] });
    const quiet = inst({ stage: "peak" });
    expect(recordInaction(quiet, onlyBill, holders, 1).ledger).toHaveLength(1);
  });

  it("is quiet outside onset and peak, and idempotent within a turn", () => {
    expect(recordInaction(inst({ stage: "signal" }), def, holders, 1).ledger).toEqual([]);
    expect(recordInaction(inst({ stage: "aftermath" }), def, holders, 1).ledger).toEqual([]);
    const once = recordInaction(inst(), def, holders, 1);
    expect(recordInaction(once, def, holders, 1).ledger).toHaveLength(once.ledger.length);
  });
});

describe("computeAccountability", () => {
  const entry = (over: Partial<import("./types").AccountabilityEntry>) => ({
    turn: 1,
    stage: "peak" as const,
    role: "headOfState" as const,
    holderId: "gov",
    leverId: null,
    cost: {},
    mitigation: 0,
    severity: 80,
    ...over,
  });

  it("gives credit for mitigation and blame for passivity, weighted by stage", () => {
    const scores = computeAccountability([
      entry({ leverId: "stimulus", mitigation: 6, stage: "peak" }),
      entry({ leverId: "stimulus", mitigation: 6, stage: "aftermath", turn: 9 }),
      entry({ role: "legislature", holderId: "speaker", severity: 80 }),
    ]);
    const gov = scores.find((s) => s.holderId === "gov")!;
    expect(gov.credit).toBeCloseTo(6 * 1.5 + 6 * 0.5);
    expect(gov.actions).toBe(2);
    const speaker = scores.find((s) => s.holderId === "speaker")!;
    expect(speaker.blame).toBeCloseTo(1.5 * 0.8);
    expect(speaker.net).toBeCloseTo(-1.2);
    expect(speaker.idleTurns).toBe(1);
  });

  it("separates the same person across roles and orders worst first", () => {
    const scores = computeAccountability([
      entry({ holderId: "p" }),
      entry({ holderId: "p", role: "partyLeader", leverId: "x", mitigation: 4 }),
    ]);
    expect(scores).toHaveLength(2);
    expect(scores[0].net).toBeLessThan(scores[1].net);
  });

  it("returns nothing for an empty ledger", () => {
    expect(computeAccountability([])).toEqual([]);
  });

  it("holds more blame for passivity at higher severity", () => {
    const low = computeAccountability([entry({ severity: 20 })])[0];
    const high = computeAccountability([entry({ severity: 90 })])[0];
    expect(high.blame).toBeGreaterThan(low.blame);
  });
});

describe("totalCostByHolder", () => {
  it("sums resource spend per role and holder", () => {
    const totals = totalCostByHolder([
      {
        turn: 1,
        stage: "onset",
        role: "headOfState",
        holderId: "g",
        leverId: "a",
        cost: { treasuryCash: 100 },
        mitigation: 1,
        severity: 1,
      },
      {
        turn: 2,
        stage: "onset",
        role: "headOfState",
        holderId: "g",
        leverId: "a",
        cost: { treasuryCash: 50, politicalCapital: 3 },
        mitigation: 1,
        severity: 1,
      },
    ]);
    expect(totals.get("headOfState:g")).toEqual({
      treasuryCash: 150,
      politicalCapital: 3,
      corpCash: 0,
    });
  });
});

describe("electoralSwing", () => {
  it("is signed, smooth and bounded", () => {
    expect(electoralSwing({ net: 0 }, 5)).toBe(0);
    expect(electoralSwing({ net: 20 }, 5)).toBeGreaterThan(3);
    expect(electoralSwing({ net: -1000 }, 5)).toBeCloseTo(-5);
    expect(electoralSwing({ net: 5 }, 5)).toBeLessThan(electoralSwing({ net: 10 }, 5));
  });
  it("returns zero for degenerate settings", () => {
    expect(electoralSwing({ net: 10 }, 0)).toBe(0);
    expect(electoralSwing({ net: 10 }, 5, 0)).toBe(0);
  });
});
