import { describe, expect, it } from "vitest";
import { buildRaceIndex } from "@/lib/campaignManager/rules";
import { election, cand } from "@/lib/campaignManager/rules/__fixtures__/election";
import { countySourceFor, unitRowsFrom, visibleRegions } from "./mapModel";

const ctx = { currentTurn: 10, nationalChamberKeys: ["senate", "house"] };

describe("countySourceFor", () => {
  it("reads a general race's tally", () => {
    const race = buildRaceIndex(
      [election({ id: "e1", cands: [{ id: "a", name: "A", party: "1", share: 60 }] })],
      ctx
    )[0];
    const src = countySourceFor(race)!;
    expect(src.id).toBe("general");
    expect(src.url("OH")).toBe("/api/elections/e1/state/OH/subdivision-results");
  });

  it("projects one party's primary from its live shares", () => {
    const race = buildRaceIndex(
      [
        election({
          id: "e2",
          inPrimary: true,
          inGeneral: false,
          byParty: [
            {
              partyId: "7",
              partyName: "P",
              partyColor: "#000000",
              candidates: [cand({ id: "a", name: "A", party: "7", share: 100 })],
            },
          ] as never,
        }),
      ],
      ctx
    )[0];
    const src = countySourceFor(race)!;
    expect(src.id).toBe("projected:7");
    expect(src.url("OH")).toBe("/api/elections/e2/state/OH/projected-subdivisions?party=7");
  });

  it("projects a general that has no counted votes yet", () => {
    const race = buildRaceIndex(
      [election({ id: "e4", polling: null, cands: [{ id: "a", name: "A", party: "1" }] })],
      ctx
    )[0];
    const src = countySourceFor(race)!;
    expect(src.id).toBe("projected:general");
    expect(src.url("OH")).toBe("/api/elections/e4/state/OH/projected-subdivisions");
  });

  it("has nothing to read in a primary nobody has entered", () => {
    const race = buildRaceIndex(
      [election({ id: "e3", inPrimary: true, inGeneral: false, byParty: [] })],
      ctx
    )[0];
    expect(countySourceFor(race)).toBeNull();
  });
});

describe("unitRowsFrom", () => {
  it("shades each sub-unit by its leader and margin, with shares and the holder baseline", () => {
    const rows = unitRowsFrom(
      {
        viewBox: "0 0 1 1",
        subdivisions: [
          {
            id: "u1",
            name: "Adams",
            path: "M0,0Z",
            votes: { a: 70, b: 30 },
            margin: 40,
            winner: "a",
            baselineLeader: "CON",
          },
          {
            id: "u2",
            name: "Allen",
            path: "M1,1Z",
            votes: { a: 51, b: 49 },
            margin: 2,
            winner: "a",
          },
        ],
        candidateNames: { a: "Ann", b: "Bo" },
        candidateParties: { a: "1", b: "2" },
        partyColors: { "1": "#2563eb", "2": "#dc2626" },
      },
      "#0c0c12"
    );
    expect(rows[0]).toMatchObject({
      id: "u1",
      tier: "safe",
      leaderPartyId: "1",
      baselineLeader: "CON",
    });
    expect(rows[0].shares[0]).toEqual({ name: "Ann", partyId: "1", color: "#2563eb", pct: 70 });
    expect(rows[1].tier).toBe("tossup");
    expect(rows[0].fill).not.toBe(rows[1].fill);
  });
});

describe("visibleRegions", () => {
  it("keeps regions whose boxes overlap the view", () => {
    const regions = {
      A: { n: "A", d: "", bb: [0, 0, 10, 10] as [number, number, number, number], nb: [] },
      B: { n: "B", d: "", bb: [100, 100, 110, 110] as [number, number, number, number], nb: [] },
    };
    expect(visibleRegions(regions, { k: 4, x: 0, y: 0 }, 100, 100)).toEqual(["A"]);
    expect(visibleRegions(regions, { k: 1, x: 0, y: 0 }, 200, 200).sort()).toEqual(["A", "B"]);
  });
});
