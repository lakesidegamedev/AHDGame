import { describe, expect, it } from "vitest";
import { bandDefenceStatus, BAND_DEFENCE_HORIZON_TURNS } from "./interventionBandStatus";
import { DEFENCE_MAX_PRESSURE } from "./intervention/rules/defence";

describe("bandDefenceStatus", () => {
  it("reports a rate inside the corridor as in band", () => {
    expect(bandDefenceStatus(1.2, 1, 1.4)).toMatchObject({
      defending: false,
      turnsToReach: 0,
      unreachable: false,
      gapPct: 0,
    });
  });

  it("counts turns at the maximum defence impact for a breach", () => {
    // The ceiling sits 40% below the live rate; defence moves 1% a turn.
    const status = bandDefenceStatus(1.4, 0.8, 0.84);
    expect(status.defending).toBe(true);
    expect(status.gapPct).toBeCloseTo(0.4);
    expect(status.turnsToReach).toBe(Math.ceil(0.4 / DEFENCE_MAX_PRESSURE));
    expect(status.turnsToReach).toBe(40);
    expect(status.unreachable).toBe(false);
  });

  it("calls a corridor beyond a game year of defence unreachable", () => {
    const status = bandDefenceStatus(2, 1, 1);
    expect(status.turnsToReach).toBe(50);
    expect(BAND_DEFENCE_HORIZON_TURNS).toBe(48);
    expect(status.unreachable).toBe(true);
  });

  it("uses the nearest boundary when the rate is below the floor", () => {
    const status = bandDefenceStatus(0.8, 1, 1.2);
    expect(status.defending).toBe(true);
    expect(status.gapPct).toBeCloseTo(0.25);
    expect(status.turnsToReach).toBe(25);
  });

  it("stays neutral on unusable inputs instead of inventing a warning", () => {
    expect(bandDefenceStatus(Number.NaN, 1, 2).defending).toBe(false);
    expect(bandDefenceStatus(1, 0, 2).defending).toBe(false);
    expect(bandDefenceStatus(1, 3, 2).defending).toBe(false);
  });
});
