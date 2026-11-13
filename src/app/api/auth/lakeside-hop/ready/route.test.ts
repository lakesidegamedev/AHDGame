import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  ready: true,
  mode: "central",
  skipped: vi.fn(async (_u: string) => {}),
  user: "u1" as string | null,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("@/lib/auth/centralLogin", () => ({ getCentralLoginModeFor: () => m.mode }));
vi.mock("@/lib/auth/centralLogin/issuerReadiness", () => ({
  isHopIssuerReady: async () => m.ready,
}));
vi.mock("@/lib/auth/centralLogin/hop", () => ({
  sessionUserId: async () => m.user,
  recordHopSkipped: m.skipped,
}));

import { GET } from "./route";

beforeEach(() => {
  m.ready = true;
  m.mode = "central";
  m.user = "u1";
  m.skipped.mockClear();
});

describe("GET /api/auth/lakeside-hop/ready", () => {
  it("reports ready without recording", async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ ready: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(m.skipped).not.toHaveBeenCalled();
  });

  it("reports not ready and records the skip", async () => {
    m.ready = false;
    const res = await GET();
    expect(await res.json()).toEqual({ ready: false });
    expect(m.skipped).toHaveBeenCalledWith("u1");
  });

  it("an anonymous caller is answered but never recorded", async () => {
    m.ready = false;
    m.user = null;
    expect(await (await GET()).json()).toEqual({ ready: false });
    expect(m.skipped).not.toHaveBeenCalled();
  });

  it("outside central mode reports not ready and records nothing", async () => {
    m.ready = false;
    m.mode = "shadow";
    expect(await (await GET()).json()).toEqual({ ready: false });
    expect(m.skipped).not.toHaveBeenCalled();
  });
});
