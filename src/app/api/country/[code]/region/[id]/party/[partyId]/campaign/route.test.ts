import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { POST } from "./route";
import { getDb } from "@/lib/mongodb";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { canSpendOnStateParty } from "@/lib/parties/access";
import { campaignCanadianRiding } from "@/lib/countries/ca/campaignRiding";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireAuthWithCharacter: vi.fn() }));
vi.mock("@/lib/parties/access", () => ({ canSpendOnStateParty: vi.fn() }));
vi.mock("@/lib/db/partyLookup", () => ({
  findPartyBySequentialId: vi.fn(async () => ({ sequentialId: 1 })),
}));
vi.mock("@/lib/countries/ca/campaignRiding", async (original) => ({
  ...(await original<typeof import("@/lib/countries/ca/campaignRiding")>()),
  campaignCanadianRiding: vi.fn(),
}));

function call(body: unknown, country = "CA", region = "CA_ON") {
  return POST(
    new Request("http://localhost/api/campaign", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ code: country, id: region, partyId: "1" }) }
  );
}
const body = {
  electionId: new ObjectId().toHexString(),
  districtIndex: 35001,
  ridingId: "CA-FED-2023-35001",
  planVersion: "2023",
};

describe("Canadian riding Campaign Here route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(createMockDb() as unknown as Db);
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: true,
      user: {
        character: { _id: new ObjectId() },
        hasCharacter: true,
      },
    } as never);
    vi.mocked(canSpendOnStateParty).mockReturnValue(true);
    vi.mocked(campaignCanadianRiding).mockResolvedValue({
      ok: true,
      boost: 2.5,
      psCost: 2,
      efficiency: 1,
    });
  });
  it("uses the Canadian command with a country-qualified province and versioned target", async () => {
    expect((await call(body)).status).toBe(200);
    expect(campaignCanadianRiding).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        stateId: "CA_ON",
        partyId: "1",
        districtIndex: 35001,
        ridingId: body.ridingId,
        planVersion: "2023",
      })
    );
  });
  it("requires versioned target data and never lets an ordinary member spend party strength", async () => {
    expect((await call({ districtIndex: 35001 })).status).toBe(400);
    vi.mocked(canSpendOnStateParty).mockReturnValue(false);
    expect((await call(body)).status).toBe(403);
    expect(campaignCanadianRiding).not.toHaveBeenCalled();
  });
  it("rejects invalid request bodies before running the command", async () => {
    expect((await call({ ...body, districtIndex: -1 })).status).toBe(400);
    expect(campaignCanadianRiding).not.toHaveBeenCalled();
  });
});
