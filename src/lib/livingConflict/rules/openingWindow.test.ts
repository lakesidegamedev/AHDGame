import { describe, expect, it } from "vitest";
import { calendarWindowOpen, openingWindowOpen, presetOpeningWindowOpen } from "./openingWindow";
import { YUGOSLAVIA_DEF } from "../defs/yugoslavia";

describe("living-conflict opening window", () => {
  it("never closes an unbounded side", () => {
    expect(calendarWindowOpen({}, null)).toBe(true);
    expect(calendarWindowOpen({ fromYear: 2029 }, 2099)).toBe(true);
    expect(calendarWindowOpen({ untilYear: 2045 }, 1953)).toBe(true);
  });

  it("closes a bounded side outside the window or when the year is unknown", () => {
    expect(calendarWindowOpen({ fromYear: 2029 }, 2028)).toBe(false);
    expect(calendarWindowOpen({ fromYear: 2029 }, null)).toBe(false);
    expect(calendarWindowOpen({ fromYear: 2029 }, Number.NaN)).toBe(false);
    expect(calendarWindowOpen({ fromYear: 2028, untilYear: 2045 }, 2046)).toBe(false);
    expect(calendarWindowOpen({ fromYear: 2028, untilYear: 2045 }, 2045)).toBe(true);
  });

  it("opens the surviving Yugoslav federation only as the authored 2027 counterfactual", () => {
    const counterfactual = {
      openingDisposition: "counterfactual" as const,
      openingProvenance: {
        preset: "2027-default" as const,
        evidenceAsOf: "2026-09-30",
        sourceUrls: [],
        scale: "modeled_continuity" as const,
      },
    };
    expect(openingWindowOpen(YUGOSLAVIA_DEF, counterfactual, 2027)).toBe(true);
    expect(openingWindowOpen(YUGOSLAVIA_DEF, counterfactual, 2028)).toBe(false);
    expect(presetOpeningWindowOpen(YUGOSLAVIA_DEF, counterfactual, null)).toBe(false);
    expect(
      openingWindowOpen(
        YUGOSLAVIA_DEF,
        { ...counterfactual, openingDisposition: "inherited" },
        2027
      )
    ).toBe(false);
    expect(openingWindowOpen(YUGOSLAVIA_DEF, {}, 1995)).toBe(true);
  });
});
