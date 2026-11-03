import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireAuthWithCharacter: vi.fn() }));
vi.mock("@/lib/db/partyLookup", async () => {
  const actual = await vi.importActual<object>("@/lib/db/partyLookup");
  return { ...actual, findPartyBySequentialId: vi.fn() };
});

vi.mock("@/lib/influence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/influence")>()),
  executeStatePartyInfluence: vi.fn(),
}));

describe("influence cross-country guard", () => {
  let db: MockDb;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("statePartyOrg");

    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);

    const { findPartyBySequentialId } = await import("@/lib/db/partyLookup");
    vi.mocked(findPartyBySequentialId).mockResolvedValue({
      _id: new ObjectId(),
      sequentialId: 1,
      countryId: "US",
      name: "Spender",
      chairId: new ObjectId(),
    } as never);
  });

  it("rejects batches over the existing bound before any influence execution", async () => {
    const { requireAuthWithCharacter } = await import("@/lib/api/requireAuth");
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: true,
      user: {
        userId: new ObjectId().toString(),
        isAdmin: true,
        character: { _id: new ObjectId(), name: "Leader", countryId: "US" },
      },
    } as never);
    const { POST } = await import("./route");
    const { executeStatePartyInfluence } = await import("@/lib/influence");
    const response = await POST(
      new Request("http://localhost/influence", {
        method: "POST",
        body: JSON.stringify({
          queue: Array.from({ length: 21 }, () => ({
            nppId: new ObjectId().toString(),
            influenceType: "boost_influence",
          })),
        }),
      }),
      { params: Promise.resolve({ code: "us", id: "CA", partyId: "1" }) }
    );
    expect(response.status).toBe(400);
    expect(executeStatePartyInfluence).not.toHaveBeenCalled();
  });

  it("runs repeated state actions in order and stops on a hard error", async () => {
    const { requireAuthWithCharacter } = await import("@/lib/api/requireAuth");
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: true,
      user: {
        userId: new ObjectId().toString(),
        isAdmin: true,
        character: { _id: new ObjectId(), name: "Leader", countryId: "US" },
      },
    } as never);
    const { executeStatePartyInfluence } = await import("@/lib/influence");
    vi.mocked(executeStatePartyInfluence)
      .mockResolvedValueOnce({ success: true, outcome: "success", message: "Boosted" } as never)
      .mockResolvedValueOnce({
        success: false,
        outcome: "error",
        error: "Not enough Action Points",
      } as never);
    const nppId = new ObjectId().toString();
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/influence", {
        method: "POST",
        body: JSON.stringify({
          queue: Array.from({ length: 5 }, () => ({ nppId, influenceType: "boost_influence" })),
        }),
      }),
      { params: Promise.resolve({ code: "us", id: "CA", partyId: "1" }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toHaveLength(2);
    expect(body.results[1]).toMatchObject({
      outcome: "error",
      message: "Not enough Action Points",
    });
    expect(executeStatePartyInfluence).toHaveBeenCalledTimes(2);
  });

  it("GET rejects a cross-country actor with 403 (admins included)", async () => {
    const { requireAuthWithCharacter } = await import("@/lib/api/requireAuth");
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: true,
      user: {
        userId: new ObjectId().toString(),
        username: "ccpChair",
        isAdmin: true,
        character: { _id: new ObjectId(), name: "Jiang Zemin", countryId: "CN" },
      },
    } as never);

    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://localhost/api/country/us/region/CA/party/1/influence"),
      {
        params: Promise.resolve({ code: "us", id: "CA", partyId: "1" }),
      }
    );
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toMatch(/another country/i);
  });
});
