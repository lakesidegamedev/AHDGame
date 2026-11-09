import { beforeEach, describe, expect, it, vi } from "vitest";

const { govFind, govFindOne, govBulkWrite, govUpdateOne, officialFind, promote, news } = vi.hoisted(
  () => ({
    govFind: vi.fn(),
    govFindOne: vi.fn(),
    news: vi.fn(),
    govBulkWrite: vi.fn(),
    govUpdateOne: vi.fn(),
    officialFind: vi.fn(),
    promote: vi.fn(),
  })
);

vi.mock("@/lib/country/countryTier", () => ({
  getFullSimulationCountryIds: vi.fn().mockResolvedValue(["FR", "UK", "US"]),
}));
vi.mock("@/lib/db/collections/gameState", () => ({
  getGameStatePreset: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db/collections", () => ({
  getGameStateCollection: vi.fn().mockResolvedValue({
    findOne: vi.fn().mockResolvedValue({ preIteration: { active: false } }),
  }),
}));
vi.mock("@/lib/db/collections/governmentFormation", () => ({
  getGovernmentFormationsCollection: () => ({
    find: govFind,
    findOne: govFindOne,
    bulkWrite: govBulkWrite,
    updateOne: govUpdateOne,
    updateMany: vi.fn(),
  }),
}));
vi.mock("@/lib/db/collections/electedOfficials", () => ({
  getElectedOfficialsCollection: vi.fn().mockResolvedValue({ find: officialFind }),
}));
vi.mock("@/lib/elections/resolution/successionNews", () => ({ postSuccessionNews: news }));
vi.mock("@/lib/turn/presidentialSuccession", () => ({
  processPresidentialSuccession: promote,
}));

import { processExecutiveSuccession } from "./executiveSuccession";

const now = new Date("2027-01-01T00:00:00Z");
const db = {} as never;

function world(govs: Array<Record<string, unknown>>, offices: Array<Record<string, unknown>> = []) {
  govFind.mockReturnValue({ toArray: async () => govs });
  officialFind.mockReturnValue({ toArray: async () => offices });
}

function writes(): Array<{ updateOne: { filter: { _id: string }; update: Record<string, any> } }> {
  return govBulkWrite.mock.calls[0]![0];
}

beforeEach(() => {
  vi.clearAllMocks();
  promote.mockResolvedValue(false);
});

describe("processExecutiveSuccession", () => {
  it("opens a timetable when the French presidency is empty and never reads the US", async () => {
    world(
      [{ _id: "FR", status: "formed" }],
      [{ officeType: "president", countryId: "FR", characterId: null, nppId: null }]
    );
    const result = await processExecutiveSuccession(db, 100, now);
    expect(result.opened).toBe(1);
    expect(writes()[0]!.updateOne.update.$set.succession).toMatchObject({
      office: "president",
      fill: "direct_election",
      vacatedTurn: 100,
      overdue: false,
    });
  });

  it("opens a special election when the president and the vice president seats are both empty", async () => {
    world(
      [{ _id: "US", status: "formed" }],
      [
        { officeType: "president", countryId: "US", characterId: null, nppId: null },
        { officeType: "vicePresident", countryId: "US", characterId: null, nppId: null },
      ]
    );
    const result = await processExecutiveSuccession(db, 100, now);
    expect(result.opened).toBe(1);
    expect(writes()[0]!.updateOne.update.$set.succession).toMatchObject({
      office: "president",
      fill: "direct_election",
      vacatedTurn: 100,
    });
    expect(promote).not.toHaveBeenCalled();
    expect(news).toHaveBeenCalledWith("US", expect.objectContaining({ event: "vacancy" }));
  });

  it("leaves the presidency to the vice president when one is seated", async () => {
    world(
      [{ _id: "US", status: "formed" }],
      [
        { officeType: "president", countryId: "US", characterId: null, nppId: null },
        { officeType: "vicePresident", countryId: "US", characterId: "vp", nppId: null },
      ]
    );
    promote.mockResolvedValue(true);
    await processExecutiveSuccession(db, 100, now);
    expect(writes()[0]!.updateOne.update.$set.succession.fill).toBe("deputy_permanent");
    expect(promote).toHaveBeenCalledWith(db, "US");
  });

  it("falls back to a special election when the seated deputy cannot take over", async () => {
    world(
      [
        {
          _id: "US",
          status: "formed",
          succession: {
            office: "president",
            fill: "deputy_permanent",
            vacatedTurn: 90,
            actingUntilTurn: 90,
            fillByTurn: 90,
            overdue: false,
          },
        },
      ],
      [
        { officeType: "president", countryId: "US", characterId: null, nppId: null },
        { officeType: "vicePresident", countryId: "US", characterId: "vp", nppId: null },
      ]
    );
    promote.mockResolvedValue(false);
    govFindOne.mockResolvedValue({
      succession: { fill: "deputy_permanent", vacatedTurn: 90 },
    });
    await processExecutiveSuccession(db, 100, now);
    const replan = govUpdateOne.mock.calls[0]![1].$set;
    expect(replan["succession.fill"]).toBe("direct_election");
    expect(replan["succession.fillByTurn"]).toBeGreaterThan(90);
  });

  it("announces a newly overdue vacancy", async () => {
    world(
      [
        {
          _id: "FR",
          succession: {
            office: "president",
            fill: "direct_election",
            vacatedTurn: 0,
            actingUntilTurn: 168,
            fillByTurn: 336,
            overdue: false,
          },
        },
      ],
      [{ officeType: "president", countryId: "FR", characterId: null, nppId: null }]
    );
    await processExecutiveSuccession(db, 337, now);
    expect(news).toHaveBeenCalledWith("FR", expect.objectContaining({ event: "overdue" }));
  });

  it("opens one for a pending UK government with no prime minister", async () => {
    world([{ _id: "UK", status: "pending", pmCharacterId: null, pmNppId: null }]);
    const result = await processExecutiveSuccession(db, 50, now);
    expect(result.opened).toBe(1);
    expect(writes()[0]!.updateOne.update.$set.succession.fill).toBe("government_formation");
  });

  it("clears the record once the office is held", async () => {
    world(
      [{ _id: "FR", succession: { office: "president" } }],
      [{ officeType: "president", countryId: "FR", characterId: "someone", nppId: null }]
    );
    const result = await processExecutiveSuccession(db, 120, now);
    expect(result.cleared).toBe(1);
    expect(writes()[0]!.updateOne.update).toEqual({ $unset: { succession: "" } });
  });

  it("marks an open record overdue past its fill deadline", async () => {
    world(
      [
        {
          _id: "FR",
          succession: {
            office: "president",
            vacatedTurn: 0,
            actingUntilTurn: 168,
            fillByTurn: 336,
            overdue: false,
          },
        },
      ],
      [{ officeType: "president", countryId: "FR", characterId: null, nppId: null }]
    );
    const result = await processExecutiveSuccession(db, 337, now);
    expect(result.overdue).toBe(1);
    expect(writes()[0]!.updateOne.update.$set["succession.overdue"]).toBe(true);
  });
});
