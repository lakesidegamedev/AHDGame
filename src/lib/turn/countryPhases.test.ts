import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { COUNTRY_BILL_PHASES, COUNTRY_ELECTION_PHASES } from "./countryPhases";
import { ensureIEElections } from "./perpetualElections";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/discordWebhooks", () => ({
  sendCountryGameEvent: vi.fn().mockResolvedValue(undefined),
  DISCORD_COLORS: { govCollapsed: 0, govFormed: 0 },
}));
vi.mock("@/lib/notifications", () => ({
  createNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/turn/parliamentaryGovernment", async () => {
  const actual = await vi.importActual<typeof import("@/lib/turn/parliamentaryGovernment")>(
    "@/lib/turn/parliamentaryGovernment"
  );
  return {
    ...actual,
    resetParliamentaryGovernmentAfterElection: vi.fn().mockResolvedValue(undefined),
  };
});

let db: MockDb;

beforeEach(async () => {
  db = createMockDb();
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
});

import { runPostElectionGovernmentPhases } from "./countryPhases";

function isLiveStatusFilter(filter: Record<string, unknown>): boolean {
  const statusIn = (filter.status as { $in?: string[] } | undefined)?.$in ?? [];
  return statusIn.includes("active") || statusIn.includes("upcoming");
}

function setupElectionQuery(
  resolvedThisTurn: {
    countryId: string;
    electionType: string;
    cycle?: number;
    startTurn?: number;
  }[],
  stillLive: { countryId: string; electionType: string; cycle?: number; startTurn?: number }[] = []
) {
  db.collectionMocks["elections"] = {
    ...db.collection("elections"),
    find: vi.fn().mockImplementation((filter: Record<string, unknown>) => {
      const types = (filter.electionType as { $in?: string[] } | undefined)?.$in ?? [];
      const countries = (filter.countryId as { $in?: string[] } | undefined)?.$in ?? [];
      const pool = isLiveStatusFilter(filter) ? stillLive : resolvedThisTurn;
      const rows = pool.filter(
        (e) => countries.includes(e.countryId) && types.includes(e.electionType)
      );
      return {
        toArray: vi
          .fn()
          .mockResolvedValue(
            rows.map((e) => ({ ...e, startTurn: e.startTurn ?? (e.cycle ?? 1) * 10 }))
          ),
        sort: vi.fn().mockReturnThis(),
      };
    }),
  } as MockDb["collectionMocks"][string];
}

describe("runPostElectionGovernmentPhases — dissolution slate-clearing", () => {
  it.each(["UK", "JP", "DE"] as const)(
    "collects one %s reset only after its entire snap slate ends",
    async (countryId) => {
      const { getCountryConfig } = await import("@/lib/constants/countries");
      const electionType = "snap_" + getCountryConfig(countryId).legislature.lowerChamber.key;
      setupElectionQuery(
        [{ countryId, electionType, cycle: 3 }],
        [{ countryId, electionType, cycle: 3 }]
      );
      expect(
        (await runPostElectionGovernmentPhases(db as unknown as Db, new Date(), 1, 100))
          .completedSnaps
      ).toEqual([]);
      setupElectionQuery(
        [{ countryId, electionType, cycle: 3 }],
        [{ countryId, electionType, cycle: 4 }]
      );
      expect(
        (await runPostElectionGovernmentPhases(db as unknown as Db, new Date(), 1, 100))
          .completedSnaps
      ).toEqual([{ countryId, startTurn: 30, turn: 100 }]);
    }
  );
  it("waits for all snap regions even when their cycle numbers differ", async () => {
    setupElectionQuery(
      [{ countryId: "UK", electionType: "snap_commons", cycle: 5, startTurn: 100 }],
      [{ countryId: "UK", electionType: "snap_commons", cycle: 2, startTurn: 100 }]
    );
    expect(
      (await runPostElectionGovernmentPhases(db as unknown as Db, new Date(), 1, 148))
        .completedSnaps
    ).toEqual([]);
    setupElectionQuery(
      [{ countryId: "UK", electionType: "snap_commons", cycle: 2, startTurn: 100 }],
      [{ countryId: "UK", electionType: "snap_commons", cycle: 2, startTurn: 200 }]
    );
    expect(
      (await runPostElectionGovernmentPhases(db as unknown as Db, new Date(), 1, 148))
        .completedSnaps
    ).toEqual([{ countryId: "UK", startTurn: 100, turn: 148 }]);
  });
  it("does not reset regular, upper-chamber or presidential elections", async () => {
    setupElectionQuery([
      { countryId: "UK", electionType: "commons", cycle: 3 },
      { countryId: "JP", electionType: "sangiin", cycle: 3 },
      { countryId: "US", electionType: "snap_house", cycle: 3 },
    ]);
    expect(
      (await runPostElectionGovernmentPhases(db as unknown as Db, new Date(), 1, 100))
        .completedSnaps
    ).toEqual([]);
  });

  it("fires dissolution helpers for US house resolution", async () => {
    setupElectionQuery([{ countryId: "US", electionType: "house" }]);
    db.collectionMocks["bills"] = {
      ...db.collection("bills"),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 5 }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["noConfidenceVotes"] = {
      ...db.collection("noConfidenceVotes"),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["governmentFormations"] = {
      ...db.collection("governmentFormations"),
      findOne: vi.fn().mockResolvedValue(null),
    } as MockDb["collectionMocks"][string];

    await runPostElectionGovernmentPhases(db as unknown as Db, new Date(), 1);

    expect(db.collectionMocks["bills"].updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ countryId: "US", currentChamber: "house" }),
      expect.anything()
    );
    expect(db.collectionMocks["noConfidenceVotes"].updateMany).toHaveBeenCalledWith(
      { countryId: "US", status: "active" },
      expect.anything()
    );
  });

  it("fires dissolution helpers for UK snap_commons resolution", async () => {
    setupElectionQuery([{ countryId: "UK", electionType: "snap_commons" }]);
    db.collectionMocks["bills"] = {
      ...db.collection("bills"),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["noConfidenceVotes"] = {
      ...db.collection("noConfidenceVotes"),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["governmentFormations"] = {
      ...db.collection("governmentFormations"),
      findOne: vi.fn().mockResolvedValue(null),
    } as MockDb["collectionMocks"][string];

    await runPostElectionGovernmentPhases(db as unknown as Db, new Date(), 1);

    expect(db.collectionMocks["bills"].updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ countryId: "UK", currentChamber: "commons" }),
      expect.anything()
    );
  });

  it("does NOT fire for upper-chamber resolutions (US senate, JP sangiin)", async () => {
    setupElectionQuery([
      { countryId: "US", electionType: "senate" },
      { countryId: "JP", electionType: "sangiin" },
    ]);
    db.collectionMocks["bills"] = {
      ...db.collection("bills"),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["noConfidenceVotes"] = {
      ...db.collection("noConfidenceVotes"),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as MockDb["collectionMocks"][string];

    await runPostElectionGovernmentPhases(db as unknown as Db, new Date(), 1);

    expect(db.collectionMocks["bills"].updateMany).not.toHaveBeenCalled();
    expect(db.collectionMocks["noConfidenceVotes"].updateMany).not.toHaveBeenCalled();
  });

  it("short-circuits when generalResolved is 0", async () => {
    db.collectionMocks["elections"] = {
      ...db.collection("elections"),
      find: vi.fn(),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["bills"] = {
      ...db.collection("bills"),
      updateMany: vi.fn(),
    } as MockDb["collectionMocks"][string];

    await runPostElectionGovernmentPhases(db as unknown as Db, new Date(), 0);

    expect(db.collectionMocks["elections"].find).not.toHaveBeenCalled();
    expect(db.collectionMocks["bills"].updateMany).not.toHaveBeenCalled();
  });
});

describe("runPostElectionGovernmentPhases — S#17 confidence motion flow", () => {
  it("opens confidence motion + updates seat counts for parliamentary countries on regular election", async () => {
    const pmId = new ObjectId();
    setupElectionQuery([{ countryId: "UK", electionType: "commons", cycle: 1 }]);
    db.collectionMocks["bills"] = {
      ...db.collection("bills"),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["noConfidenceVotes"] = {
      ...db.collection("noConfidenceVotes"),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["governmentFormations"] = {
      ...db.collection("governmentFormations"),
      findOne: vi.fn().mockResolvedValue({
        _id: "UK",
        status: "formed",
        pmCharacterId: pmId,
        pmName: "PM",
        cycle: 3,
        governingPartyId: "1",
        formationType: "majority",
      }),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["electedOfficials"] = {
      ...db.collection("electedOfficials"),
      findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(), party: "1" }),
      find: vi.fn().mockReturnValue({
        toArray: vi
          .fn()
          .mockResolvedValue([
            { party: "1", seatsHeld: 340, officeType: "commons", countryId: "UK" },
          ]),
        sort: vi.fn().mockReturnThis(),
      }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["pmAppointmentVotes"] = {
      ...db.collection("pmAppointmentVotes"),
      insertOne: vi
        .fn()
        .mockImplementation(async (doc) => ({ insertedId: doc._id ?? new ObjectId() })),
    } as MockDb["collectionMocks"][string];

    await runPostElectionGovernmentPhases(db as unknown as Db, new Date(), 1);

    expect(db.collectionMocks["pmAppointmentVotes"].insertOne).toHaveBeenCalled();
    const insertedVote = (
      db.collectionMocks["pmAppointmentVotes"].insertOne as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(insertedVote.isConfidenceMotion).toBe(true);
  });

  it("does NOT call resetParliamentaryGovernmentAfterElection on the regular election path", async () => {
    const { resetParliamentaryGovernmentAfterElection } = await import("./parliamentaryGovernment");

    setupElectionQuery([{ countryId: "UK", electionType: "commons", cycle: 1 }]);
    db.collectionMocks["bills"] = {
      ...db.collection("bills"),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["noConfidenceVotes"] = {
      ...db.collection("noConfidenceVotes"),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["governmentFormations"] = {
      ...db.collection("governmentFormations"),
      findOne: vi.fn().mockResolvedValue(null),
      updateOne: vi.fn(),
    } as MockDb["collectionMocks"][string];

    await runPostElectionGovernmentPhases(db as unknown as Db, new Date(), 1);

    expect(resetParliamentaryGovernmentAfterElection).not.toHaveBeenCalled();
  });

  it("does not dissolve or open a confidence motion while other same-cycle regions are still voting", async () => {
    setupElectionQuery(
      [{ countryId: "UK", electionType: "commons", cycle: 1 }],
      [{ countryId: "UK", electionType: "commons", cycle: 1 }]
    );
    db.collectionMocks["bills"] = {
      ...db.collection("bills"),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["noConfidenceVotes"] = {
      ...db.collection("noConfidenceVotes"),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["pmAppointmentVotes"] = {
      ...db.collection("pmAppointmentVotes"),
      insertOne: vi.fn(),
    } as MockDb["collectionMocks"][string];

    await runPostElectionGovernmentPhases(db as unknown as Db, new Date(), 1);

    expect(db.collectionMocks["bills"].updateMany).not.toHaveBeenCalled();
    expect(db.collectionMocks["noConfidenceVotes"].updateMany).not.toHaveBeenCalled();
    expect(db.collectionMocks["pmAppointmentVotes"].insertOne).not.toHaveBeenCalled();
  });

  it("still opens a confidence motion when only the next cycle is already staged", async () => {
    const pmId = new ObjectId();
    setupElectionQuery(
      [{ countryId: "UK", electionType: "commons", cycle: 1 }],
      [{ countryId: "UK", electionType: "commons", cycle: 2 }]
    );
    db.collectionMocks["bills"] = {
      ...db.collection("bills"),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["noConfidenceVotes"] = {
      ...db.collection("noConfidenceVotes"),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["governmentFormations"] = {
      ...db.collection("governmentFormations"),
      findOne: vi.fn().mockResolvedValue({
        _id: "UK",
        status: "formed",
        pmCharacterId: pmId,
        pmName: "PM",
        cycle: 3,
        governingPartyId: "1",
        formationType: "majority",
      }),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["electedOfficials"] = {
      ...db.collection("electedOfficials"),
      findOne: vi.fn().mockResolvedValue({ _id: new ObjectId(), party: "1" }),
      find: vi.fn().mockReturnValue({
        toArray: vi
          .fn()
          .mockResolvedValue([
            { party: "1", seatsHeld: 340, officeType: "commons", countryId: "UK" },
          ]),
        sort: vi.fn().mockReturnThis(),
      }),
    } as MockDb["collectionMocks"][string];
    db.collectionMocks["pmAppointmentVotes"] = {
      ...db.collection("pmAppointmentVotes"),
      insertOne: vi
        .fn()
        .mockImplementation(async (doc) => ({ insertedId: doc._id ?? new ObjectId() })),
    } as MockDb["collectionMocks"][string];

    await runPostElectionGovernmentPhases(db as unknown as Db, new Date(), 1);

    expect(db.collectionMocks["pmAppointmentVotes"].insertOne).toHaveBeenCalled();
  });
});

describe("COUNTRY_ELECTION_PHASES — Ireland", () => {
  it("registers all four IE election spawners in declared order", () => {
    const ie = COUNTRY_ELECTION_PHASES.IE;
    expect(ie).toBeDefined();
    expect(ie!).toHaveLength(4);
    expect(ie!.map((e) => e.name)).toEqual([
      "ieElections",
      "ieUachtaranElections",
      "ieLocalCouncilElections",
      "ieCathaoirleachElections",
    ]);
    expect(ie![0].fn).toBe(ensureIEElections);
  });
});

describe("COUNTRY_BILL_PHASES — Ireland", () => {
  it("registers IE bill-lifecycle processor under the ieBillLifecycle phase name", () => {
    const ie = COUNTRY_BILL_PHASES.IE;
    expect(ie).toBeDefined();
    expect(ie!.phaseName).toBe("ieBillLifecycle");
    // IE now dispatches through the unified engine (an inline wrapper), so assert
    // the phase is wired rather than a specific function identity.
    expect(typeof ie!.fn).toBe("function");
    expect(ie!.emptyResult).toEqual({ enacted: 0, failed: 0 });
  });
});

it.each(["SCO", "WAL"] as const)(
  "registers %s national bill processing and parliamentary government",
  async (country) => {
    expect(COUNTRY_BILL_PHASES[country]?.phaseName).toBe(`${country.toLowerCase()}BillLifecycle`);
    const { getParliamentaryCountryIds } = await import("./parliamentaryGovernment");
    expect(getParliamentaryCountryIds()).toContain(country);
  }
);
