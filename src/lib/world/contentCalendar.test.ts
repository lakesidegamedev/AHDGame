import { describe, expect, it } from "vitest";
import {
  CALENDAR_CATEGORIES,
  CALENDAR_PRESET,
  buildContentCalendar,
  calendarGaps,
  fullSimulationCountries,
  renderContentCalendarMarkdown,
} from "./contentCalendar";

const calendar = buildContentCalendar();

describe("2027 to 2055 content calendar", () => {
  it("covers every year from 2027 to 2055 for every full-simulation country", () => {
    const countries = fullSimulationCountries(CALENDAR_PRESET);
    expect(countries).toEqual(expect.arrayContaining(["US", "UK", "DE", "JP", "CN"]));
    expect(calendar.cells).toHaveLength((2055 - 2027 + 1) * countries.length);
  });

  it("leaves no year empty in any category for any country", () => {
    expect(calendarGaps(calendar)).toEqual([]);
  });

  it("has living conflicts, crises, events and opportunities in every year world-wide", () => {
    for (let year = 2027; year <= 2055; year++) {
      const cells = calendar.cells.filter((c) => c.year === year);
      for (const category of CALENDAR_CATEGORIES) {
        expect(
          cells.some((c) => c.items[category].length > 0),
          `${year} ${category}`
        ).toBe(true);
      }
    }
  });

  it("opens the post-2027 conflict families on their own dates", () => {
    const families = (year: number) =>
      calendar.dated.find((d) => d.year === year)!.items.livingConflicts;
    expect(families(2027)).not.toContain("ai_labour_shock");
    expect(families(2029)).toContain("ai_labour_shock");
    expect(families(2045)).toContain("pacific_strait_crisis");
    expect(families(2046)).not.toContain("pacific_strait_crisis");
  });

  it("lists opportunities separately from crises", () => {
    for (const cell of calendar.cells) {
      expect(cell.items.crisisTemplates).not.toContain("olympic_hosting_bid");
    }
    const us2040 = calendar.cells.find((c) => c.year === 2040 && c.countryId === "US")!;
    expect(us2040.items.opportunities.length).toBeGreaterThanOrEqual(4);
  });

  it("is deterministic", () => {
    const again = buildContentCalendar();
    expect(renderContentCalendarMarkdown(again)).toBe(renderContentCalendarMarkdown(calendar));
  });
});
