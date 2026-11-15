import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const state = vi.hoisted(() => ({ admin: true, windows: [] as number[] }));

vi.mock("@/lib/api/requireAdmin", () => ({
  requireAdmin: async () =>
    state.admin
      ? { ok: true, admin: {} }
      : { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) },
}));
vi.mock("@/lib/auth/centralLogin/shadowEvents", () => ({
  summarizeShadowEvents: async (windowMs: number) => {
    state.windows.push(windowMs);
    return { total: 3, hopOk: 1, hopFailed: 1, breakerOpen: 1 };
  },
}));

import { GET } from "./route";

const req = (query = "") =>
  new Request(`https://game.example.invalid/api/admin/central-login/summary${query}`);

beforeEach(() => {
  state.admin = true;
  state.windows = [];
});

describe("GET /api/admin/central-login/summary", () => {
  it("rejects non-admins", async () => {
    state.admin = false;
    expect((await GET(req())).status).toBe(403);
    expect(state.windows).toEqual([]);
  });
  it.each([
    ["", "24h", 86_400_000],
    ["?window=1h", "1h", 3_600_000],
    ["?window=7d", "7d", 604_800_000],
  ])("serves %s", async (query, label, ms) => {
    const res = await GET(req(query));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({
      window: label,
      summary: { hopOk: 1, breakerOpen: 1 },
    });
    expect(state.windows).toEqual([ms]);
  });
  it("rejects an unknown window", async () => {
    expect((await GET(req("?window=1y"))).status).toBe(400);
  });
});
