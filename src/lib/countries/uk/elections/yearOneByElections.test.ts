import { describe, expect, it } from "vitest";
import {
  YEAR_ONE_BY_ELECTION_SCHEDULE,
  pickYearOneSeat,
  validateYearOneSchedule,
  yearOneEntryForTurn,
} from "./yearOneByElections";

describe("year-one by-election schedule", () => {
  it("opens the year with several by-elections spread across it", () => {
    expect(YEAR_ONE_BY_ELECTION_SCHEDULE.length).toBeGreaterThanOrEqual(3);
    const turns = YEAR_ONE_BY_ELECTION_SCHEDULE.map((e) => e.calendarTurn);
    expect(Math.max(...turns) - Math.min(...turns)).toBeGreaterThan(24);
  });

  it("finds an entry only on its scheduled turn", () => {
    const first = YEAR_ONE_BY_ELECTION_SCHEDULE[0];
    expect(yearOneEntryForTurn(first.calendarTurn)).toBe(first);
    expect(yearOneEntryForTurn(first.calendarTurn + 1)).toBeUndefined();
  });

  it("throws on an empty, out-of-year, duplicate or out-of-range entry", () => {
    const ok = { calendarTurn: 5, reason: "retirement", seatDraw: 0.5 } as const;
    expect(() => validateYearOneSchedule([])).toThrow();
    expect(() => validateYearOneSchedule([{ ...ok, calendarTurn: 0 }])).toThrow();
    expect(() => validateYearOneSchedule([{ ...ok, calendarTurn: 49 }])).toThrow();
    expect(() => validateYearOneSchedule([ok, ok])).toThrow();
    expect(() => validateYearOneSchedule([{ ...ok, seatDraw: 1 }])).toThrow();
    expect(() => validateYearOneSchedule([{ ...ok, seatDraw: Number.NaN }])).toThrow();
    expect(() => validateYearOneSchedule([ok])).not.toThrow();
  });

  it("picks the same seat for the same draw regardless of input order", () => {
    const seats = [{ id: "c" }, { id: "a" }, { id: "b" }];
    expect(pickYearOneSeat(seats, 0)).toEqual({ id: "a" });
    expect(pickYearOneSeat([...seats].reverse(), 0.5)).toEqual({ id: "b" });
    expect(pickYearOneSeat(seats, 0.99)).toEqual({ id: "c" });
    expect(pickYearOneSeat([], 0.3)).toBeUndefined();
  });
});
