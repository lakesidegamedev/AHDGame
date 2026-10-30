import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { PATCH } from "./route";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { getDb } from "@/lib/mongodb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/settings/experimental-features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("PATCH /api/settings/experimental-features", () => {
  let db: MockDb;
  const userId = new ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("users");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: true,
      user: { userId: userId.toString() },
    } as never);
  });

  it("opts in without touching the drawer side", async () => {
    const response = await patch({ experimentalFeatures: true });
    expect(response.status).toBe(200);
    const update = vi.mocked(db.collectionMocks.users.updateOne).mock.calls[0];
    expect(update[0]).toEqual({ _id: userId });
    expect(update[1].$set).toMatchObject({ experimentalFeatures: true });
    expect(update[1].$set).not.toHaveProperty("askDrawerSide");
  });

  it("moves the drawer to the left", async () => {
    const response = await patch({ askDrawerSide: "left" });
    expect(response.status).toBe(200);
    const update = vi.mocked(db.collectionMocks.users.updateOne).mock.calls[0];
    expect(update[1].$set).toMatchObject({ askDrawerSide: "left" });
    expect(update[1].$set).not.toHaveProperty("experimentalFeatures");
  });

  it("hides the Ask Keir drawer", async () => {
    const response = await patch({ askDrawerHidden: true });
    expect(response.status).toBe(200);
    const update = vi.mocked(db.collectionMocks.users.updateOne).mock.calls[0];
    expect(update[1].$set).toMatchObject({ askDrawerHidden: true });
    expect(update[1].$set).not.toHaveProperty("askDrawerSide");
  });

  it("saves navigation pins and group order", async () => {
    const navCustomization = {
      pinned: ["world:stockMarket", "help:about"],
      order: { "world:markets": ["forex", "stockMarket"] },
    };
    const response = await patch({ navCustomization });
    expect(response.status).toBe(200);
    const update = vi.mocked(db.collectionMocks.users.updateOne).mock.calls[0];
    expect(update[1].$set).toMatchObject({ navCustomization });
  });

  it.each(["cards", "browser", "directory", "standard"])(
    "persists desktop layout %s without changing opt-in",
    async (desktopNavigationLayout) => {
      const response = await patch({ desktopNavigationLayout });
      expect(response.status).toBe(200);
      const update = vi.mocked(db.collectionMocks.users.updateOne).mock.calls[0];
      expect(update[0]).toEqual({ _id: userId });
      expect(update[1].$set).toMatchObject({ desktopNavigationLayout });
      expect(update[1].$set).not.toHaveProperty("experimentalFeatures");
      expect(update[1].$set).not.toHaveProperty("askDrawerSide");
    }
  );

  it("does not write preferences without authentication", async () => {
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: false,
      response: new NextResponse(null, { status: 401 }),
    });
    expect((await patch({ desktopNavigationLayout: "browser" })).status).toBe(401);
    expect(db.collectionMocks.users.updateOne).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { askDrawerSide: "top" },
    { experimentalFeatures: "yes" },
    { desktopNavigationLayout: "mobile" },
    { desktopNavigationLayout: true },
    { askDrawerHidden: "no" },
    { navCustomization: { pinned: ["a:1", "a:2", "a:3", "a:4", "a:5", "a:6"], order: {} } },
    { navCustomization: { pinned: ["has space"], order: {} } },
    { navCustomization: { pinned: [] } },
  ])("rejects %j", async (body) => {
    const response = await patch(body);
    expect(response.status).toBe(400);
    expect(db.collectionMocks.users.updateOne).not.toHaveBeenCalled();
  });
});
