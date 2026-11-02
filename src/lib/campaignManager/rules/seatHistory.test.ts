import { describe, expect, it } from "vitest";
import { adjacentCycles, orderSeatCycles, summarizeSeatCycle, type SeatCycleInput } from "./index";

const input = (over: Partial<SeatCycleInput> = {}): SeatCycleInput => ({
  electionId: "e1",
  cycle: 1,
  year: 1988,
  status: "completed",
  candidates: [
    { id: "a", name: "A", partyId: "1" },
    { id: "b", name: "B", partyId: "2" },
    { id: "c", name: "C", partyId: "1" },
  ],
  parties: {
    "1": { name: "Democratic", abbr: "DEM", color: "#2563eb" },
    "2": { name: "Republican", abbr: "GOP", color: "#dc2626" },
  },
  totalVotes: { a: 600, b: 400 },
  primaryResults: null,
  ...over,
});

describe("summarizeSeatCycle", () => {
  it("names the winner and margin of a finished race from its counted votes", () => {
    const c = summarizeSeatCycle(input());
    expect(c.state).toBe("final");
    expect(c.winner).toEqual({ name: "A", partyId: "1", partyAbbr: "DEM", partyColor: "#2563eb" });
    expect(c.margin).toBe(20);
  });

  it("has no winner when a finished race has no counted votes", () => {
    for (const totalVotes of [null, { a: 0, b: 0 }]) {
      const c = summarizeSeatCycle(input({ totalVotes }));
      expect(c.state).toBe("final");
      expect(c.winner).toBeNull();
      expect(c.margin).toBeNull();
    }
  });

  it("treats completed and resolved alike", () => {
    expect(summarizeSeatCycle(input({ status: "completed" })).state).toBe("final");
    expect(summarizeSeatCycle(input({ status: "resolved" })).state).toBe("final");
    expect(summarizeSeatCycle(input({ status: "upcoming" })).state).toBe("upcoming");
    expect(summarizeSeatCycle(input({ status: "active" })).state).toBe("live");
  });

  it("gives a live race no winner even with votes", () => {
    const c = summarizeSeatCycle(input({ status: "active" }));
    expect(c.winner).toBeNull();
    expect(c.margin).toBeNull();
  });

  it("reads each party's finished primary", () => {
    const c = summarizeSeatCycle(
      input({
        primaryResults: {
          "1": [
            { candidateId: "a", characterName: "A", sharePct: 60, won: true },
            { candidateId: "c", characterName: "C", sharePct: 40, won: false },
          ],
        },
      })
    );
    expect(c.primaries).toEqual([{ partyId: "1", winnerName: "A", margin: 20 }]);
  });
});

describe("orderSeatCycles and adjacentCycles", () => {
  it("orders newest first and finds the neighbours by cycle", () => {
    const cycles = [1, 3, 2].map((n) =>
      summarizeSeatCycle(input({ electionId: `e${n}`, cycle: n }))
    );
    expect(orderSeatCycles(cycles).map((c) => c.cycle)).toEqual([3, 2, 1]);
    const mid = adjacentCycles(cycles, "e2");
    expect(mid.prev?.cycle).toBe(1);
    expect(mid.next?.cycle).toBe(3);
    expect(adjacentCycles(cycles, "e1").prev).toBeNull();
    expect(adjacentCycles(cycles, "e3").next).toBeNull();
  });
});
