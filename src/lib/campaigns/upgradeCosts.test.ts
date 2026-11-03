import { describe, expect, it } from "vitest";
import {
  FUNDRAISING_INCOME,
  GENERAL_PHASE_UPGRADE_MULTIPLIER,
  getEffectiveBranchCost,
  getEffectiveUpgradeCost,
  getMaintenanceCost,
  getTreeMaintenanceCost,
  getUpgradeCost,
} from "./upgradeCosts";
import { calculateCampaignIncome } from "./income";
import type { Campaign } from "@/lib/db/types";

describe("calculateCampaignIncome", () => {
  it("pays FUNDRAISING_INCOME for the legacy level", () => {
    const campaign = { fundraisingLevel: 10 } as Campaign;
    expect(calculateCampaignIncome(campaign)).toBe(FUNDRAISING_INCOME[10]);
  });
});

describe("getUpgradeCost", () => {
  it("returns the table cost", () => {
    const cost = getUpgradeCost("fundraising", 10);
    expect(cost?.funds).toBe(10_000_000); // L10 from upgradeCosts.ts
  });

  it("returns null for an out-of-range level", () => {
    expect(getUpgradeCost("fundraising", 99)).toBeNull();
  });
});

describe("getEffectiveUpgradeCost (general-phase surcharge)", () => {
  it("returns the table cost unchanged in the primary phase (no surcharge)", () => {
    // Ground-game L4: base $440k, 25 actions, $82.5k maintenance.
    const cost = getEffectiveUpgradeCost("groundGame", 4, false);
    expect(cost?.funds).toBe(440_000);
    expect(cost?.actions).toBe(25);
    expect(cost?.maintenance).toBe(82_500);
  });

  it("applies the +50% general-phase surcharge to funds and actions", () => {
    const cost = getEffectiveUpgradeCost("groundGame", 4, true);
    expect(cost?.funds).toBe(Math.ceil(440_000 * GENERAL_PHASE_UPGRADE_MULTIPLIER)); // 660_000
    expect(cost?.actions).toBe(Math.ceil(25 * GENERAL_PHASE_UPGRADE_MULTIPLIER)); // 38
  });

  it("does NOT apply the general-phase surcharge to recurring maintenance", () => {
    // Maintenance is an ongoing per-turn cost (getMaintenanceCost), not subject
    // to the one-time upgrade surcharge — display must match what's charged.
    const cost = getEffectiveUpgradeCost("groundGame", 4, true);
    expect(cost?.maintenance).toBe(82_500);
  });

  it("matches the server gate's exact funds/actions arithmetic (SSOT invariant)", () => {
    // The campaign-upgrade gate charges Math.ceil(getUpgradeCost(...) × multiplier).
    // The displayed cost MUST equal that, or canAfford disagrees with the gate.
    for (const isGeneral of [false, true]) {
      const base = getUpgradeCost("groundGame", 4);
      const multiplier = isGeneral ? GENERAL_PHASE_UPGRADE_MULTIPLIER : 1.0;
      const effective = getEffectiveUpgradeCost("groundGame", 4, isGeneral);
      expect(effective?.funds).toBe(Math.ceil(base!.funds * multiplier));
      expect(effective?.actions).toBe(Math.ceil(base!.actions * multiplier));
    }
  });

  it("returns null for an out-of-range level (preserves base behavior)", () => {
    expect(getEffectiveUpgradeCost("fundraising", 99, false)).toBeNull();
    expect(getEffectiveUpgradeCost("fundraising", 99, true)).toBeNull();
  });
});

describe("getMaintenanceCost", () => {
  it("sums the cumulative maintenance", () => {
    // groundGame L5 cumulative maintenance: 5_500 + 16_500 + 38_500 + 82_500 + 170_500 = 313_500
    expect(getMaintenanceCost("groundGame", 5)).toBe(313_500);
  });

  it("returns 0 for level 0", () => {
    expect(getMaintenanceCost("groundGame", 0)).toBe(0);
  });
});

describe("ground game and media upkeep scaling", () => {
  it("doubles tree upkeep for ground game and media only", () => {
    const maxA = { starter: true, a: 3, b: 0, c: 0 };
    expect(getTreeMaintenanceCost("groundGame", maxA)).toBe((5_500 + 102_000) * 2);
    expect(getTreeMaintenanceCost("mediaSpending", maxA)).toBe((6_000 + 118_000) * 2);
    expect(getTreeMaintenanceCost("fundraising", { starter: true, a: 0, b: 0, c: 3 })).toBe(68_000);
  });

  it("charges 1.5x for the tier-3 purchase on those levers only", () => {
    expect(getEffectiveBranchCost("groundGame", "a", 2, false)?.funds).toBe(240_000);
    expect(getEffectiveBranchCost("groundGame", "a", 3, false)?.funds).toBe(750_000);
    expect(getEffectiveBranchCost("mediaSpending", "a", 3, false)?.funds).toBe(900_000);
    expect(getEffectiveBranchCost("fundraising", "a", 3, false)?.funds).toBe(1_500_000);
  });
});
