import { describe, expect, it } from "vitest";
import { DEFAULT_DURATIONS } from "./electionDurations";

describe("election phase durations", () => {
  it.each(Object.entries(DEFAULT_DURATIONS))(
    "%s reserves exactly 24 turns for General",
    (_type, duration) => {
      expect(duration.generalDurationHours).toBe(24);
      expect(duration.primaryDurationHours + duration.generalDurationHours).toBe(
        duration.durationHours
      );
    }
  );

  it.each([
    ["house", 96, 72],
    ["senate", 288, 264],
    ["governor", 192, 168],
    ["stateSenate", 192, 168],
    ["president", 192, 168],
    ["shugiin", 192, 168],
    ["sangiin", 144, 120],
  ] as const)("preserves the %s election window", (type, total, primary) => {
    expect(DEFAULT_DURATIONS[type]).toEqual({
      durationHours: total,
      primaryDurationHours: primary,
      generalDurationHours: 24,
    });
  });
});
