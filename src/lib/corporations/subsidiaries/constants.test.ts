import { describe, it, expect } from "vitest";
import {
  SPIN_OFF_BASE_COST_ANCHOR,
  SPIN_OFF_COOLDOWN_TURNS,
  SPIN_OFF_PER_SECTOR_COST_ANCHOR,
  spinOffCooldownTurnsRemaining,
  spinOffCostAnchor,
} from "./constants";

describe("spinOffCostAnchor", () => {
  it("charges the base cost plus a per-sector fee for each sector moved", () => {
    expect(spinOffCostAnchor(1)).toBe(SPIN_OFF_BASE_COST_ANCHOR + SPIN_OFF_PER_SECTOR_COST_ANCHOR);
    expect(spinOffCostAnchor(3)).toBe(
      SPIN_OFF_BASE_COST_ANCHOR + 3 * SPIN_OFF_PER_SECTOR_COST_ANCHOR
    );
  });

  it("falls back to the base cost when no sectors are moved", () => {
    expect(spinOffCostAnchor(0)).toBe(SPIN_OFF_BASE_COST_ANCHOR);
  });

  it("never subtracts for a negative count", () => {
    expect(spinOffCostAnchor(-5)).toBe(SPIN_OFF_BASE_COST_ANCHOR);
  });
});

describe("spinOffCooldownTurnsRemaining", () => {
  it("counts the full cooldown on the turn of the spin-off", () => {
    expect(spinOffCooldownTurnsRemaining(100, 100)).toBe(SPIN_OFF_COOLDOWN_TURNS);
  });

  it("counts down one turn at a time and stops at zero", () => {
    expect(spinOffCooldownTurnsRemaining(100, 100 + SPIN_OFF_COOLDOWN_TURNS - 1)).toBe(1);
    expect(spinOffCooldownTurnsRemaining(100, 100 + SPIN_OFF_COOLDOWN_TURNS)).toBe(0);
    expect(spinOffCooldownTurnsRemaining(100, 400)).toBe(0);
  });

  it("reports no cooldown when the parent has never spun off", () => {
    expect(spinOffCooldownTurnsRemaining(null, 100)).toBe(0);
    expect(spinOffCooldownTurnsRemaining(undefined, 100)).toBe(0);
  });
});
