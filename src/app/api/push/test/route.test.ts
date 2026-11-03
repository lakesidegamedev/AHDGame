import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "./route";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { pushDevices } from "@/lib/nativePush/devices";
import { sendNativePush } from "@/lib/nativePush/providers";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/nativePush/devices", () => ({
  pushDevices: vi.fn(),
  installationHash: (s: string) => `hash:${s}`,
}));
vi.mock("@/lib/nativePush/providers", () => ({ sendNativePush: vi.fn() }));

const installation = "a".repeat(64);
const request = (payload: unknown, origin?: string) =>
  new Request("https://example.com/api/push/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "example.com",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(payload),
  });
const findOne = vi.fn();

beforeEach(() => {
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: {
      userId: "507f1f77bcf86cd799439011",
      username: "t",
      email: "t@e.com",
      role: "player",
      isAdmin: false,
    },
  });
  findOne.mockReset();
  vi.mocked(pushDevices).mockResolvedValue({ findOne } as never);
  vi.mocked(sendNativePush).mockReset();
});

describe("push test alert", () => {
  it("sends to this installation only when it belongs to the signed-in account", async () => {
    findOne.mockResolvedValue({ _id: "hash:x", provider: "fcm" });
    vi.mocked(sendNativePush).mockResolvedValue("sent");
    const response = await POST(request({ installation }));
    expect(await response.json()).toEqual({ result: "sent" });
    const query = findOne.mock.calls[0]![0];
    expect(query._id).toBe(`hash:${installation}`);
    expect(query.userId.toHexString()).toBe("507f1f77bcf86cd799439011");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("reports an unregistered device without sending", async () => {
    findOne.mockResolvedValue(null);
    const response = await POST(request({ installation }));
    expect(await response.json()).toEqual({ result: "not_registered" });
    expect(sendNativePush).not.toHaveBeenCalled();
  });

  it("rejects signed-out, cross-origin and malformed requests", async () => {
    vi.mocked(requireBasicAuth).mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({}, { status: 401 }),
    });
    expect((await POST(request({ installation }))).status).toBe(401);
    expect((await POST(request({ installation }, "https://evil.example"))).status).toBe(403);
    expect((await POST(request({ installation: "nope" }))).status).toBe(400);
  });
});
