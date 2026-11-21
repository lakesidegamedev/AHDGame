import { describe, expect, it } from "vitest";
import {
  arcSeats,
  buildPartyRows,
  formatSignedInt,
  formatSwing,
  majoritySeats,
  seatChange,
  stateWinnerRows,
  swingPoints,
  type ChamberPartyInput,
} from "./electionResults";

const party = (partyId: string, seats: number, votes: number): ChamberPartyInput => ({
  partyId,
  name: `Party ${partyId}`,
  abbreviation: partyId.toUpperCase(),
  color: `#00000${partyId}`,
  seats,
  votes,
});

describe("seatChange and swingPoints", () => {
  it("is unknown without a previous election", () => {
    expect(seatChange(10, null)).toBeNull();
    expect(seatChange(10, undefined)).toBeNull();
    expect(swingPoints(40, null)).toBeNull();
  });

  it("subtracts previous from current", () => {
    expect(seatChange(10, 14)).toBe(-4);
    expect(swingPoints(41.5, 38)).toBeCloseTo(3.5);
  });
});

describe("majoritySeats", () => {
  it("is more than half", () => {
    expect(majoritySeats(650)).toBe(326);
    expect(majoritySeats(91)).toBe(46);
  });
});

describe("buildPartyRows", () => {
  it("computes vote share, seat change and swing against the previous election", () => {
    const rows = buildPartyRows(
      [party("1", 6, 600), party("2", 4, 400)],
      [party("1", 3, 300), party("2", 7, 700)]
    );
    expect(rows[0]).toMatchObject({ partyId: "1", votePct: 60, seatChange: 3 });
    expect(rows[0].swing).toBeCloseTo(30);
    expect(rows[1]).toMatchObject({ partyId: "2", seatChange: -3 });
    expect(rows[1].swing).toBeCloseTo(-30);
  });

  it("treats a party missing from the previous election as starting from zero", () => {
    const rows = buildPartyRows([party("1", 5, 50), party("3", 2, 50)], [party("1", 5, 100)]);
    const newcomer = rows.find((r) => r.partyId === "3");
    expect(newcomer?.seatChange).toBe(2);
    expect(newcomer?.swing).toBeCloseTo(50);
  });

  it("leaves changes unknown with no previous election", () => {
    const rows = buildPartyRows([party("1", 5, 50)], null);
    expect(rows[0].seatChange).toBeNull();
    expect(rows[0].swing).toBeNull();
  });

  it("sorts by seats, then votes", () => {
    const rows = buildPartyRows([party("1", 2, 10), party("2", 5, 1), party("3", 2, 30)], null);
    expect(rows.map((r) => r.partyId)).toEqual(["2", "3", "1"]);
  });

  it("gives no vote share when no votes were recorded", () => {
    expect(buildPartyRows([party("1", 1, 0)], null)[0].votePct).toBeNull();
  });
});

describe("arcSeats", () => {
  it("draws one dot per seat and assigns parties in order", () => {
    const { seats } = arcSeats(
      [
        { partyId: "1", color: "#111111", seats: 30 },
        { partyId: "2", color: "#222222", seats: 20 },
      ],
      60
    );
    expect(seats).toHaveLength(60);
    expect(seats.filter((s) => s.partyId === "1")).toHaveLength(30);
    expect(seats.filter((s) => s.partyId === "2")).toHaveLength(20);
    expect(seats.filter((s) => s.partyId === null)).toHaveLength(10);
  });

  it("keeps every dot on the upper half circle", () => {
    const { seats } = arcSeats([{ partyId: "1", color: "#111111", seats: 100 }], 100);
    for (const s of seats) {
      expect(s.y).toBeLessThanOrEqual(0);
      expect(Math.hypot(s.x, s.y)).toBeLessThanOrEqual(1.0001);
    }
  });

  it("puts the first party to the left of the second", () => {
    const { seats } = arcSeats(
      [
        { partyId: "1", color: "#111111", seats: 40 },
        { partyId: "2", color: "#222222", seats: 40 },
      ],
      80
    );
    const meanX = (id: string) => {
      const own = seats.filter((s) => s.partyId === id);
      return own.reduce((a, s) => a + s.x, 0) / own.length;
    };
    expect(meanX("1")).toBeLessThan(meanX("2"));
  });

  it("returns nothing for an empty chamber", () => {
    expect(arcSeats([], 0).seats).toEqual([]);
  });
});

describe("formatters", () => {
  it("signs changes", () => {
    expect(formatSignedInt(3)).toBe("+3");
    expect(formatSignedInt(-2)).toBe("-2");
    expect(formatSignedInt(0)).toBe("0");
    expect(formatSignedInt(null)).toBe("");
    expect(formatSwing(2.345)).toBe("+2.3");
    expect(formatSwing(-0.04)).toBe("0.0");
  });
});

describe("stateWinnerRows", () => {
  it("names the winner, margin and electoral votes per state", () => {
    const rows = stateWinnerRows({
      OH: { votesByCandidate: { a: 55, b: 45 }, evByCandidate: { a: 17 } },
      TX: { votesByCandidate: { a: 40, b: 60 }, evByCandidate: { b: 40 } },
      WY: { votesByCandidate: {}, evByCandidate: {} },
    });
    expect(rows.map((r) => r.stateId)).toEqual(["TX", "OH", "WY"]);
    expect(rows[0]).toMatchObject({ winnerId: "b", electoralVotes: 40 });
    expect(rows[0].marginPct).toBeCloseTo(20);
    expect(rows[1].winnerPct).toBeCloseTo(55);
    expect(rows[2]).toMatchObject({ winnerId: null, marginPct: null, electoralVotes: 0 });
  });
});
