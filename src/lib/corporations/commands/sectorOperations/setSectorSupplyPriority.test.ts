import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { NextResponse } from "next/server";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { requireCeo, resolveCorporation } from "@/lib/api/corporations/resolveQuery";
import { setSectorSupplyPriority } from "./setSectorSupplyPriority";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/corporations/resolveQuery", () => ({
  requireCeo: vi.fn(),
  resolveCorporation: vi.fn(),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn(() => ({ ok: true })),
  rateLimitResponse: vi.fn(),
}));

let db: MockDb;
const corpId = new ObjectId();
const sectorId = new ObjectId();
const params = Promise.resolve({ id: corpId.toString(), sectorId: sectorId.toString() });
const request = (body: object) =>
  new Request("http://localhost/supply-priority", { method: "POST", body: JSON.stringify(body) });

describe("sector supply priority command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("corporateSectors");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    vi.mocked(requireBasicAuth).mockResolvedValue({ ok: true, user: { userId: "ceo" } } as never);
    vi.mocked(resolveCorporation).mockResolvedValue({
      ok: true,
      corporation: { _id: corpId },
    } as never);
    vi.mocked(requireCeo).mockReturnValue(null);
    db.collectionMocks.corporateSectors.findOne.mockResolvedValue({
      _id: sectorId,
      corporationId: corpId,
    });
  });

  it("lets the CEO turn it on and off, removing the field when off", async () => {
    expect(
      (await setSectorSupplyPriority(request({ sellOutsideFirst: true }), { params })).status
    ).toBe(200);
    expect(db.collectionMocks.corporateSectors.updateOne.mock.calls[0][1].$set).toMatchObject({
      sellOutsideFirst: true,
    });
    expect(
      (await setSectorSupplyPriority(request({ sellOutsideFirst: false }), { params })).status
    ).toBe(200);
    const off = db.collectionMocks.corporateSectors.updateOne.mock.calls[1][1];
    expect(off.$unset).toEqual({ sellOutsideFirst: "" });
    expect(off.$set).not.toHaveProperty("sellOutsideFirst");
  });

  it("refuses a non-CEO without writing", async () => {
    vi.mocked(requireCeo).mockReturnValue(NextResponse.json({ error: "no" }, { status: 403 }));
    expect(
      (await setSectorSupplyPriority(request({ sellOutsideFirst: true }), { params })).status
    ).toBe(403);
    expect(db.collectionMocks.corporateSectors.updateOne).not.toHaveBeenCalled();
  });

  it("returns 404 for a sector the corporation does not own", async () => {
    db.collectionMocks.corporateSectors.findOne.mockResolvedValue(null);
    expect(
      (await setSectorSupplyPriority(request({ sellOutsideFirst: true }), { params })).status
    ).toBe(404);
    expect(db.collectionMocks.corporateSectors.updateOne).not.toHaveBeenCalled();
  });
});
