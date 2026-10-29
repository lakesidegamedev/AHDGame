import { describe, it, expect, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { Election } from "@/lib/db/types";
import {
  buildNationalElectionNight,
  electionNightStyle,
  electionNightTitle,
  isElectionNightType,
  majorityThreshold,
  pickElectionNightAnchor,
} from "./electionNight";

describe("electionNight helpers", () => {
  it("flags national multi-seat types for election night", () => {
    expect(isElectionNightType("commons")).toBe(true);
    expect(isElectionNightType("house")).toBe(true);
    expect(isElectionNightType("bundestag")).toBe(true);
    expect(isElectionNightType("governor")).toBe(false);
    expect(isElectionNightType("president")).toBe(false);
  });

  it("picks an active commons race over a completed house race", () => {
    const anchor = pickElectionNightAnchor([
      { id: "h1", electionType: "house", status: "completed" },
      { id: "c1", electionType: "commons", status: "active" },
      { id: "g1", electionType: "governor", status: "active" },
    ]);
    expect(anchor?.id).toBe("c1");
  });

  it("falls back to completed national races", () => {
    const anchor = pickElectionNightAnchor([
      { id: "c1", electionType: "commons", status: "completed" },
      { id: "g1", electionType: "governor", status: "active" },
    ]);
    expect(anchor?.id).toBe("c1");
  });

  it("titles and styles chambers correctly", () => {
    expect(electionNightTitle("commons")).toBe("Election Night · House of Commons");
    expect(electionNightTitle("house")).toBe("Election Night · House of Representatives");
    expect(electionNightStyle("commons")).toBe("westminster");
    expect(electionNightStyle("house")).toBe("generic");
    expect(majorityThreshold(650)).toBe(326);
  });
});

describe("buildNationalElectionNight", () => {
  const partyMap = new Map([
    ["A", { name: "Party A", abbreviation: "A", color: "#f00" }],
    ["B", { name: "Party B", abbreviation: "B", color: "#00f" }],
  ]);

  function region(id: string, state: string, extra: Partial<Election> = {}): Election {
    return {
      _id: new ObjectId(id.padStart(24, "0")),
      countryId: "JP",
      electionType: "sangiin",
      cycle: 3,
      state,
      totalSeats: 63,
      status: "active",
      allocationMethod: "dhondt",
      ...extra,
    } as unknown as Election;
  }

  function tally(election: Election, a: number, b: number) {
    return {
      electionId: election._id,
      state: election.state,
      totalVotes: { ca: 100, cb: 80 },
      candidateParties: { ca: "A", cb: "B" },
      seatsEstimate: { ca: a, cb: b },
      finalized: true,
    };
  }

  it("counts only this class's regions and holds the class not up as decided seats", async () => {
    const db = createInMemoryDb();
    const classI = [region("1", "R1", { chamberClass: 1 }), region("2", "R2", { chamberClass: 1 })];
    const classII = [
      region("3", "R1", { chamberClass: 2 }),
      region("4", "R2", { chamberClass: 2 }),
    ];
    db.seed("elections", [...classI, ...classII] as never[]);
    db.seed("electionVoteTallies", [tally(classI[0], 40, 23), tally(classI[1], 33, 30)]);
    db.seed("states", [
      { _id: "R1", name: "Region 1" },
      { _id: "R2", name: "Region 2" },
    ]);
    db.seed("electedOfficials", [
      {
        countryId: "JP",
        officeType: "sangiin",
        chamberClass: 2,
        party: "A",
        characterId: "c1",
        seatsHeld: 70,
      },
      {
        countryId: "JP",
        officeType: "sangiin",
        chamberClass: 2,
        party: "B",
        characterId: "c2",
        seatsHeld: 56,
      },
      // This class's sitting members are the ones being re-elected tonight.
      {
        countryId: "JP",
        officeType: "sangiin",
        chamberClass: 1,
        party: "A",
        characterId: "c3",
        seatsHeld: 60,
      },
      // Classless legacy rows retire as class elections fill seats.
      { countryId: "JP", officeType: "sangiin", party: "B", characterId: "c4", seatsHeld: 9 },
      { countryId: "JP", officeType: "shugiin", party: "B", characterId: "c5", seatsHeld: 200 },
    ]);

    const night = await buildNationalElectionNight(
      db as unknown as Db,
      classI[0],
      partyMap,
      null,
      false
    );

    expect(night?.regions.map((r) => r.electionId)).toEqual(classI.map((e) => e._id.toString()));
    expect(night?.totalRegions).toBe(2);
    expect(night?.totalSeats).toBe(252);
    expect(night?.majorityThreshold).toBe(127);
    const seats = Object.fromEntries(
      (night?.parties ?? []).map((p) => [p.party, [p.projectedSeats, p.declaredSeats]])
    );
    expect(seats).toEqual({ A: [73 + 70, 70], B: [53 + 56, 56] });
  });

  it.each([
    ["UK", "snap_commons"],
    ["JP", "snap_shugiin"],
    ["DE", "bundestag"],
  ] as const)(
    "excludes cancelled %s races from seats, declarations and projections",
    async (countryId, electionType) => {
      const db = createInMemoryDb();
      const live = [
        region("21", "R1", { countryId, electionType, totalSeats: 41 }),
        region("22", "R2", { countryId, electionType, totalSeats: 53 }),
      ];
      const cancelled = region("23", "R1", {
        countryId,
        electionType,
        totalSeats: 41,
        status: "cancelled",
      });
      db.seed("elections", [...live, cancelled] as never[]);
      db.seed("electionVoteTallies", [
        tally(live[0], 21, 20),
        tally(live[1], 30, 23),
        tally(cancelled, 41, 0),
      ]);
      const night = await buildNationalElectionNight(
        db as unknown as Db,
        live[0],
        partyMap,
        null,
        false
      );
      expect(night?.totalSeats).toBe(94);
      expect(night?.majorityThreshold).toBe(48);
      expect(night?.totalRegions).toBe(2);
      expect(night?.regionsDeclared).toBe(0);
      expect(night?.regions.map((r) => r.electionId)).toEqual(live.map((e) => e._id.toString()));
      expect(
        Object.fromEntries((night?.parties ?? []).map((p) => [p.party, p.projectedSeats]))
      ).toEqual({ A: 51, B: 43 });
    }
  );

  it("leaves chambers without classes unchanged", async () => {
    const db = createInMemoryDb();
    const seats = [
      region("5", "R1", {
        countryId: "UK",
        electionType: "commons",
        totalSeats: 10,
      } as Partial<Election>),
      region("6", "R2", {
        countryId: "UK",
        electionType: "commons",
        totalSeats: 10,
        status: "resolved",
      } as Partial<Election>),
    ];
    db.seed("elections", seats as never[]);
    db.seed("electionVoteTallies", [tally(seats[0], 6, 4), tally(seats[1], 3, 7)]);
    db.seed("electedOfficials", [
      { countryId: "UK", officeType: "commons", party: "A", characterId: "c1", seatsHeld: 5 },
    ]);
    const collection = vi.spyOn(db, "collection");

    const night = await buildNationalElectionNight(
      db as unknown as Db,
      seats[0],
      partyMap,
      null,
      false
    );

    expect(collection).not.toHaveBeenCalledWith("electedOfficials");
    expect(night?.totalSeats).toBe(20);
    expect(night?.majorityThreshold).toBe(11);
    expect(night?.regionsDeclared).toBe(1);
    const byParty = Object.fromEntries(
      (night?.parties ?? []).map((p) => [p.party, [p.projectedSeats, p.declaredSeats]])
    );
    expect(byParty).toEqual({ A: [9, 3], B: [11, 7] });
  });
});
