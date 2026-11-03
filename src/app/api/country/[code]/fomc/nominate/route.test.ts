import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireAuthWithCharacter: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn(() => ({ ok: true })),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/centralBank/helpers", () => ({
  getCentralBankScope: vi.fn(async () => ({ bankId: "US", memberCountries: ["US"] })),
}));
vi.mock("@/lib/gameState", () => ({ getGameState: vi.fn(async () => ({ currentTurn: 100 })) }));
vi.mock("@/lib/centralBankChairEvents", () => ({
  notifyCbExecutiveNominationDiscord: vi.fn(async () => {}),
}));
let db: MockDb;
beforeEach(async () => {
  vi.clearAllMocks();
  db = createMockDb();
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as never);
  const { requireAuthWithCharacter } = await import("@/lib/api/requireAuth");
  vi.mocked(requireAuthWithCharacter).mockResolvedValue({
    ok: true,
    user: {
      userId: new ObjectId().toString(),
      character: { _id: new ObjectId(), countryId: "US", currentOffice: { type: "president" } },
    },
  } as never);
});
describe("Fed Board nomination independence", () => {
  it.each([false, true])(
    "rejects a cabinet member with makeChair=%s before creating a nomination",
    async (makeChair) => {
      const id = new ObjectId();
      db.collection("centralBanks");
      db.collectionMocks.centralBanks.findOne.mockResolvedValue({
        _id: "US",
        fomcBoard: [{ seatId: "seat-1", isChair: false }],
      });
      db.collection("characters");
      db.collectionMocks.characters.findOne.mockResolvedValue({
        _id: id,
        userId: new ObjectId(),
        countryId: "US",
        name: "Minister",
      });
      db.collection("cabinetMembers");
      db.collectionMocks.cabinetMembers.find.mockReturnValue({
        toArray: async () => [{ characterId: id }],
      } as never);
      db.collection("fomcNominations");
      const { POST } = await import("./route");
      const response = await POST(
        new Request("http://localhost/api/country/US/fomc/nominate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seatId: "seat-1",
            alignment: "hawk",
            makeChair,
            nomineeCharacterId: id.toString(),
          }),
        }),
        { params: Promise.resolve({ code: "US" }) }
      );
      expect(response.status).toBe(400);
      expect(db.collectionMocks.fomcNominations.insertOne).not.toHaveBeenCalled();
    }
  );
});

describe("central bank chair nomination independence across countries", () => {
  it.each(["US", "UK", "JP"])(
    "rejects a current %s cabinet member before spending actions",
    async (code) => {
      const countryId = code as CountryId;
      const id = new ObjectId();
      const { getCentralBankScope } = await import("@/lib/centralBank/helpers");
      vi.mocked(getCentralBankScope).mockResolvedValue({
        bankId: countryId,
        memberCountries: [countryId],
      } as never);
      const { requireAuthWithCharacter } = await import("@/lib/api/requireAuth");
      vi.mocked(requireAuthWithCharacter).mockResolvedValue({
        ok: true,
        user: {
          userId: new ObjectId().toString(),
          character: {
            _id: new ObjectId(),
            countryId,
            currentOffice: {
              type: COUNTRY_CONFIGS[countryId].officeTypes.find((o) => o.isExecutive)!.key,
            },
          },
        },
      } as never);
      db.collection("centralBanks");
      db.collectionMocks.centralBanks.findOne.mockResolvedValue({
        _id: countryId,
        chairCharacterId: null,
        chairTermExpiresAtTurn: null,
      });
      db.collection("characters");
      db.collectionMocks.characters.findOne.mockResolvedValue({
        _id: id,
        userId: new ObjectId(),
        countryId,
        name: "Minister",
      });
      db.collection("cabinetMembers");
      db.collectionMocks.cabinetMembers.find.mockReturnValue({
        toArray: async () => [{ characterId: id }],
      } as never);
      const { POST } = await import("../../central-bank/nominate/route");
      const response = await POST(
        new Request("http://localhost/api/country/" + code + "/central-bank/nominate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId: id.toString() }),
        }),
        { params: Promise.resolve({ code }) }
      );
      expect(response.status).toBe(400);
      expect(db.collectionMocks.centralBanks.updateOne).not.toHaveBeenCalled();
      expect(db.collectionMocks.characters.updateOne).not.toHaveBeenCalled();
    }
  );
});
