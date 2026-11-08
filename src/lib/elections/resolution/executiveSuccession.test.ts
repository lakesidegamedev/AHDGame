import { beforeEach, describe, expect, it, vi } from "vitest";

const { govFindOne, govUpdateOne, officialFindOne, promote } = vi.hoisted(() => ({
  govFindOne: vi.fn(),
  govUpdateOne: vi.fn(),
  officialFindOne: vi.fn(),
  promote: vi.fn(),
}));

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
  getGovernmentFormationsCollection: () => ({ findOne: govFindOne, updateOne: govUpdateOne }),
}));
vi.mock("@/lib/db/collections/electedOfficials", () => ({
  getElectedOfficialsCollection: vi.fn().mockResolvedValue({ findOne: officialFindOne }),
}));
vi.mock("@/lib/turn/presidentialSuccession", () => ({
  processPresidentialSuccession: promote,
}));

import { processExecutiveSuccession } from "./executiveSuccession";

const now = new Date("2027-01-01T00:00:00Z");
const db = {} as never;

function governments(byCountry: Record<string, unknown>) {
  govFindOne.mockImplementation(async (q: { _id: string }) => byCountry[q._id] ?? null);
}

beforeEach(() => {
  vi.clearAllMocks();
  promote.mockResolvedValue(false);
});

describe("processExecutiveSuccession", () => {
  it("opens a timetable when the French presidency is empty and skips the US", async () => {
    governments({ FR: { _id: "FR", status: "formed" } });
    officialFindOne.mockResolvedValue({ characterId: null, nppId: null });
    const result = await processExecutiveSuccession(db, 100, now);
    expect(result.opened).toBe(1);
    const [, update] = govUpdateOne.mock.calls[0]!;
    expect(update.$set.succession).toMatchObject({
      office: "president",
      fill: "direct_election",
      vacatedTurn: 100,
      overdue: false,
    });
    expect(govFindOne).not.toHaveBeenCalledWith({ _id: "US" });
  });

  it("opens one for a pending UK government with no prime minister", async () => {
    governments({ UK: { _id: "UK", status: "pending", pmCharacterId: null, pmNppId: null } });
    const result = await processExecutiveSuccession(db, 50, now);
    expect(result.opened).toBe(1);
    expect(govUpdateOne.mock.calls[0]![1].$set.succession.fill).toBe("government_formation");
  });

  it("clears the record once the office is held", async () => {
    governments({ FR: { _id: "FR", succession: { office: "president" } } });
    officialFindOne.mockResolvedValue({ characterId: "someone", nppId: null });
    const result = await processExecutiveSuccession(db, 120, now);
    expect(result.cleared).toBe(1);
    expect(govUpdateOne.mock.calls[0]![1]).toEqual({ $unset: { succession: "" } });
  });

  it("marks an open record overdue past its fill deadline", async () => {
    governments({
      FR: {
        _id: "FR",
        succession: {
          office: "president",
          vacatedTurn: 0,
          actingUntilTurn: 168,
          fillByTurn: 336,
          overdue: false,
        },
      },
    });
    officialFindOne.mockResolvedValue({ characterId: null, nppId: null });
    const result = await processExecutiveSuccession(db, 337, now);
    expect(result.overdue).toBe(1);
    expect(govUpdateOne.mock.calls[0]![1].$set["succession.overdue"]).toBe(true);
  });
});
