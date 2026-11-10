import { describe, expect, it } from "vitest";
import {
  CYBER_COOLDOWN_TURNS,
  CYBER_TRUCE_TURNS,
  attackerCapability,
  cyberAttributionChance,
  cyberOperationRefusal,
  cyberSuccessChance,
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
