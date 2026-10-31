import { describe, expect, it } from "vitest";
import { DEFAULT_DURATIONS } from "@/lib/constants/electionDurations";
import { MS_PER_TURN } from "@/lib/constants/turnTime";
import { primaryBallotWindow } from "@/lib/turn/primaryBallots";
import { turnVoteWeight } from "@/lib/electionEngine/voteCalculations";
import { canonicalTurnsForCycle, pickNextCanonicalCycle } from "./canonicalCycle";

describe("standard election timing integration", () => {
  it.each([1953, 1991, 2019])(
    "keeps General at 24 turns across %i preset schedules",
    (startingYear) => {
      let checked = 0;
      for (const electionType of Object.keys(DEFAULT_DURATIONS)) {
        for (const cycle of [1, 2, 3, 10]) {
          const turns = canonicalTurnsForCycle({
            electionType,
            cycle,
            senateClass: 1,
            chamberClass: 1,
            ctx: { startingYear, preset: `${startingYear}-default`, preIterationTurns: 48 },
          });
          if (!turns) continue;
          expect(turns.endTurn - turns.primaryEndTurn, electionType).toBe(24);
          expect(turns.startTurn, electionType).toBeLessThanOrEqual(turns.primaryEndTurn);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(100);
    }
  );

  it("accepts exactly 24 remaining Primary turns and skips a cycle with only 23", () => {
    const params = { electionType: "sangiin", chamberClass: 1 as const, prevCycle: 1 };
    const cycle = canonicalTurnsForCycle({ ...params, cycle: 2 })!;
    expect(
      pickNextCanonicalCycle({ ...params, currentTurn: cycle.primaryEndTurn - 24 })?.cycle
    ).toBe(2);
    expect(
      pickNextCanonicalCycle({ ...params, currentTurn: cycle.primaryEndTurn - 23 })?.cycle
    ).toBe(3);
  });

  it.each(["house", "senate", "governor", "stateSenate", "president", "shugiin", "sangiin"])(
    "%s has a 24-turn closing Primary ballot window",
    (electionType) => {
      const bounds = canonicalTurnsForCycle({
        electionType,
        cycle: 2,
        senateClass: 1,
        chamberClass: 1,
      })!;
      const ballotStart = bounds.primaryEndTurn - 24;
      expect(primaryBallotWindow(bounds, ballotStart - 1, new Date(0))?.open).toBe(false);
      expect(primaryBallotWindow(bounds, ballotStart, new Date(0))).toMatchObject({
        startTurn: ballotStart,
        endTurn: bounds.primaryEndTurn,
        open: true,
      });
    }
  );

  it.each([24, 48, 72])(
    "preserves a stored %i-turn General window for legacy Date-only races",
    (generalTurns) => {
      const startTime = new Date(0);
      const primaryEndTime = new Date(264 * MS_PER_TURN);
      const endTime = new Date((264 + generalTurns) * MS_PER_TURN);
      const boundary = new Date((264 - generalTurns) * MS_PER_TURN);
      const race = { startTime, primaryEndTime, endTime };
      expect(primaryBallotWindow(race, 0, new Date(boundary.getTime() - 1))?.open).toBe(false);
      expect(primaryBallotWindow(race, 0, boundary)).toMatchObject({
        startTime: boundary,
        endTime: primaryEndTime,
        open: true,
      });
    }
  );

  it("conserves the vote pool and the closing bands over the shorter General phase", () => {
    const weights = Array.from({ length: 24 }, (_, turn) => turnVoteWeight(24, turn, 12000));
    expect(weights.slice(0, 12).reduce((a, b) => a + b, 0)).toBeCloseTo(6000);
    expect(weights.slice(12, 20).reduce((a, b) => a + b, 0)).toBeCloseTo(2400);
    expect(weights.slice(20).reduce((a, b) => a + b, 0)).toBeCloseTo(3600);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(12000);
  });
});
