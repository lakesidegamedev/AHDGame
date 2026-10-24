import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import type { Db } from "mongodb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/requireCorporationActions", () => ({
  requireCorporationActionsEnabled: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/api/corporations/resolveQuery", () => ({
  resolveCorporation: vi.fn(),
  requireCeo: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/corporations/nppPickup", () => ({ disposeLeavingSectors: vi.fn() }));
vi.mock("@/lib/corporations/brandFacilityLoss", () => ({
  applyBrandFacilityLoss: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/banking/capacityAllocation", () => ({
  abandonBankImpact: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/corporations/capexTxLog", () => ({
  emitBuildCapexTx: vi.fn().mockResolvedValue(undefined),
}));

let db: MockDb;
const userId = new ObjectId();
const corpId = new ObjectId();
const sectorId = new ObjectId();

function sector(overrides: Record<string, unknown> = {}) {
  return {
    _id: sectorId,
    corporationId: corpId,
    sectorType: "energy",
    stateId: "PA",
    revenue: 1_000,
    buildQueue: [],
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  db = createMockDb();
  for (const name of ["corporateSectors", "corporations", "states", "gameState"])
    db.collection(name);
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  const { requireBasicAuth } = await import("@/lib/api/requireAuth");
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: userId.toString() },
  } as never);
  const { resolveCorporation } = await import("@/lib/api/corporations/resolveQuery");
  vi.mocked(resolveCorporation).mockResolvedValue({
    ok: true,
    corporation: {
      _id: corpId,
      name: "Keystone",
      sequentialId: 7,
      liquidCapital: 10_000,
      liquidCurrencyCode: "USD",
    },
  } as never);
});

function abandon() {
  const request = new Request("http://localhost/x", { method: "POST" });
  return {
    request,
    params: Promise.resolve({ id: corpId.toString(), sectorId: sectorId.toString() }),
  };
}

describe("abandonSector reservation", () => {
  it("says the sector is reserved by another operation instead of claiming it is missing", async () => {
    db.collectionMocks["corporateSectors"]!.findOne.mockResolvedValue(
      sector({
        constructionPropertyTransition: {
          key: `restore:${sectorId.toHexString()}`,
          kind: "retool",
        },
      })
    );
    const { abandonSector } =
      await import("@/lib/corporations/commands/sectorOperations/abandonSector");

    const res = await abandonSector(abandon().request, abandon());

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("reserved by another operation");
    expect(body.error).not.toContain("not found");
  });

  it("names unreleased construction financing as the reason", async () => {
    db.collectionMocks["corporateSectors"]!.findOne.mockResolvedValue(
      sector({ constructionFinancing: { status: "active", escrowLocal: 500 } })
    );
    const { abandonSector } =
      await import("@/lib/corporations/commands/sectorOperations/abandonSector");

    const res = await abandonSector(abandon().request, abandon());

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("construction financing");
  });

  it("resumes an interrupted abandon without repeating the build refund", async () => {
    // A marker from a previous abandon: the sector is still here and the refund
    // may already have landed. The retry must dispose of it, not 404 and not
    // pay again.
    db.collectionMocks["corporateSectors"]!.findOne.mockResolvedValue(
      sector({
        constructionPropertyTransition: {
          key: `restore:${sectorId.toHexString()}`,
          kind: "restore",
        },
        buildQueue: [{ unitsOrdered: 10, costPaidAnchor: 5_000, startTurn: 1 }],
      })
    );
    const { disposeLeavingSectors } = await import("@/lib/corporations/nppPickup");
    vi.mocked(disposeLeavingSectors).mockResolvedValue({ recipientIds: [] } as never);
    const { abandonSector } =
      await import("@/lib/corporations/commands/sectorOperations/abandonSector");

    const res = await abandonSector(abandon().request, abandon());

    expect(res.status).toBe(200);
    expect(disposeLeavingSectors).toHaveBeenCalled();
    expect(db.collectionMocks["corporations"]!.updateOne).not.toHaveBeenCalled();
  });

  it("releases a fresh reservation when the disposal throws, so the sector is not stuck", async () => {
    const sectorDoc = sector();
    db.collectionMocks["corporateSectors"]!.findOneAndUpdate.mockResolvedValue(sectorDoc);
    db.collectionMocks["corporateSectors"]!.updateOne.mockResolvedValue({ matchedCount: 1 });
    const { disposeLeavingSectors } = await import("@/lib/corporations/nppPickup");
    vi.mocked(disposeLeavingSectors).mockRejectedValue(new Error("disposal exploded"));
    const { abandonSector } =
      await import("@/lib/corporations/commands/sectorOperations/abandonSector");

    const res = await abandonSector(abandon().request, abandon());

    expect(res.status).toBeGreaterThanOrEqual(500);
    const unset = db.collectionMocks["corporateSectors"]!.updateOne.mock.calls.find(
      ([, update]) => update && "$unset" in update
    );
    expect(unset).toBeTruthy();
  });
});
