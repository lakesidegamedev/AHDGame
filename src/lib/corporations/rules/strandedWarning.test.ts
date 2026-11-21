import { describe, expect, it } from "vitest";
import { STRANDED_WARN_TURNS } from "@/lib/corporations/strandedPlant";
import { strandedWarning } from "./strandedWarning";

describe("strandedWarning", () => {
  it("never warns a settled plant that sold everything, whatever the legacy streak says", () => {
    expect(
      strandedWarning({
        settled: { offered: 20, taken: 20 },
        legacyLowFillTurns: 101,
        soldShare: 1,
      })
    ).toBeNull();
  });

  it("does not warn a settled plant at exactly half", () => {
    expect(
      strandedWarning({
        settled: { offered: 20, taken: 10 },
        legacyLowFillTurns: 30,
        soldShare: 0.5,
      })
    ).toBeNull();
  });

  it("warns a settled plant under half on its latest turn, with no streak it cannot know", () => {
    expect(
      strandedWarning({ settled: { offered: 20, taken: 6 }, legacyLowFillTurns: 0, soldShare: 0.3 })
    ).toEqual({ basis: "settlement", takenShare: 0.3, turnsInRow: null });
  });

  it("states and requires the settled streak once the settlement records one", () => {
    const base = { settled: { offered: 20, taken: 2 }, legacyLowFillTurns: 50, soldShare: 0.1 };
    expect(strandedWarning({ ...base, settledLowSaleTurns: STRANDED_WARN_TURNS - 1 })).toBeNull();
    expect(strandedWarning({ ...base, settledLowSaleTurns: STRANDED_WARN_TURNS + 2 })).toEqual({
      basis: "settlement",
      takenShare: 0.1,
      turnsInRow: STRANDED_WARN_TURNS + 2,
    });
  });

  it("says nothing for a settled plant that offered nothing", () => {
    expect(
      strandedWarning({
        settled: { offered: 0, taken: 0 },
        legacyLowFillTurns: 40,
        soldShare: null,
      })
    ).toBeNull();
  });

  it("keeps the legacy streak, as an estimate, for a plant with no funded record", () => {
    expect(
      strandedWarning({ settled: null, legacyLowFillTurns: STRANDED_WARN_TURNS, soldShare: 0.37 })
    ).toEqual({ basis: "estimate", soldShare: 0.37, turnsInRow: STRANDED_WARN_TURNS });
    expect(
      strandedWarning({
        settled: null,
        legacyLowFillTurns: STRANDED_WARN_TURNS - 1,
        soldShare: 0.2,
      })
    ).toBeNull();
  });
});
