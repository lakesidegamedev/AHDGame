import { describe, expect, it } from "vitest";
import { largestRemainderSeats } from "@/lib/turn/election/seatAllocation";
import { computeSeatMargins, seatMarginFor, type SeatProjection } from "./seatMargins";

/** Hamilton / largest remainder with no threshold, the engine's own core. */
function lr(seats: number, minShare = 0): SeatProjection {
  return (votes) => {
    const candidates = Object.entries(votes).map(([id, v]) => ({ id, votes: v }));
    const total = candidates.reduce((a, c) => a + c.votes, 0);
    return largestRemainderSeats(candidates, seats, { minShare, totalVotesForShare: total }).seats;
  };
}

/** First past the post: one seat to the top vote-getter. */
const fptp: SeatProjection = (votes) => {
  const [winner] = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(Object.keys(votes).map((id) => [id, id === winner[0] ? 1 : 0]));
};

/** Brute force: the exact smallest whole-vote move. */
function bruteGain(project: SeatProjection, votes: Record<string, number>, id: string) {
  const current = project(votes)![id];
  for (let d = 1; d < 100_000; d++) {
    if (project({ ...votes, [id]: votes[id] + d })![id] > current) return d;
  }
  return null;
}
function bruteCushion(project: SeatProjection, votes: Record<string, number>, id: string) {
  const current = project(votes)![id];
  for (let d = 1; d <= votes[id]; d++) {
    if (project({ ...votes, [id]: votes[id] - d })![id] < current) return d - 1;
  }
  return votes[id];
}

describe("seatMarginFor", () => {
  const votes = { a: 4_600, b: 3_100, c: 2_300 };

  it("matches brute force on a largest remainder race", () => {
    const project = lr(10);
    for (const id of Object.keys(votes)) {
      const m = seatMarginFor(project, votes, id);
      expect(m.toGain).toBe(bruteGain(project, votes, id));
      expect(m.toLose).toBe(bruteCushion(project, votes, id));
    }
  });

  it("accounts for the minimum share threshold", () => {
    const project = lr(10, 0.2);
    const close = { a: 6_000, b: 3_000, c: 1_900 };
    // c sits under 20% and holds no seat: gaining one means clearing the gate.
    expect(project(close)!.c).toBe(0);
    const m = seatMarginFor(project, close, "c");
    expect(m.toLose).toBeNull();
    expect(m.toGain).toBe(bruteGain(project, close, "c"));
  });

  it("gives the lead and the gap in a single seat race", () => {
    const race = { a: 5_000, b: 4_200 };
    expect(seatMarginFor(fptp, race, "a")).toEqual({ toGain: null, toLose: 800 });
    expect(seatMarginFor(fptp, race, "b")).toEqual({ toGain: 801, toLose: null });
  });

  it("returns null gain when the projection is unavailable", () => {
    expect(seatMarginFor(() => null, votes, "a")).toEqual({ toGain: null, toLose: null });
  });
});

describe("computeSeatMargins", () => {
  it("skips candidates without votes", () => {
    const out = computeSeatMargins(lr(5), { a: 100, b: 0 });
    expect(Object.keys(out)).toEqual(["a"]);
  });
});
