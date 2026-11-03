import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { GET } from "./route";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { loadSidebarWidgetData } from "@/lib/sidebarWidgets/widgetData";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/sidebarWidgets/widgetData", () => ({ loadSidebarWidgetData: vi.fn() }));

const get = (keys: string) => GET(new Request(`http://localhost/api/sidebar-widgets?keys=${keys}`));

function signIn(user: Record<string, unknown>) {
  vi.mocked(requireBasicAuth).mockResolvedValue({ ok: true, user } as never);
}

describe("GET /api/sidebar-widgets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn({ userId: "u1", experimentalFeatures: true, isModerator: true });
    vi.mocked(loadSidebarWidgetData).mockResolvedValue({ myCompany: { name: "Co" } });
  });

  it("returns data per key for experimental players, never cached", async () => {
    const response = await get("myCompany,stockTicker:nyse,myCompany");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toEqual({ data: { myCompany: { name: "Co" } } });
    expect(loadSidebarWidgetData).toHaveBeenCalledWith({}, ["myCompany", "stockTicker:nyse"], {
      userId: "u1",
      isAdmin: false,
      isModerator: true,
    });
  });

  it("refuses players without experimental features", async () => {
    signIn({ userId: "u1", experimentalFeatures: false });
    expect((await get("myCompany")).status).toBe(403);
    expect(loadSidebarWidgetData).not.toHaveBeenCalled();
  });

  it("passes through signed-out responses", async () => {
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: false,
      response: new NextResponse(null, { status: 401 }),
    });
    expect((await get("myCompany")).status).toBe(401);
  });

  it.each([
    "",
    "bogus",
    "stockTicker",
    Array.from({ length: 17 }, (_, i) => `stockTicker:x${i}`).join(","),
  ])("rejects invalid keys %j", async (keys) => {
    expect((await get(keys)).status).toBe(400);
    expect(loadSidebarWidgetData).not.toHaveBeenCalled();
  });
});
