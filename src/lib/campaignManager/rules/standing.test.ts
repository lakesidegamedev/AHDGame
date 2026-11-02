import { describe, expect, it } from "vitest";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import {
  buildRaceIndex,
  lastDelta,
  myRaceSummary,
  partyLines,
  pollingSeries,
  raceStanding,
  regionFill,
  seatSummary,
  subunitShares,
} from "./index";
import { election } from "./__fixtures__/election";

const ctx = { currentTurn: 10, nationalChamberKeys: ["senate", "house"] };
const one = (e: ElectionResponse) => buildRaceIndex([e], ctx)[0];

describe("raceStanding", () => {
  it("reads the margin between the top two and its tier", () => {
    const s = raceStanding(
      one(
        election({
          cands: [
            { id: "a", name: "Ann", party: "1", share: 48.2 },
            { id: "b", name: "Bo", party: "2", share: 41.0 },
          ],
        })
      )
    );
    expect(s.leaderName).toBe("Ann");
    expect(s.runnerUpName).toBe("Bo");
    expect(s.margin).toBeCloseTo(7.2);
    expect(s.tier).toBe("lean");
  });

  it("uses party totals in a multi-seat race", () => {
    const race = one(
      election({
        electionType: "house",
        totalSeats: 10,
        cands: [
          { id: "a", name: "A1", party: "1", share: 30 },
          { id: "b", name: "A2", party: "1", share: 25 },
          { id: "c", name: "B1", party: "2", share: 45 },
        ],
      })
    );
    expect(partyLines(race).map((l) => [l.partyId, l.share])).toEqual([
      ["1", 55],
      ["2", 45],
    ]);
    expect(raceStanding(race).leaderName).toBe("Party 1");
    expect(raceStanding(race).tier).toBe("likely");
  });

  it("has no runner-up in a one-candidate race", () => {
    const s = raceStanding(
      one(election({ cands: [{ id: "a", name: "Ann", party: "1", share: 100 }] }))
    );
    expect(s.runnerUpName).toBeNull();
    expect(s.tier).toBe("safe");
  });
});

describe("regionFill", () => {
  it("is null with no races", () => {
    expect(regionFill([])).toBeNull();
  });

  it("leaves a region unshaded when none of its races has votes yet", () => {
    const open = buildRaceIndex(
      [election({ id: "o", inPrimary: true, inGeneral: false, byParty: [] })],
      ctx
    );
    const noVotes = one(
      election({ id: "n", polling: null, cands: [{ id: "a", name: "A", party: "1" }] })
    );
    expect(regionFill([...open, noVotes])).toBeNull();
  });

  it("shades one race by its leader and tier", () => {
    const race = one(
      election({
        cands: [
          { id: "a", name: "A", party: "1", share: 60 },
          { id: "b", name: "B", party: "2", share: 40 },
        ],
      })
    );
    expect(regionFill([race])).toEqual({ color: "#2563eb", tier: "safe" });
  });

  it("calls a split region a toss-up in the closer race's leader colour", () => {
    const r1 = one(
      election({
        id: "x",
        cands: [
          { id: "a", name: "A", party: "1", share: 60 },
          { id: "b", name: "B", party: "2", share: 40 },
        ],
      })
    );
    const r2 = one(
      election({
        id: "y",
        cands: [
          { id: "c", name: "C", party: "2", share: 52 },
          { id: "d", name: "D", party: "1", share: 48 },
        ],
      })
    );
    expect(regionFill([r1, r2])).toEqual({ color: "#dc2626", tier: "tossup" });
  });

  it("gives the party leading most races its likely shade", () => {
    const mk = (id: string, p: string, q: string) =>
      one(
        election({
          id,
          cands: [
            { id: id + "a", name: "A", party: p, share: 70 },
            { id: id + "b", name: "B", party: q, share: 30 },
          ],
        })
      );
    expect(regionFill([mk("x", "1", "2"), mk("y", "1", "2"), mk("z", "2", "1")])).toEqual({
      color: "#2563eb",
      tier: "likely",
    });
  });

  it("passes an unparseable party colour through untouched", () => {
    const race = one(election({ cands: [{ id: "a", name: "A", party: "1", share: 60 }] }));
    race.candidates[0].partyColor = "";
    expect(regionFill([race])?.color).toBe("");
  });
});

describe("seatSummary", () => {
  it("is null for a single-seat race", () => {
    expect(
      seatSummary(one(election({ cands: [{ id: "a", name: "A", party: "1", share: 60 }] })))
    ).toBeNull();
  });

  it("finds the majority and whether the leader holds it", () => {
    const race = one(
      election({
        electionType: "house",
        totalSeats: 59,
        seatsEstimate: { "1": 30, "2": 29 },
        cands: [
          { id: "a", name: "A", party: "1", share: 51 },
          { id: "b", name: "B", party: "2", share: 49 },
        ],
      })
    );
    const s = seatSummary(race)!;
    expect(s.majority).toBe(30);
    expect(s.leaderHasMajority).toBe(true);
    expect(s.order.map((o) => o.partyId)).toEqual(["1", "2"]);
    expect(s.shortBy).toBe(0);
  });

  it("reports how far the largest party is short", () => {
    const race = one(
      election({
        electionType: "house",
        totalSeats: 59,
        seatsEstimate: { "1": 26, "2": 20, "3": 13 },
        cands: [{ id: "a", name: "A", party: "1", share: 44 }],
      })
    );
    expect(seatSummary(race)!.shortBy).toBe(4);
  });
});

describe("subunitShares", () => {
  it("turns votes into sorted percentages", () => {
    expect(subunitShares({ a: 40, b: 60 }, { a: "1", b: "2" })).toEqual([
      { candidateId: "b", partyId: "2", pct: 60 },
      { candidateId: "a", partyId: "1", pct: 40 },
    ]);
    expect(subunitShares({}, {})).toEqual([]);
  });
});

describe("pollingSeries and lastDelta", () => {
  const race = one(
    election({
      cands: [
        { id: "a", name: "A", party: "1", share: 52 },
        { id: "b", name: "B", party: "2", share: 48 },
      ],
    })
  );

  it("is empty before any snapshot and the delta is zero", () => {
    expect(pollingSeries(election({}), race)).toEqual([]);
    expect(lastDelta([], "a")).toBe(0);
  });

  it("reads general turn snapshots by candidate, with their counted votes", () => {
    const full = election({
      generalVotes: {
        turnSnapshots: [
          { turn: 8, sharesPct: { a: 50, b: 50 } },
          { turn: 9, sharesPct: { a: 52, b: 48 }, cumulativeVotes: { a: 5200, b: 4800 } },
        ],
      } as unknown as ElectionResponse["generalVotes"],
    });
    const series = pollingSeries(full, race);
    expect(series).toEqual([
      { turn: 8, shares: { a: 50, b: 50 } },
      { turn: 9, shares: { a: 52, b: 48 }, votes: { a: 5200, b: 4800 } },
    ]);
    expect(lastDelta(series, "a")).toBeCloseTo(2);
  });

  it("reads one party's primary snapshots in order", () => {
    const primary = buildRaceIndex(
      [
        election({
          id: "e",
          inPrimary: true,
          inGeneral: false,
          byParty: [
            { partyId: "1", partyName: "P", partyColor: "#000000", candidates: [] },
          ] as unknown as ElectionResponse["byParty"],
        }),
      ],
      ctx
    )[0];
    const full = election({
      snapshotHistory: [
        {
          recordedAt: new Date(1),
          byParty: {
            "1": [{ candidateId: "a", sharePct: 55 }],
            "2": [{ candidateId: "z", sharePct: 100 }],
          },
        },
        { recordedAt: new Date(2), byParty: { "1": [{ candidateId: "a", sharePct: 58 }] } },
      ] as unknown as ElectionResponse["snapshotHistory"],
    });
    expect(pollingSeries(full, primary)).toEqual([
      { turn: 1, shares: { a: 55 } },
      { turn: 2, shares: { a: 58 } },
    ]);
  });

  it("keys a multi-seat race by party", () => {
    const multi = one(
      election({
        electionType: "house",
        totalSeats: 10,
        cands: [
          { id: "a", name: "A", party: "1", share: 60 },
          { id: "b", name: "B", party: "1", share: 0 },
          { id: "c", name: "C", party: "2", share: 40 },
        ],
      })
    );
    const full = election({
      generalVotes: {
        turnSnapshots: [
          {
            turn: 9,
            sharesPct: { a: 35, b: 25, c: 40 },
            cumulativeVotes: { a: 350, b: 250, c: 400 },
          },
        ],
      } as unknown as ElectionResponse["generalVotes"],
    });
    expect(pollingSeries(full, multi)).toEqual([
      { turn: 9, shares: { "1": 60, "2": 40 }, votes: { "1": 600, "2": 400 } },
    ]);
  });
});

describe("myRaceSummary", () => {
  it("is null when the player is in no race", () => {
    expect(myRaceSummary(undefined)).toBeNull();
  });

  it("gives the player's position and gap", () => {
    const race = one(
      election({
        cands: [
          { id: "a", name: "A", party: "2", share: 40.4 },
          { id: "b", name: "Me", party: "1", share: 36.4, isYou: true },
          { id: "c", name: "C", party: "3", share: 23.2 },
        ],
      })
    );
    expect(myRaceSummary(race)).toEqual({
      position: 2,
      share: 36.4,
      gap: 4,
      leading: false,
      partySeats: null,
      totalSeats: null,
    });
  });
});
