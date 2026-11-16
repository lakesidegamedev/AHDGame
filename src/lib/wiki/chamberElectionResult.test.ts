import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { foldRegionTallies, sameChamberTypes } from "./chamberElectionResult";

const info = new Map([
  ["1", { name: "Labour Party", abbreviation: "LAB", color: "#e00" }],
  ["2", { name: "Conservative Party", abbreviation: "CON", color: "#00e" }],
]);

describe("sameChamberTypes", () => {
  it("lets a snap election compare with the general election of its chamber", () => {
    expect(sameChamberTypes("snap_commons")).toEqual(
      expect.arrayContaining(["commons", "snap_commons"])
    );
    expect(sameChamberTypes("snap_commons")).not.toContain("bundestag");
  });

  it("falls back to the type itself", () => {
    expect(sameChamberTypes("somethingElse")).toEqual(["somethingElse"]);
  });
});

describe("foldRegionTallies", () => {
  const a = new ObjectId();
  const b = new ObjectId();

  it("adds seats and votes across regions by party", () => {
    const { parties, totalSeats } = foldRegionTallies(
      [
        { _id: a, totalSeats: 3 },
        { _id: b, totalSeats: 2 },
      ],
      [
        {
          electionId: a,
          totalVotes: { c1: 100, c2: 60 },
          candidateParties: { c1: "1", c2: "2" },
          seatsEstimate: { c1: 2, c2: 1 },
          finalized: true,
        },
        {
          electionId: b,
          totalVotes: { c3: 10, c4: 90 },
          candidateParties: { c3: "1", c4: "2" },
          seatsEstimate: { c4: 2 },
          finalized: true,
        },
      ],
      info
    );
    expect(totalSeats).toBe(5);
    const lab = parties.find((p) => p.partyId === "1");
    const con = parties.find((p) => p.partyId === "2");
    expect(lab).toMatchObject({ seats: 2, votes: 110, name: "Labour Party" });
    expect(con).toMatchObject({ seats: 3, votes: 150 });
  });

  it("treats a party with no listed info as independent and ignores regions without a tally", () => {
    const { parties, totalSeats } = foldRegionTallies(
      [
        { _id: a, totalSeats: 1 },
        { _id: b, totalSeats: 4 },
      ],
      [
        {
          electionId: a,
          totalVotes: { c1: 5 },
          candidateParties: {},
          seatsEstimate: { c1: 1 },
          finalized: true,
        },
      ],
      info
    );
    expect(totalSeats).toBe(5);
    expect(parties).toHaveLength(1);
    expect(parties[0]).toMatchObject({ partyId: "independent", name: "Independent", seats: 1 });
  });

  it("falls back to the stored allocation when the tally is not flagged final", () => {
    const { parties } = foldRegionTallies(
      [{ _id: a, totalSeats: 2 }],
      [
        {
          electionId: a,
          totalVotes: { c1: 5 },
          candidateParties: { c1: "1" },
          seatsEstimate: { c1: 2 },
          finalized: false,
        },
      ],
      info
    );
    expect(parties[0].seats).toBe(2);
  });
});
