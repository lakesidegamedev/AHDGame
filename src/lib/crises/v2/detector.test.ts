import { describe, expect, it } from "vitest";
import { stepDetector, type DetectorReading, type DetectorSpec } from "./detector";
import { advanceStreak, type StreakRecord } from "./streak";

const spec: DetectorSpec = {
  id: "d",
  definitionId: "def",
  scope: "national",
  comparator: "atLeast",
  threshold: 10,
  sustainedTurns: 3,
  priority: 1,
};

const reading = (value: number, key = "US"): DetectorReading => ({
  key,
  countryIds: [key],
  regionIds: [],
  value,
});

describe("advanceStreak", () => {
  it("counts consecutive turns and resets on a miss or a gap", () => {
    const first = advanceStreak(undefined, true, 5);
    expect(first).toEqual({ count: 1, lastTurn: 5 });
    expect(advanceStreak(first!, true, 6)).toEqual({ count: 2, lastTurn: 6 });
    expect(advanceStreak(first!, false, 6)).toBeNull();
    expect(advanceStreak(first!, true, 8)).toEqual({ count: 1, lastTurn: 8 });
  });

  it("does not count the same turn twice", () => {
    const record = { count: 2, lastTurn: 6 };
    expect(advanceStreak(record, true, 6)).toBe(record);
  });
});

describe("stepDetector", () => {
  it("proposes only once the condition has held for the sustained run", () => {
    let streaks = new Map<string, StreakRecord>();
    const proposed: number[] = [];
    for (let turn = 1; turn <= 4; turn++) {
      const step = stepDetector(spec, [reading(12)], streaks, turn);
      streaks = step.streaks;
      if (step.proposals.length > 0) proposed.push(turn);
    }
    expect(proposed).toEqual([3, 4]);
  });

  it("starts over when the reading drops back under the threshold", () => {
    let streaks = new Map<string, StreakRecord>();
    streaks = stepDetector(spec, [reading(12)], streaks, 1).streaks;
    streaks = stepDetector(spec, [reading(12)], streaks, 2).streaks;
    const dip = stepDetector(spec, [reading(9)], streaks, 3);
    expect(dip.cleared).toEqual(["US"]);
    expect(dip.proposals).toEqual([]);
    const back = stepDetector(spec, [reading(12)], dip.streaks, 4);
    expect(back.streaks.get("US")?.count).toBe(1);
  });

  it("supports a threshold the reading must stay under", () => {
    const below: DetectorSpec = { ...spec, comparator: "atMost", threshold: 0, sustainedTurns: 1 };
    expect(stepDetector(below, [reading(-1)], new Map(), 1).proposals).toHaveLength(1);
    expect(stepDetector(below, [reading(1)], new Map(), 1).proposals).toHaveLength(0);
  });

  it("tracks each region on its own", () => {
    const step = stepDetector(spec, [reading(12, "a"), reading(5, "b")], new Map(), 1);
    expect([...step.streaks.keys()]).toEqual(["a"]);
  });
});
