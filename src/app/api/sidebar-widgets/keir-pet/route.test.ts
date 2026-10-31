import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { careForKeir } from "@/lib/sidebarWidgets/keirPet";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/sidebarWidgets/keirPet", () => ({ careForKeir: vi.fn() }));

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/sidebar-widgets/keir-pet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

describe("POST /api/sidebar-widgets/keir-pet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: true,
      user: { userId: "u1", experimentalFeatures: true },
    } as never);
  });

  it("returns the cared-for pet", async () => {
    vi.mocked(careForKeir).mockResolvedValue({ bond: 3 } as never);
    const response = await post({ action: "tea" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pet: { bond: 3 } });
    expect(careForKeir).toHaveBeenCalledWith({}, "u1", "tea");
  });

  it("answers 409 while Keir is on cooldown", async () => {
    vi.mocked(careForKeir).mockResolvedValue(null);
    expect((await post({ action: "pat" })).status).toBe(409);
  });

  it("refuses non-experimental players and bad actions", async () => {
    expect((await post({ action: "feed" })).status).toBe(400);
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: true,
      user: { userId: "u1", experimentalFeatures: false },
    } as never);
    expect((await post({ action: "tea" })).status).toBe(403);
    expect(careForKeir).not.toHaveBeenCalled();
  });
});
