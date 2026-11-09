import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  electionFind: vi.fn(),
  candidateFind: vi.fn(),
  candidateInsert: vi.fn(),
  partyFind: vi.fn(),
  officialFind: vi.fn(),
  nppFind: vi.fn(),
  access: vi.fn(),
  create: vi.fn(),
  close: vi.fn(),
}));

vi.mock("@/lib/countryAccess", () => ({ getAllCountryAccess: m.access }));
vi.mock("@/lib/db/collections/elections", () => ({
  getElectionsCollection: async () => ({ find: m.electionFind }),
}));
vi.mock("@/lib/db/collections/electedOfficials", () => ({
  getElectedOfficialsCollection: async () => ({ find: m.officialFind }),
}));
vi.mock("@/lib/db/collections/npps", () => ({
  getNppsCollection: async () => ({ find: m.nppFind }),
}));
vi.mock("@/lib/db/collections/politicalParties", () => ({
  getPoliticalPartiesCollection: async () => ({ find: m.partyFind }),
}));
vi.mock("@/lib/db/collections/ukByElection", () => ({
  getUkCommonsVacanciesCollection: () => ({ find: vi.fn() }),
}));
vi.mock("@/lib/parties/antiAbuseGuards", () => ({
  buildNppElectionEligiblePartyKeys: () => new Set(["US:1", "FR:1"]),
}));
vi.mock("@/lib/npp/generator", () => ({
  openNppCreationBatch: () => ({ create: m.create, close: m.close }),
}));
vi.mock("@/lib/turn/byElections", () => ({ processByElectionWatcher: vi.fn() }));

import { fillUncontestedByElections } from "./byElectionFill";

const now = new Date("2027-03-01T00:00:00Z");
const toArray = (rows: unknown[]) => ({ toArray: async () => rows });

function db() {
  return {
    collection: () => ({ find: m.candidateFind, insertMany: m.candidateInsert }),
  } as never;
}

function race(over: Record<string, unknown>) {
  return {
    _id: new ObjectId(),
    status: "active",
    primaryEndTurn: 101,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.candidateFind.mockReturnValue(toArray([]));
  m.partyFind.mockReturnValue(toArray([{ sequentialId: 1, countryId: "US", isDefault: true }]));
  m.officialFind.mockReturnValue(toArray([]));
  m.nppFind.mockReturnValue(toArray([]));
  m.create.mockImplementation(async (input: { party: string; countryId: string }) => ({
    _id: new ObjectId(),
    name: "Generated Candidate",
    ...input,
  }));
  m.close.mockResolvedValue(undefined);
  m.candidateInsert.mockResolvedValue(undefined);
});

describe("fillUncontestedByElections", () => {
  it("generates a new NPP in a player country when nobody filed and none is free", async () => {
    m.access.mockResolvedValue({ US: { registered: true, enabledForPlayers: true } });
    m.officialFind.mockReturnValue(toArray([{ state: "OH", countryId: "US", party: "1" }]));
    m.electionFind.mockReturnValue(
      toArray([race({ electionType: "special_governor", state: "OH", countryId: "US" })])
    );

    const filed = await fillUncontestedByElections(db(), 100, now);

    expect(filed).toBe(1);
    expect(m.create).toHaveBeenCalledWith(
      expect.objectContaining({ state: "OH", party: "1", countryId: "US" })
    );
    expect(m.candidateInsert.mock.calls[0]![0]).toHaveLength(1);
  });

  it("reuses a free NPP of the previous party before generating one", async () => {
    const free = {
      _id: new ObjectId(),
      name: "Free Candidate",
      party: "1",
      countryId: "US",
      homeState: "OH",
    };
    m.access.mockResolvedValue({ US: { registered: true, enabledForPlayers: true } });
    m.officialFind.mockReturnValue(toArray([{ state: "OH", countryId: "US", party: "1" }]));
    m.nppFind.mockReturnValue(toArray([free]));
    m.electionFind.mockReturnValue(
      toArray([race({ electionType: "special_governor", state: "OH", countryId: "US" })])
    );

    expect(await fillUncontestedByElections(db(), 100, now)).toBe(1);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("does not touch a race that already has a candidate", async () => {
    const contested = race({ electionType: "special_governor", state: "OH", countryId: "US" });
    m.access.mockResolvedValue({ US: { registered: true, enabledForPlayers: true } });
    m.candidateFind.mockReturnValue(
      toArray([{ electionId: contested._id, nppId: new ObjectId() }])
    );
    m.electionFind.mockReturnValue(toArray([contested]));

    expect(await fillUncontestedByElections(db(), 100, now)).toBe(0);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("fills a special presidential election with the previous president's party", async () => {
    m.access.mockResolvedValue({ FR: { registered: true, enabledForPlayers: true } });
    m.partyFind.mockReturnValue(toArray([{ sequentialId: 1, countryId: "FR", isDefault: true }]));
    m.officialFind.mockReturnValue(toArray([{ countryId: "FR", party: "1" }]));
    m.electionFind.mockReturnValue(
      toArray([race({ electionType: "special_president", state: "FR", countryId: "FR" })])
    );

    expect(await fillUncontestedByElections(db(), 100, now)).toBe(1);
    expect(m.create).toHaveBeenCalledWith(
      expect.objectContaining({ state: "FR", party: "1", countryId: "FR" })
    );
  });
});
