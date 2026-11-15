import { afterEach, describe, expect, it, vi } from "vitest";

const mockGetAuthUserFromToken = vi.hoisted(() => vi.fn());
const mockClassifyIp = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAuthUserFromToken: mockGetAuthUserFromToken };
});
vi.mock("@/lib/vpn/detection", () => ({ classifyIp: mockClassifyIp }));
vi.mock("@/lib/maintenanceStatus", () => ({
  getCachedMaintenanceStatus: async () => ({ mode: "off", enabled: false }),
  isMaintenanceBypassPath: () => false,
}));
vi.mock("@/lib/publicViewing", () => ({
  getCachedPublicViewingMode: async () => true,
  isPublicApiReadBypassPath: () => false,
}));

import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { AUTH_COOKIE_NAME } from "@/lib/authCookieName";

afterEach(() => vi.clearAllMocks());

function post(path: string, signedIn = true): NextRequest {
  const req = new NextRequest(new URL(`https://www.ahousedividedgame.com${path}`), {
    method: "POST",
    headers: new Headers({ "cf-connecting-ip": "104.28.1.2" }),
  });
  if (signedIn) req.cookies.set(AUTH_COOKIE_NAME, "token");
  return req;
}

const player = {
  userId: "507f1f77bcf86cd799439011",
  username: "p",
  email: "p@example.com",
  role: "player",
};

describe("proxy VPN gate", () => {
  it("blocks a game write from a player on a VPN", async () => {
    mockClassifyIp.mockResolvedValue("vpn");
    mockGetAuthUserFromToken.mockResolvedValue(player);
    const res = await proxy(post("/api/actions"));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("VPN_BLOCKED");
  });

  it("lets a whitelisted player and staff through", async () => {
    mockClassifyIp.mockResolvedValue("vpn");
    mockGetAuthUserFromToken.mockResolvedValue({ ...player, vpnWhitelisted: true });
    expect((await proxy(post("/api/actions"))).status).not.toBe(403);
    mockGetAuthUserFromToken.mockResolvedValue({ ...player, isAdmin: true, isModerator: true });
    expect((await proxy(post("/api/actions"))).status).not.toBe(403);
  });

  it("allows settings writes and skips the session lookup off-VPN", async () => {
    mockClassifyIp.mockResolvedValue("vpn");
    mockGetAuthUserFromToken.mockResolvedValue(player);
    expect((await proxy(post("/api/settings/theme"))).status).not.toBe(403);
    mockClassifyIp.mockResolvedValue("clear");
    expect((await proxy(post("/api/actions"))).status).not.toBe(403);
    expect(mockGetAuthUserFromToken).not.toHaveBeenCalled();
  });

  it("fails open when the lookup throws", async () => {
    mockClassifyIp.mockRejectedValue(new Error("db down"));
    expect((await proxy(post("/api/actions"))).status).not.toBe(403);
  });
});
