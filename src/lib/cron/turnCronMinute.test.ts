import { describe, expect, it, vi } from "vitest";
import {
  backupTurnSchedule,
  nextScheduledTurnAfter,
  resolveTurnCronMinute,
  turnCronSchedule,
  turnHourBucket,
} from "./turnCronMinute";

const at = (iso: string) => new Date(iso);

describe("resolveTurnCronMinute", () => {
  it("defaults to 0 when unset or blank", () => {
    expect(resolveTurnCronMinute({})).toBe(0);
    expect(resolveTurnCronMinute({ TURN_CRON_MINUTE: " " })).toBe(0);
  });

  it("accepts 0 and 30", () => {
    expect(resolveTurnCronMinute({ TURN_CRON_MINUTE: "0" })).toBe(0);
    expect(resolveTurnCronMinute({ TURN_CRON_MINUTE: "30" })).toBe(30);
  });

  it("falls back to 0 with a warning for any other minute", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveTurnCronMinute({ TURN_CRON_MINUTE: "15" })).toBe(0);
    expect(resolveTurnCronMinute({ TURN_CRON_MINUTE: "abc" })).toBe(0);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe("schedules", () => {
  it("keeps the default world on :00 with the backup at :30", () => {
    expect(turnCronSchedule(0)).toBe("0 * * * *");
    expect(backupTurnSchedule(0)).toBe("30 * * * *");
  });

  it("moves an offset world to :30 with the backup at :00", () => {
    expect(turnCronSchedule(30)).toBe("30 * * * *");
    expect(backupTurnSchedule(30)).toBe("0 * * * *");
  });

  it("runs fast mode at :00 and :30 whatever the minute", () => {
    expect(turnCronSchedule(0, true)).toBe("0,30 * * * *");
    expect(turnCronSchedule(30, true)).toBe("0,30 * * * *");
  });
});

describe("turnHourBucket", () => {
  it("is the clock hour for minute 0", () => {
    expect(turnHourBucket(at("2026-10-22T20:00:00Z"), 0)).toBe(
      turnHourBucket(at("2026-10-22T20:59:59Z"), 0)
    );
    expect(turnHourBucket(at("2026-10-22T21:00:00Z"), 0)).not.toBe(
      turnHourBucket(at("2026-10-22T20:59:59Z"), 0)
    );
  });

  it("runs from :30 to :30 for minute 30, so the :00 backup shares the turn's hour", () => {
    const turnDone = at("2026-10-22T20:48:00Z");
    const backupTick = at("2026-10-22T21:00:00Z");
    expect(turnHourBucket(backupTick, 30)).toBe(turnHourBucket(turnDone, 30));
    expect(turnHourBucket(at("2026-10-22T21:30:00Z"), 30)).not.toBe(turnHourBucket(turnDone, 30));
  });
});

describe("nextScheduledTurnAfter", () => {
  it("returns the next top of the hour for minute 0", () => {
    expect(nextScheduledTurnAfter(at("2026-10-22T20:10:00Z"), 0).toISOString()).toBe(
      "2026-10-22T21:00:00.000Z"
    );
    expect(nextScheduledTurnAfter(at("2026-10-22T20:00:00Z"), 0).toISOString()).toBe(
      "2026-10-22T21:00:00.000Z"
    );
  });

  it("returns the next :30 for minute 30", () => {
    expect(nextScheduledTurnAfter(at("2026-10-22T20:10:00Z"), 30).toISOString()).toBe(
      "2026-10-22T20:30:00.000Z"
    );
    expect(nextScheduledTurnAfter(at("2026-10-22T20:30:00Z"), 30).toISOString()).toBe(
      "2026-10-22T21:30:00.000Z"
    );
    expect(nextScheduledTurnAfter(at("2026-10-22T20:45:00Z"), 30).toISOString()).toBe(
      "2026-10-22T21:30:00.000Z"
    );
  });

  it("steps every half hour in fast mode", () => {
    expect(nextScheduledTurnAfter(at("2026-10-22T20:10:00Z"), 0, true).toISOString()).toBe(
      "2026-10-22T20:30:00.000Z"
    );
    expect(nextScheduledTurnAfter(at("2026-10-22T20:30:15Z"), 30, true).toISOString()).toBe(
      "2026-10-22T21:00:00.000Z"
    );
  });
});
