import { describe, expect, it } from "vitest";
import { ELECTIONS_SKIP_PHASES } from "@/simulation/phases/simTurnProfiles";
import { economyPauseStatus, getEconomyPausePredicate } from "./economyPause";

describe("getEconomyPausePredicate", () => {
  it("applies no filtering when the field is absent or malformed", () => {
    expect(getEconomyPausePredicate(10, undefined)).toBeUndefined();
    expect(getEconomyPausePredicate(10, null)).toBeUndefined();
    expect(getEconomyPausePredicate(10, Number.NaN)).toBeUndefined();
    expect(getEconomyPausePredicate(10, Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(getEconomyPausePredicate(10, 12.5)).toBeUndefined();
  });

  it("skips the economy below the pause end", () => {
    const predicate = getEconomyPausePredicate(10, 34);
    expect(predicate).toBeDefined();
    expect(predicate!("corporationTurn")).toBe(false);
    expect(predicate!("commodityPrices")).toBe(false);
    expect(predicate!("bankingTurn")).toBe(false);
  });

  it("runs every phase on the turn the pause ends", () => {
    expect(getEconomyPausePredicate(34, 34)).toBeUndefined();
  });

  it("runs every phase after the pause ends", () => {
    expect(getEconomyPausePredicate(35, 34)).toBeUndefined();
  });

  it("skips the elections-only economy set except the fiscal year rollover", () => {
    const predicate = getEconomyPausePredicate(10, 34)!;
    for (const phase of ELECTIONS_SKIP_PHASES) {
      expect(predicate(phase), phase).toBe(phase === "fiscalYear");
    }
    expect(ELECTIONS_SKIP_PHASES.has("fiscalYear")).toBe(true);
  });

  it("keeps political phases running while an economy phase is skipped", () => {
    const predicate = getEconomyPausePredicate(10, 34)!;
    expect(predicate("corporationTurn")).toBe(false);
    for (const political of [
      "campaignTurn",
      "billLifecycle",
      "crisisTurn",
      "referendumLifecycle",
      "voteAccumulation",
      "electionResolution",
    ]) {
      expect(predicate(political), political).toBe(true);
    }
  });
});

describe("economyPauseStatus", () => {
  it("reports not paused when the field is absent or malformed", () => {
    expect(economyPauseStatus(10, undefined)).toEqual({
      paused: false,
      resumesAtTurn: null,
      turnsRemaining: 0,
    });
    expect(economyPauseStatus(10, null)).toEqual({
      paused: false,
      resumesAtTurn: null,
      turnsRemaining: 0,
    });
    expect(economyPauseStatus(10, Number.NaN)).toEqual({
      paused: false,
      resumesAtTurn: null,
      turnsRemaining: 0,
    });
  });

  it("counts the turns left inside the window", () => {
    expect(economyPauseStatus(10, 34)).toEqual({
      paused: true,
      resumesAtTurn: 34,
      turnsRemaining: 24,
    });
  });

  it("reads as finished on and after the resume turn", () => {
    expect(economyPauseStatus(34, 34)).toEqual({
      paused: false,
      resumesAtTurn: null,
      turnsRemaining: 0,
    });
    expect(economyPauseStatus(35, 34)).toEqual({
      paused: false,
      resumesAtTurn: null,
      turnsRemaining: 0,
    });
  });
});
