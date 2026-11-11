import { describe, expect, it } from "vitest";
import {
  CYBER_COOLDOWN_TURNS,
  CYBER_TRUCE_TURNS,
  attackerCapability,
  cyberAttributionChance,
  cyberOperationRefusal,
  cyberStandDownRefusal,
  cyberSuccessChance,
  CYBER_AI_MAX_LAUNCHES,
  CYBER_AI_MIN_GAP_TURNS,
  cyberAiCapReached,
  hawkishnessOfHead,
  planAutonomousCyberOperation,
  planScriptedCyberOperation,
  resolveCyberOperation,
  truceUntil,
} from "./operations";

const none = { lastOperationTurn: null, truceUntilTurn: null };

describe("cyber operation odds", () => {
  it("rises with capability and falls with the target's resilience spending", () => {
    expect(cyberSuccessChance(0.8, 0.3)).toBeGreaterThan(cyberSuccessChance(0.4, 0.3));
    expect(cyberSuccessChance(0.6, 0.2)).toBeGreaterThan(cyberSuccessChance(0.6, 0.7));
  });

  it("is never certain either way", () => {
    expect(cyberSuccessChance(1, 0)).toBeLessThanOrEqual(0.9);
    expect(cyberSuccessChance(0, 1)).toBeGreaterThanOrEqual(0.05);
  });

  it("succeeds or fails on the roll", () => {
    const base = {
      attackerScore: 0.6,
      tradecraft: 5,
      targetResilience: 0.4,
      attributionRoll: 0.99,
    };
    const win = resolveCyberOperation({ ...base, successRoll: 0.01 });
    const loss = resolveCyberOperation({ ...base, successRoll: 0.99 });
    expect(win.outcome).toBe("success");
    expect(win.severity).toBeGreaterThan(0);
    expect(loss.outcome).toBe("failed");
    expect(loss.severity).toBe(0);
  });

  it("attributes independently of the outcome", () => {
    const base = { attackerScore: 0.6, tradecraft: 5, targetResilience: 0.4 };
    const quiet = resolveCyberOperation({ ...base, successRoll: 0.01, attributionRoll: 0.99 });
    const loud = resolveCyberOperation({ ...base, successRoll: 0.01, attributionRoll: 0.0 });
    expect(quiet.attributed).toBe(false);
    expect(loud.attributed).toBe(true);
  });

  it("makes a resilient target better at naming the sponsor, and a failure noisier", () => {
    expect(cyberAttributionChance(0.5, 0.8, "success")).toBeGreaterThan(
      cyberAttributionChance(0.5, 0.2, "success")
    );
    expect(cyberAttributionChance(0.5, 0.5, "failed")).toBeGreaterThan(
      cyberAttributionChance(0.5, 0.5, "success")
    );
  });

  it("tradecraft sharpens capability", () => {
    expect(attackerCapability(0.5, 9)).toBeGreaterThan(attackerCapability(0.5, 2));
  });
});

describe("cyberOperationRefusal", () => {
  it("refuses self, missing data, cooldown and truce", () => {
    expect(cyberOperationRefusal("US", "US", none, 0.5, 10)).toBe("self");
    expect(cyberOperationRefusal("US", "CN", none, null, 10)).toBe("no_resilience_data");
    expect(
      cyberOperationRefusal("US", "CN", { lastOperationTurn: 5, truceUntilTurn: null }, 0.5, 10)
    ).toBe("cooldown");
    expect(
      cyberOperationRefusal("US", "CN", { lastOperationTurn: null, truceUntilTurn: 50 }, 0.5, 10)
    ).toBe("truce");
    expect(cyberOperationRefusal("US", "CN", none, 0.5, 10)).toBeNull();
  });

  it("allows an operation again after the cooldown and the truce lapse", () => {
    const history = { lastOperationTurn: 5, truceUntilTurn: truceUntil(5) };
    expect(cyberOperationRefusal("US", "CN", history, 0.5, 5 + CYBER_COOLDOWN_TURNS)).toBe("truce");
    expect(cyberOperationRefusal("US", "CN", history, 0.5, 5 + CYBER_TRUCE_TURNS)).toBeNull();
  });
});

describe("cyberStandDownRefusal", () => {
  it("needs an operation against the target since the last truce began", () => {
    expect(cyberStandDownRefusal("US", "US", none, 10)).toBe("self");
    expect(cyberStandDownRefusal("US", "CN", none, 10)).toBe("no_operation");
    expect(
      cyberStandDownRefusal("US", "CN", { lastOperationTurn: 8, truceUntilTurn: null }, 10)
    ).toBeNull();
    expect(
      cyberStandDownRefusal("US", "CN", { lastOperationTurn: 8, truceUntilTurn: truceUntil(9) }, 10)
    ).toBe("truce");
  });

  it("cannot be repeated after a truce lapses without a new operation", () => {
    const lapsed = truceUntil(10) + 1;
    expect(
      cyberStandDownRefusal(
        "US",
        "CN",
        { lastOperationTurn: 10, truceUntilTurn: truceUntil(10) },
        lapsed
      )
    ).toBe("no_operation");
    expect(
      cyberStandDownRefusal(
        "US",
        "CN",
        { lastOperationTurn: lapsed, truceUntilTurn: truceUntil(10) },
        lapsed
      )
    ).toBeNull();
  });
});

describe("planScriptedCyberOperation", () => {
  const hawk = {
    attackerId: "RU",
    hawkishness: 0.9,
    rivalLeaderId: "US",
    tension: 60,
    history: none,
    targetResilience: 0.2,
    turn: 100,
  };

  it("a hawk at high tension probes a weakly defended rival", () => {
    expect(planScriptedCyberOperation({ ...hawk, decisionRoll: 0 })).toEqual({
      kind: "launch",
      targetId: "US",
    });
    expect(planScriptedCyberOperation({ ...hawk, decisionRoll: 0.999 }).kind).toBe("none");
  });

  it("does not probe a well defended rival or in detente", () => {
    expect(
      planScriptedCyberOperation({ ...hawk, targetResilience: 0.9, decisionRoll: 0 }).kind
    ).toBe("none");
    expect(planScriptedCyberOperation({ ...hawk, tension: 10, decisionRoll: 0 }).kind).toBe("none");
  });

  it("a government that turns dovish stands down from an active pair", () => {
    const dove = {
      ...hawk,
      hawkishness: 0.2,
      history: { lastOperationTurn: 90, truceUntilTurn: null },
      decisionRoll: 0,
    };
    expect(planScriptedCyberOperation(dove)).toEqual({ kind: "stand_down", targetId: "US" });
    expect(
      planScriptedCyberOperation({
        ...dove,
        history: { lastOperationTurn: 90, truceUntilTurn: 150 },
      }).kind
    ).toBe("none");
  });

  it("never acts without a rival", () => {
    expect(planScriptedCyberOperation({ ...hawk, rivalLeaderId: null, decisionRoll: 0 }).kind).toBe(
      "none"
    );
  });
});

describe("NPP-run government cyber decisions", () => {
  const base = {
    attackerId: "UK",
    hawkishness: 0.9,
    rivalLeaderId: "CN",
    tension: 60,
    history: none,
    targetResilience: 0.2,
    turn: 100,
    decisionRoll: 0,
    capability: 0.7,
    recentLaunchTurns: [] as number[],
  };

  it("a hawkish head launches against a weak rival", () => {
    expect(planAutonomousCyberOperation(base)).toEqual({ kind: "launch", targetId: "CN" });
  });

  it("a real capability changes whether the odds favour a launch", () => {
    expect(
      planAutonomousCyberOperation({ ...base, targetResilience: 0.85, capability: 0.2 }).kind
    ).toBe("none");
  });

  it("a dovish head stands down from an active pair and never launches", () => {
    const dove = {
      ...base,
      hawkishness: 0.2,
      history: { lastOperationTurn: 90, truceUntilTurn: null },
    };
    expect(planAutonomousCyberOperation(dove)).toEqual({ kind: "stand_down", targetId: "CN" });
    expect(planAutonomousCyberOperation({ ...dove, history: none }).kind).toBe("none");
  });

  it("stands down in detente even when the head is hawkish", () => {
    expect(
      planAutonomousCyberOperation({
        ...base,
        tension: 10,
        history: { lastOperationTurn: 90, truceUntilTurn: null },
      }).kind
    ).toBe("stand_down");
  });

  it("caps launches per window and spaces them out", () => {
    expect(cyberAiCapReached([], 100)).toBe(false);
    expect(cyberAiCapReached([100 - CYBER_AI_MIN_GAP_TURNS + 1], 100)).toBe(true);
    const spaced = Array.from({ length: CYBER_AI_MAX_LAUNCHES }, (_, i) => 40 + i * 20);
    expect(cyberAiCapReached(spaced, 100)).toBe(true);
    expect(cyberAiCapReached([20, 60], 100)).toBe(false);
    expect(cyberAiCapReached([20, 40], 100)).toBe(false);
    expect(planAutonomousCyberOperation({ ...base, recentLaunchTurns: spaced }).kind).toBe("none");
  });

  it("never caps a stand down", () => {
    const decision = planAutonomousCyberOperation({
      ...base,
      hawkishness: 0.1,
      history: { lastOperationTurn: 95, truceUntilTurn: null },
      recentLaunchTurns: [95, 90],
    });
    expect(decision.kind).toBe("stand_down");
  });

  it("derives hawkishness from defence stance and ambition", () => {
    expect(hawkishnessOfHead(100, 100)).toBe(1);
    expect(hawkishnessOfHead(-100, 0)).toBe(0);
    expect(hawkishnessOfHead(null, 50)).toBeCloseTo(0.5);
  });
});
