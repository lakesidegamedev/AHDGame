import { describe, expect, it } from "vitest";
import {
  ANNOUNCED_2027_LAUNCH,
  resolveLaunchSchedule,
  type LaunchScheduleInput,
} from "./launchSchedule";

const BEFORE = Date.parse("2026-11-13T12:00:00-05:00");
const BETWEEN = Date.parse("2026-11-16T09:00:00-05:00");
const AFTER = Date.parse("2026-11-17T09:00:00-05:00");

const sealedFresh: LaunchScheduleInput = {
  maintenanceMode: "full",
  maintenanceExpectedEnd: null,
  currentTurn: 1,
  turnsActive: false,
  nextScheduledTurn: null,
};

describe("resolveLaunchSchedule", () => {
  it("falls back to the announced dates while a fresh world is sealed with no ETA", () => {
    expect(resolveLaunchSchedule(sealedFresh, BEFORE)).toEqual({
      phase: "sealed",
      opensAt: new Date(ANNOUNCED_2027_LAUNCH.opensAt).toISOString(),
      firstTurnAt: new Date(ANNOUNCED_2027_LAUNCH.firstTurnAt).toISOString(),
    });
  });

  it("prefers the admin's expected reopen time over the announced opening", () => {
    const schedule = resolveLaunchSchedule(
      { ...sealedFresh, maintenanceExpectedEnd: "2026-11-15T20:00:00Z" },
      BEFORE
    );
    expect(schedule.opensAt).toBe("2026-11-15T20:00:00.000Z");
  });

  it("prefers the scheduled turn over the announced first turn once turns are on", () => {
    const schedule = resolveLaunchSchedule(
      {
        ...sealedFresh,
        maintenanceMode: "off",
        turnsActive: true,
        nextScheduledTurn: "2026-11-16T23:00:00Z",
      },
      BETWEEN
    );
    expect(schedule).toEqual({
      phase: "open",
      opensAt: null,
      firstTurnAt: "2026-11-16T23:00:00.000Z",
    });
  });

  it("ignores a scheduled turn while turns are switched off", () => {
    const schedule = resolveLaunchSchedule(
      { ...sealedFresh, nextScheduledTurn: "2026-11-20T00:00:00Z" },
      BEFORE
    );
    expect(schedule.firstTurnAt).toBe(new Date(ANNOUNCED_2027_LAUNCH.firstTurnAt).toISOString());
  });

  it("treats partial maintenance as sealed, since sign-ups are still closed", () => {
    expect(
      resolveLaunchSchedule({ ...sealedFresh, maintenanceMode: "partial" }, BEFORE).phase
    ).toBe("sealed");
  });

  it("drops dates that have passed instead of counting down to zero", () => {
    expect(resolveLaunchSchedule(sealedFresh, AFTER)).toEqual({
      phase: "sealed",
      opensAt: null,
      firstTurnAt: null,
    });
    expect(
      resolveLaunchSchedule(
        { ...sealedFresh, maintenanceExpectedEnd: "2026-11-14T00:00:00Z" },
        BETWEEN
      ).opensAt
    ).toBeNull();
  });

  it("ignores an unparseable expected end", () => {
    const schedule = resolveLaunchSchedule(
      { ...sealedFresh, maintenanceExpectedEnd: "Sunday evening" },
      BEFORE
    );
    expect(schedule.opensAt).toBe(new Date(ANNOUNCED_2027_LAUNCH.opensAt).toISOString());
  });

  it("reports a running world with no countdowns after the first turn", () => {
    expect(
      resolveLaunchSchedule(
        {
          maintenanceMode: "off",
          maintenanceExpectedEnd: null,
          currentTurn: 5,
          turnsActive: true,
          nextScheduledTurn: "2026-11-17T15:00:00Z",
        },
        AFTER
      )
    ).toEqual({ phase: "running", opensAt: null, firstTurnAt: null });
  });

  it("can run with no announced dates at all", () => {
    expect(resolveLaunchSchedule(sealedFresh, BEFORE, null)).toEqual({
      phase: "sealed",
      opensAt: null,
      firstTurnAt: null,
    });
  });
});
