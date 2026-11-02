import { describe, expect, it } from "vitest";
import type { ElectionResponse } from "@/lib/elections/electionResponseTypes";
import {
  buildRaceIndex,
  filterRaces,
  finishedYears,
  initialsOf,
  raceScope,
  sortRaces,
  type CmRace,
} from "./index";
import { cand, election } from "./__fixtures__/election";

const ctx = { currentTurn: 10, nationalChamberKeys: ["senate", "house"] };

describe("raceScope", () => {
  it("treats a national chamber and its snap or special variants as national", () => {
    expect(raceScope("snap_commons", ["commons", "lords"])).toBe("national");
    expect(raceScope("special_commons", ["commons"])).toBe("national");
    expect(raceScope("governor", ["senate", "house"])).toBe("regional");
  });
});

describe("initialsOf", () => {
  it("abbreviates a party name when the party has no abbreviation", () => {
    expect(initialsOf("Social Democratic Party")).toBe("SDP");
    expect(initialsOf("Labour")).toBe("LAB");
    expect(initialsOf("")).toBe("");
  });
});

describe("buildRaceIndex", () => {
  it("returns nothing for no elections", () => {
    expect(buildRaceIndex([], ctx)).toEqual([]);
  });

  it("skips a race that has not opened yet", () => {
    const races = buildRaceIndex(
      [election({ id: "u", isUpcoming: true, inGeneral: false, inPrimary: false })],
      ctx
    );
    expect(races).toEqual([]);
  });

  it("skips the presidency and ended races", () => {
    const races = buildRaceIndex(
      [
        election({ id: "p", electionType: "president" }),
        election({ id: "x", isEnded: true }),
        election({ id: "s", cands: [{ id: "a", name: "A", party: "1", share: 55 }] }),
      ],
      ctx
    );
    expect(races.map((r) => r.key)).toEqual(["s"]);
  });

  it("splits a primary into one race per party with in-party shares", () => {
    const a = cand({ id: "a", name: "Ann", party: "1", share: 60 });
    const b = cand({ id: "b", name: "Bo", party: "1", share: 40 });
    const c = cand({ id: "c", name: "Cy", party: "2", share: 100 });
    const races = buildRaceIndex(
      [
        election({
          id: "e9",
          inPrimary: true,
          inGeneral: false,
          byParty: [
            { partyId: "1", partyName: "Party 1", partyColor: "#2563eb", candidates: [a, b] },
            { partyId: "2", partyName: "Party 2", partyColor: "#dc2626", candidates: [c] },
          ] as unknown as ElectionResponse["byParty"],
        }),
      ],
      ctx
    );
    expect(races.map((r) => r.key)).toEqual(["e9:1", "e9:2"]);
    expect(races[0].stage).toBe("primary");
    expect(races[0].primaryPartyId).toBe("1");
    expect(races[0].primaryPartyName).toBe("Party 1");
    expect(races[0].candidates.map((x) => x.share)).toEqual([60, 40]);
    // Same party, so each primary candidate gets a colour of their own; the leader keeps the party's.
    expect(races[0].candidates[0].color).toBe("#2563eb");
    expect(races[0].candidates[1].color).not.toBe("#2563eb");
    // Primary end turn 6 is behind turn 10: a deadline in the past reads as 0, never negative.
    expect(races[0].turnsLeft).toBe(0);
  });

  it("lists a primary nobody has entered as one open race", () => {
    const [race, ...rest] = buildRaceIndex(
      [
        election({
          id: "open",
          inPrimary: true,
          inGeneral: false,
          byParty: [],
          primaryEndTurn: 14,
        }),
      ],
      ctx
    );
    expect(rest).toEqual([]);
    expect(race.key).toBe("open");
    expect(race.stage).toBe("primary");
    expect(race.primaryPartyId).toBeNull();
    expect(race.candidates).toEqual([]);
    expect(race.turnsLeft).toBe(4);
  });

  it("counts turns left to the primary end in a primary and to the end in a general", () => {
    const general = buildRaceIndex(
      [election({ cands: [{ id: "a", name: "A", party: "1", share: 50 }] })],
      ctx
    );
    expect(general[0].turnsLeft).toBe(2);
    const primary = buildRaceIndex(
      [
        election({
          inPrimary: true,
          inGeneral: false,
          primaryEndTurn: 13,
          byParty: [
            {
              partyId: "1",
              partyName: "P",
              partyColor: "#000000",
              candidates: [cand({ id: "a", name: "A", party: "1" })],
            },
          ] as unknown as ElectionResponse["byParty"],
        }),
      ],
      ctx
    );
    expect(primary[0].turnsLeft).toBe(3);
  });

  it("leaves turns left unknown when the current turn is unknown", () => {
    const [race] = buildRaceIndex(
      [election({ cands: [{ id: "a", name: "A", party: "1", share: 50 }] })],
      { ...ctx, currentTurn: null }
    );
    expect(race.turnsLeft).toBeNull();
  });

  it("marks a general with no counted votes as having no polling", () => {
    const [race] = buildRaceIndex(
      [
        election({
          polling: null,
          cands: [{ id: "a", name: "A", party: "1" }],
        }),
      ],
      ctx
    );
    expect(race.hasPolling).toBe(false);
    expect(race.candidates[0].share).toBe(0);
  });

  it("carries the class, the player's race and multi-seat fields", () => {
    const [race] = buildRaceIndex(
      [
        election({
          electionType: "house",
          senateClass: 2,
          totalSeats: 15,
          seatsEstimate: { "1": 9, "2": 6 },
          cands: [{ id: "a", name: "A", party: "1", share: 51, isYou: true }],
        }),
      ],
      ctx
    );
    expect(race.classNum).toBe(2);
    expect(race.candidates[0].characterDbId).toBe("db-ch-a");
    expect(race.isMine).toBe(true);
    expect(race.multiSeat).toBe(true);
    expect(race.scope).toBe("national");
  });
});

describe("filterRaces and sortRaces", () => {
  const races: CmRace[] = buildRaceIndex(
    [
      election({
        id: "a",
        state: "OH",
        cands: [
          { id: "1", name: "Grant Pruitt", party: "1", share: 51 },
          { id: "2", name: "Z", party: "2", share: 49 },
        ],
      }),
      election({
        id: "b",
        state: "PA",
        cands: [
          { id: "3", name: "Ivy", party: "1", share: 70 },
          { id: "4", name: "Q", party: "2", share: 30 },
        ],
      }),
      election({
        id: "c",
        state: "MI",
        cands: [
          { id: "5", name: "Me", party: "1", share: 40, isYou: true },
          { id: "6", name: "R", party: "2", share: 60 },
        ],
      }),
      election({
        id: "d",
        electionType: "governor",
        state: "OH",
        cands: [{ id: "7", name: "Gov", party: "1", share: 50 }],
      }),
    ],
    ctx
  );
  const names = { OH: "Ohio", PA: "Pennsylvania", MI: "Michigan" };

  it("matches a candidate name case-insensitively", () => {
    const out = filterRaces(races, {
      type: "senate",
      stage: "all",
      regionId: "ALL",
      query: "pruitt",
      regionNames: names,
    });
    expect(out.map((r) => r.key)).toEqual(["a"]);
  });

  it("matches a region name and narrows by region and type", () => {
    expect(
      filterRaces(races, {
        type: "senate",
        stage: "all",
        regionId: "ALL",
        query: "penn",
        regionNames: names,
      }).map((r) => r.key)
    ).toEqual(["b"]);
    expect(
      filterRaces(races, {
        type: "senate",
        stage: "all",
        regionId: "OH",
        query: "",
        regionNames: names,
      }).map((r) => r.key)
    ).toEqual(["a"]);
    expect(
      filterRaces(races, {
        type: "senate",
        stage: "primary",
        regionId: "ALL",
        query: "",
        regionNames: names,
      })
    ).toEqual([]);
  });

  it("sorts the player's race first, then watched, then the closest", () => {
    const senate = filterRaces(races, {
      type: "senate",
      stage: "all",
      regionId: "ALL",
      query: "",
      regionNames: names,
    });
    expect(sortRaces(senate, new Set()).map((r) => r.key)).toEqual(["c", "a", "b"]);
    expect(sortRaces(senate, new Set(["b"])).map((r) => r.key)).toEqual(["c", "b", "a"]);
  });
});

describe("finished races", () => {
  const finished = (
    over: Partial<ElectionResponse> & { cands?: Parameters<typeof election>[0]["cands"] }
  ) =>
    election({
      status: "resolved",
      isEnded: true,
      inGeneral: false,
      electionYear: 1988,
      cycle: 3,
      seatId: "US-senate-OH-1",
      cands: [
        { id: "a", name: "Ann", party: "1", share: 58 },
        { id: "b", name: "Bo", party: "2", share: 42 },
      ],
      ...over,
    });
  const withFinal = { ...ctx, includeFinal: true };

  it("emits a final row for a finished race only when asked", () => {
    expect(buildRaceIndex([finished({})], ctx)).toEqual([]);
    const [row] = buildRaceIndex([finished({})], withFinal);
    expect(row).toMatchObject({
      key: "e1",
      stage: "final",
      year: 1988,
      cycle: 3,
      seatId: "US-senate-OH-1",
      winnerId: "a",
      turnsLeft: null,
      hasPolling: true,
    });
    expect(row.candidates.map((c) => c.share)).toEqual([58, 42]);
  });

  it("emits a finished race's party primaries from its primary results", () => {
    const rows = buildRaceIndex(
      [
        finished({
          primaryResults: {
            "1": [
              { candidateId: "a", characterName: "Ann", sharePct: 70, won: true },
              { candidateId: "c", characterName: "Cy", sharePct: 30, won: false },
            ],
          },
        }),
      ],
      withFinal
    );
    const primary = rows.find((r) => r.key === "e1:1");
    expect(primary).toMatchObject({ stage: "final", primaryPartyId: "1", winnerId: "a" });
    expect(primary?.candidates.map((c) => [c.name, c.share])).toEqual([
      ["Ann", 70],
      ["Cy", 30],
    ]);
  });

  const f = (over: Partial<Parameters<typeof filterRaces>[1]>) => ({
    type: "senate",
    stage: "all" as const,
    regionId: "ALL",
    query: "",
    regionNames: {},
    ...over,
  });
  const live = election({ id: "l", cands: [{ id: "x", name: "X", party: "1", share: 50 }] });
  const all = buildRaceIndex(
    [live, finished({ id: "f88" }), finished({ id: "f94", electionYear: 1994 })],
    withFinal
  );

  it("keeps finished races out of All", () => {
    expect(filterRaces(all, f({})).map((r) => r.key)).toEqual(["l"]);
  });

  it("narrows Finished to the chosen year", () => {
    expect(filterRaces(all, f({ stage: "final", year: 1994 })).map((r) => r.key)).toEqual(["f94"]);
    expect(filterRaces(all, f({ stage: "final" })).map((r) => r.key)).toEqual(["f88", "f94"]);
  });

  it("lists finished years newest first", () => {
    expect(finishedYears(all, "senate")).toEqual([1994, 1988]);
    expect(finishedYears(all, "governor")).toEqual([]);
  });
});

describe("finished primaries", () => {
  const primaryResults = {
    "1": [
      { candidateId: "a", characterName: "Ann", sharePct: 70, won: true },
      { candidateId: "c", characterName: "Cy", sharePct: 30, won: false },
    ],
  };
  const f = (over: Partial<Parameters<typeof filterRaces>[1]>) => ({
    type: "senate",
    stage: "all" as const,
    regionId: "ALL",
    query: "",
    regionNames: {},
    ...over,
  });

  it("offers a live race's finished primary as a final row", () => {
    const rows = buildRaceIndex(
      [
        election({
          id: "g",
          cands: [{ id: "a", name: "Ann", party: "1", share: 50 }],
          primaryResults,
        }),
      ],
      ctx
    );
    expect(rows.map((r) => [r.key, r.stage])).toEqual([
      ["g", "general"],
      ["g:1", "final"],
    ]);
  });

  it("lists finished primaries under no stage: they open from their race", () => {
    const rows = buildRaceIndex(
      [
        election({
          id: "g",
          cands: [{ id: "a", name: "Ann", party: "1", share: 50 }],
          primaryResults,
        }),
        election({
          id: "old",
          status: "resolved",
          isEnded: true,
          inGeneral: false,
          electionYear: 1988,
          cands: [{ id: "a", name: "Ann", party: "1", share: 60 }],
          primaryResults,
        }),
      ],
      { ...ctx, includeFinal: true }
    );
    expect(filterRaces(rows, f({})).map((r) => r.key)).toEqual(["g"]);
    expect(filterRaces(rows, f({ stage: "final", year: 1988 })).map((r) => r.key)).toEqual(["old"]);
  });
});
