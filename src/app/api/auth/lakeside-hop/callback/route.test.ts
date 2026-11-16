import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth/centralLogin/hop", () => ({
  finishLakesideHop: vi.fn(async () => "/auth/discord/result?status=success"),
}));

describe("GET /api/auth/lakeside-hop/callback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the browser to the public origin, not the server's listen address", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://game.example.test");
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://localhost:3000/api/auth/lakeside-hop/callback")
    );
    expect(response.headers.get("location")).toBe(
      "https://game.example.test/auth/discord/result?status=success"
    );
  });
});
