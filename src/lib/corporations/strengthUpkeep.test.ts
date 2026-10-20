import { describe, expect, it } from "vitest";
import {
  DOMINANCE_SHIELD_UPKEEP_CAP,
  MARKETING_DECAY_RATE,
  STRENGTH_UPKEEP_STAGE,
  marketingStrengthAfterTurn,
  strengthUpkeepActive,
  upkeptDominanceShield,
} from "./strengthUpkeep";
import { TECH_TREE } from "@/lib/constants/techTree";

describe("strength upkeep stages", () => {
  it("is off at 0 or absent and cumulative after", () => {
    expect(strengthUpkeepActive(undefined, STRENGTH_UPKEEP_STAGE.SHIELD)).toBe(false);
    expect(strengthUpkeepActive(0, STRENGTH_UPKEEP_STAGE.SHIELD)).toBe(false);
    expect(strengthUpkeepActive(3, STRENGTH_UPKEEP_STAGE.SYNERGY_TRANSFER)).toBe(true);
    expect(strengthUpkeepActive(2, STRENGTH_UPKEEP_STAGE.MARKETING_DECAY)).toBe(false);
  });
});

describe("marketing strength decay", () => {
  it("only adds growth before the decay stage", () => {
    expect(marketingStrengthAfterTurn(200, 1, 2)).toBe(201);
  });
  it("decays by the rate, then adds growth, from the decay stage", () => {
    expect(marketingStrengthAfterTurn(200, 1, 3)).toBeCloseTo(200 * (1 - MARKETING_DECAY_RATE) + 1);
    expect(marketingStrengthAfterTurn(0, 0, 3)).toBe(0);
    expect(marketingStrengthAfterTurn(Number.NaN, 2, 3)).toBe(2);
  });
});

describe("dominance shield upkeep", () => {
  // Every energy node with a dominance shield, owned, so the aggregate is at its cap.
  const shieldNodes = TECH_TREE.energy.filter((n) =>
    n.effects.some((e) => e.kind === "dominanceShield")
  );
  const corp = {
    type: "energy" as const,
    unlockedTechNodeIds: shieldNodes.map((n) => n.id),
  };

  it("keeps the old aggregate before the shield stage", () => {
    const before = upkeptDominanceShield(corp, "energy", null, null, 2019, 0);
    expect(before).toBeGreaterThanOrEqual(0);
  });

  it("caps the shield and counts only active decades from the shield stage", () => {
    const after = upkeptDominanceShield(corp, "energy", null, null, 2019, 1);
    expect(after).toBeLessThanOrEqual(DOMINANCE_SHIELD_UPKEEP_CAP);
    // Shield techs from decades before the previous one no longer count.
    const oldOnly = {
      type: "energy" as const,
      unlockedTechNodeIds: shieldNodes
        .filter((n) => ["1940", "1950", "1960", "1970"].includes(n.decadeId))
        .map((n) => n.id),
    };
    expect(upkeptDominanceShield(oldOnly, "energy", null, null, 2019, 0)).toBeGreaterThan(0);
    expect(upkeptDominanceShield(oldOnly, "energy", null, null, 2019, 1)).toBe(0);
  });
});
