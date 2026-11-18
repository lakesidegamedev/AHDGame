import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { getDb } from "@/lib/mongodb";
import { GET as government } from "@/lib/api/commands/discord-bot/government/handlers";
import { GET as region } from "./country/[code]/region/route";
import { GET as autocomplete } from "./autocomplete/route";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireBotToken", () => ({ requireBotToken: vi.fn(() => true) }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn(() => ({ ok: true })),
  rateLimitResponse: vi.fn(),
  BOT_READ_LIMITS: { maxRequests: 100, windowMs: 60_000 },
}));

describe("Canadian Discord API parity", () => {
  let db: MockDb;
  beforeEach(() => {
    db = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  });

  it.each(["CA", "US"])("reads only %s cabinet appointments", async (country) => {
    db.collection("cabinetMembers");
    db.collectionMocks.cabinetMembers.find.mockReturnValue({
      toArray: async () => [
        {
          countryId: country,
          positionId: country === "CA" ? "minister_of_finance" : "secretary_of_treasury",
          characterId: null,
          characterName: "Test Minister",
          isNPP: true,
        },
      ],
    });
    const response = await government(
      new Request(`http://localhost/api/discord-bot/government?country=${country}`)
    );
    expect(response.status).toBe(200);
    expect(db.collectionMocks.cabinetMembers.find).toHaveBeenCalledWith({ countryId: country });
    const body = await response.json();
    expect(body.country).toBe(country);
    expect(body.officials).toContainEqual(
      expect.objectContaining({
        section: "cabinet",
        characterName: "Test Minister",
        isNPP: true,
        role: country === "CA" ? "Minister of Finance" : "Secretary of the Treasury",
      })
    );
  });

  it("returns Canada's pending government formation without an executive row", async () => {
    db.collection("governmentFormations");
    db.collectionMocks.governmentFormations.findOne.mockResolvedValue({
      _id: "CA",
      status: "pending",
      formationType: null,
      pmCharacterId: null,
      pmName: null,
      governingPartyId: null,
      coalitionPartyIds: null,
      totalSeatsSupporting: 0,
      majorityThreshold: 172,
      seatsByParty: {},
      totalSeats: 343,
    });
    const response = await government(
      new Request("http://localhost/api/discord-bot/government?country=CA")
    );
    const body = await response.json();
    expect(body.officials).toEqual([]);
    expect(body.governmentFormation).toMatchObject({ status: "pending", majorityThreshold: 172 });
    expect(db.collectionMocks.governmentFormations.findOne).toHaveBeenCalledWith({ _id: "CA" });
  });

  it.each(["ON", "CA_ON"])("resolves Canadian province %s using its canonical id", async (id) => {
    db.collection("states");
    db.collection("electedOfficials");
    db.collectionMocks.states.findOne.mockResolvedValue({
      _id: "CA_ON",
      countryId: "CA",
      name: "Ontario",
      region: "Canada",
      population: 16_000_000,
    });
    db.collectionMocks.electedOfficials.find.mockReturnValue({
      toArray: async () => [
        {
          countryId: "CA",
          state: "CA_ON",
          officeType: "provincialLegislature",
          characterId: null,
          characterName: "Test Member",
          isNPP: true,
        },
      ],
    });
    const response = await region(
      new Request(`http://localhost/api/discord-bot/country/ca/region?id=${id}`),
      { params: Promise.resolve({ code: "ca" }) }
    );
    expect(response.status).toBe(200);
    expect(db.collectionMocks.states.findOne).toHaveBeenCalledWith({
      _id: { $in: [id, `CA_${id}`] },
      countryId: "CA",
    });
    expect(db.collectionMocks.electedOfficials.find).toHaveBeenCalledWith({
      state: "CA_ON",
      countryId: "CA",
    });
    const body = await response.json();
    expect(body.state.stateUrl).toBe("https://ahousedividedgame.com/country/ca/region/CA_ON");
    expect(body.state.officials[0].officeLabel).toBe("Member of the Provincial Legislature");
  });

  it("keeps the California id in the US country scope", async () => {
    db.collection("states");
    const response = await region(
      new Request("http://localhost/api/discord-bot/country/us/region?id=CA"),
      { params: Promise.resolve({ code: "US" }) }
    );
    expect(db.collectionMocks.states.findOne).toHaveBeenCalledWith({
      _id: { $in: ["CA", "US_CA"] },
      countryId: "US",
    });
    expect(await response.json()).toEqual({ found: false });
  });

  it("restricts autocomplete to the requested country", async () => {
    db.collection("states");
    const response = await autocomplete(
      new Request("http://localhost/api/discord-bot/autocomplete?type=states&q=on&country=ca")
    );
    expect(response.status).toBe(200);
    expect(db.collectionMocks.states.find).toHaveBeenCalledWith(
      expect.objectContaining({ countryId: "CA" }),
      expect.anything()
    );
  });

  it("rejects an unknown autocomplete country", async () => {
    const response = await autocomplete(
      new Request("http://localhost/api/discord-bot/autocomplete?type=states&q=on&country=ZZ")
    );
    expect(response.status).toBe(400);
  });
});
