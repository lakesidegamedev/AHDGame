import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { RESET_V2_SEED_REVISION } from "@/lib/resetVersions/rules";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/gameState", () => ({ getGameState: vi.fn() }));

const { getDb } = await import("@/lib/mongodb");
const { requireAuth } = await import("@/lib/api/requireAuth");
const { getGameState } = await import("@/lib/gameState");

describe("POST /api/country/[code]/executive/cabinet/[positionId]/order", () => {
  let db: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    vi.mocked(requireAuth).mockResolvedValue({
      ok: true,
      user: {
        isAdmin: false,
        character: { _id: "char_1" },
      },
    } as never);
    vi.mocked(getGameState).mockResolvedValue({ currentTurn: 42 } as never);

    db.collection("cabinetMembers");
    db.collection("ministerialOrders");
    db.collection("characters");
    db.collectionMocks.cabinetMembers.findOne.mockResolvedValue({
      _id: "member_1",
      characterId: "char_1",
      ministerialActions: 1,
    });
    // UK seats spend from the shared per-player pool on the character doc
    // (issue #2049): model a seated holder with one action left, and an
    // atomic spend that lands at zero.
    db.collectionMocks.characters.findOne.mockResolvedValue({
      sharedMinisterialActions: 1,
      sharedMinisterialActionResetDay: "2026-09-17",
    });
    db.collectionMocks.characters.findOneAndUpdate.mockResolvedValue({
      sharedMinisterialActions: 0,
    });
    db.collectionMocks.ministerialOrders.insertOne.mockResolvedValue({
      acknowledged: true,
    });
    db.collectionMocks.cabinetMembers.updateOne.mockResolvedValue({
      matchedCount: 1,
      modifiedCount: 1,
    });
  });

  it("accepts emergency action ids for cabinet positions with an emergency mechanic", async () => {
    const { POST } =
      await import("@/app/api/country/[code]/executive/cabinet/[positionId]/order/route");

    const response = await POST(
      new Request("http://localhost/api/country/uk/executive/cabinet/education_secretary/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: "emergency_education_secretary",
          targetRegionId: "YTH",
        }),
      }),
      { params: Promise.resolve({ code: "uk", positionId: "education_secretary" }) }
    );

    expect(response.status).toBe(200);
    expect(db.collectionMocks.ministerialOrders.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        countryId: "UK",
        positionId: "education_secretary",
        orderId: "emergency_education_secretary",
        orderName: "Skills Initiative",
        effects: [
          {
            metric: "education.workforceSkill",
            modifier: 0.08,
            scope: "regional",
            regionId: "YTH",
          },
        ],
      })
    );
  });

  it("accepts a null targetRegionId for national ministerial orders", async () => {
    const { POST } =
      await import("@/app/api/country/[code]/executive/cabinet/[positionId]/order/route");

    const response = await POST(
      new Request("http://localhost/api/country/jp/executive/cabinet/environment_minister/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: "clean_energy_push",
          targetRegionId: null,
        }),
      }),
      { params: Promise.resolve({ code: "jp", positionId: "environment_minister" }) }
    );

    expect(response.status).toBe(200);
    expect(db.collectionMocks.ministerialOrders.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "clean_energy_push",
        effects: expect.arrayContaining([
          expect.objectContaining({ scope: "national", regionId: undefined }),
        ]),
      })
    );
  });

  it("rejects a regional ministerial order issued without a target region", async () => {
    const { POST } =
      await import("@/app/api/country/[code]/executive/cabinet/[positionId]/order/route");

    const response = await POST(
      new Request("http://localhost/api/country/uk/executive/cabinet/transport_secretary/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: "transport_connectivity_programme",
          targetRegionId: null,
        }),
      }),
      { params: Promise.resolve({ code: "uk", positionId: "transport_secretary" }) }
    );

    expect(response.status).toBe(400);
    expect(db.collectionMocks.ministerialOrders.insertOne).not.toHaveBeenCalled();
    // No action should be spent on a rejected order.
    expect(db.collectionMocks.cabinetMembers.updateOne).not.toHaveBeenCalled();
  });

  it("accepts legacy regionId payloads for regional ministerial orders", async () => {
    const { POST } =
      await import("@/app/api/country/[code]/executive/cabinet/[positionId]/order/route");

    const response = await POST(
      new Request("http://localhost/api/country/uk/executive/cabinet/transport_secretary/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: "transport_connectivity_programme",
          regionId: "NIR",
        }),
      }),
      { params: Promise.resolve({ code: "uk", positionId: "transport_secretary" }) }
    );

    expect(response.status).toBe(200);
    expect(db.collectionMocks.ministerialOrders.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "transport_connectivity_programme",
        effects: [
          {
            metric: "economic.gdpGrowth",
            modifier: 0.04,
            scope: "regional",
            regionId: "NIR",
          },
        ],
      })
    );
  });
  describe("Cabinet v2 country", () => {
    const receipt = (system: "metrics" | "cabinet") => ({
      worldId: "w1",
      revision: RESET_V2_SEED_REVISION[system],
      sourceTurn: 10,
      completedAt: "2026-11-09T00:00:00Z",
      verificationHash: "h",
      countries: ["JP"],
    });
    const post = async () => {
      const { POST } =
        await import("@/app/api/country/[code]/executive/cabinet/[positionId]/order/route");
      return POST(
        new Request(
          "http://localhost/api/country/jp/executive/cabinet/environment_minister/order",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: "clean_energy_push", targetRegionId: null }),
          }
        ),
        { params: Promise.resolve({ code: "jp", positionId: "environment_minister" }) }
      );
    };
    beforeEach(() => {
      vi.mocked(getGameState).mockResolvedValue({
        currentTurn: 42,
        resetWorldId: "w1",
        metricsSystemVersion: "v2",
        cabinetSystemVersion: "v2",
        resetVersionSeeds: { metrics: receipt("metrics"), cabinet: receipt("cabinet") },
      } as never);
      db.collection("resetCabinetActionStates");
    });

    it("spends a v2 charge, not the legacy row", async () => {
      db.collectionMocks.resetCabinetActionStates.findOne.mockResolvedValue({
        sourceTurn: 10,
        actorStates: { char_1: { charges: 3, lastRechargeTurn: 42 } },
      });
      expect((await post()).status).toBe(200);
      expect(db.collectionMocks.resetCabinetActionStates.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ "actorStates.char_1.charges": 3 }),
        { $set: { "actorStates.char_1": { charges: 2, lastRechargeTurn: 42 } } }
      );
      expect(db.collectionMocks.cabinetMembers.updateOne).not.toHaveBeenCalled();
    });

    it("refuses with 400 when the v2 pool is empty even if the legacy row has actions", async () => {
      db.collectionMocks.resetCabinetActionStates.findOne.mockResolvedValue({
        sourceTurn: 10,
        actorStates: { char_1: { charges: 0, lastRechargeTurn: 42 } },
      });
      const res = await post();
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "No ministerial actions remaining" });
      expect(db.collectionMocks.ministerialOrders.insertOne).not.toHaveBeenCalled();
    });
  });
});
