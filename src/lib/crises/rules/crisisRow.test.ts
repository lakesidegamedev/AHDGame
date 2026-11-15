import { describe, expect, it } from "vitest";
import {
  compareCrisisRows,
  crisisPlaceLabel,
  crisisSection,
  crisisSeverityScore,
  severityBandFromScore,
  summarizeCrises,
  type SortableCrisisRow,
} from "./crisisRow";

describe("severityBandFromScore", () => {
  it("puts 70 and up in the high band and 40 to 69 in the middle", () => {
    expect(severityBandFromScore(70)).toBe("high");
    expect(severityBandFromScore(69.9)).toBe("medium");
    expect(severityBandFromScore(40)).toBe("medium");
    expect(severityBandFromScore(39)).toBe("low");
  });
});

describe("crisisSeverityScore", () => {
  it("prefers the live v2 score and falls back to the effect band", () => {
    expect(crisisSeverityScore({ v2Severity: 12, legacyBand: "high" })).toBe(12);
    expect(crisisSeverityScore({ v2Severity: null, legacyBand: "high" })).toBeGreaterThanOrEqual(
      70
    );
    expect(crisisSeverityScore({ v2Severity: undefined, legacyBand: "low" })).toBeLessThan(40);
  });
});

describe("crisisSection", () => {
  it("puts ongoing first, warnings next, aftermath and resolved last", () => {
    expect(crisisSection({ status: "active", stage: "peak" })).toBe("ongoing");
    expect(crisisSection({ status: "active", stage: undefined })).toBe("ongoing");
    expect(crisisSection({ status: "active", stage: "signal" })).toBe("warning");
    expect(crisisSection({ status: "active", stage: "aftermath" })).toBe("aftermath");
    expect(crisisSection({ status: "resolved", stage: "peak" })).toBe("aftermath");
  });
});

describe("compareCrisisRows", () => {
  const row = (
    id: string,
    section: SortableCrisisRow["section"],
    score: number,
    startTurn = 1
  ) => ({
    id,
    section,
    score,
    startTurn,
  });

  it("orders by section, then severity, then newest", () => {
    const rows = [
      row("resolved", "aftermath", 90),
      row("warn", "warning", 95),
      row("mild", "ongoing", 30),
      row("severe-old", "ongoing", 80, 1),
      row("severe-new", "ongoing", 80, 9),
    ];
    expect(rows.sort(compareCrisisRows).map((r) => r.id)).toEqual([
      "severe-new",
      "severe-old",
      "mild",
      "warn",
      "resolved",
    ]);
  });
});

describe("summarizeCrises", () => {
  it("counts severe crises and names the worst", () => {
    const summary = summarizeCrises([
      { title: "Hurricane", band: "high", canRespond: false },
      { title: "Recession", band: "high", canRespond: true },
      { title: "Strike", band: "low", canRespond: false },
    ]);
    expect(summary.headline).toBe("3 active crises, 2 severe");
    expect(summary.worst).toBe("Hurricane");
    expect(summary.respondable).toBe(1);
  });

  it("drops the severe clause when none are", () => {
    expect(summarizeCrises([{ title: "Strike", band: "low", canRespond: false }]).headline).toBe(
      "1 active crisis"
    );
  });
});

describe("crisisPlaceLabel", () => {
  const names = { country: (id: string) => id.toUpperCase(), region: (id: string) => `R:${id}` };
  it("names the place, or says worldwide", () => {
    expect(crisisPlaceLabel({ scope: "global", countryIds: [], regionIds: [] }, names)).toBe(
      "Worldwide"
    );
    expect(
      crisisPlaceLabel({ scope: "region", countryIds: ["us"], regionIds: ["ca"] }, names)
    ).toBe("R:ca");
    expect(
      crisisPlaceLabel(
        { scope: "country", countryIds: ["a", "b", "c", "d", "e"], regionIds: [] },
        names
      )
    ).toBe("A, B, C and 2 more");
  });
});
