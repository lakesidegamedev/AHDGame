import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  ready: true,
  mode: "central",
  skipped: vi.fn(async (_u: string) => {}),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("@/lib/auth/centralLogin", () => ({ getCentralLoginMode: () => m.mode }));
vi.mock("@/lib/auth/centralLogin/issuerReadiness", () => ({
  isHopIssuerReady: async () => m.ready,
}));
vi.mock("@/lib/auth/centralLogin/hop", () => ({
  sessionUserId: async () => "u1",
  recordHopSkipped: m.skipped,
}));

import { GET } from "./route";

beforeEach(() => {
  m.ready = true;
  m.mode = "central";
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

  it("outside central mode reports not ready and records nothing", async () => {
    m.ready = false;
    m.mode = "shadow";
    expect(await (await GET()).json()).toEqual({ ready: false });
    expect(m.skipped).not.toHaveBeenCalled();
  });
});
