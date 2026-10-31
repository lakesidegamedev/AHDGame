import { describe, expect, it } from "vitest";
import { adjustElectionDurations } from "./timerAdjustment";

const defaults = { durationHours: 96, primaryDurationHours: 72 };
describe("admin election duration edits", () => {
  it.each([
    [{ action: "set", primaryHours: 80 }, 80, 24],
    [{ action: "set", generalHours: 12 }, 72, 12],
    [{ action: "add", primaryHours: 2 }, 74, 24],
    [{ action: "subtract", generalHours: 4 }, 72, 20],
    [{ action: "subtract", primaryHours: 100 }, 0, 24],
    [{ action: "set", primaryHours: 0, generalHours: 0 }, 0, 1],
  ] as const)("preserves duration semantics for %o", (edit, primary, general) => {
    expect(adjustElectionDurations(defaults, defaults, edit)).toEqual({
      durationHours: primary + general,
      primaryDurationHours: primary,
      generalDurationHours: general,
    });
  });

  it("uses canonical defaults when legacy metadata is absent", () => {
    expect(adjustElectionDurations({}, defaults, { action: "add", primaryHours: 0 })).toEqual({
      ...defaults,
      generalDurationHours: 24,
    });
  });

  it("preserves a stored 48-turn General phase when editing a legacy Primary", () => {
    expect(
      adjustElectionDurations({ durationHours: 96, primaryDurationHours: 48 }, defaults, {
        action: "add",
        primaryHours: 1,
      })
    ).toEqual({
      durationHours: 97,
      primaryDurationHours: 49,
      generalDurationHours: 48,
    });
  });
  it("repairs inverted legacy metadata from authoritative turn deadlines", () => {
    expect(
      adjustElectionDurations(
        {
          durationHours: 96,
          primaryDurationHours: 24,
          startTurn: 100,
          primaryEndTurn: 172,
          endTurn: 196,
        },
        defaults,
        { action: "set", generalHours: 12 }
      )
    ).toEqual({
      durationHours: 84,
      primaryDurationHours: 72,
      generalDurationHours: 12,
    });
  });

  it("clamps inconsistent metadata when no usable deadline bounds exist", () => {
    expect(
      adjustElectionDurations(
        {
          durationHours: 48,
          primaryDurationHours: 72,
        },
        defaults,
        { action: "set", generalHours: 24 }
      )
    ).toEqual({
      durationHours: 72,
      primaryDurationHours: 48,
      generalDurationHours: 24,
    });
  });
});
