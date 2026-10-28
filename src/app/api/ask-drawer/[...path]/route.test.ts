import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { GET, POST } from "./route";

vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));

const USER_ID = "6a1b2c3d4e5f60718293a4b5";
const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });

describe("/api/ask-drawer/[...path]", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("ASK_DRAWER_SECRET", "drawer-secret");
    vi.stubEnv("ASK_DRAWER_URL", "http://ask.internal:9749/");
    vi.mocked(requireBasicAuth).mockResolvedValue({ ok: true, user: { userId: USER_ID } } as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards as the signed-in player with the machine secret", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ usage: { remaining: 4 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const response = await GET(
      new NextRequest("http://localhost/api/ask-drawer/conversation?id=abc123"),
      ctx(["conversation"])
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://ask.internal:9749/api/game-ask/conversation?id=abc123");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer drawer-secret",
      "X-Ask-User-Id": USER_ID,
    });
  });

  it("streams answers through unbuffered", async () => {
    fetchMock.mockResolvedValue(
      new Response('event: delta\ndata: "hi"\n\n', {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })
    );
    const response = await POST(
      new NextRequest("http://localhost/api/ask-drawer/ask", {
        method: "POST",
        body: JSON.stringify({ question: "why?" }),
      }),
      ctx(["ask"])
    );
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(await response.text()).toContain("hi");
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ question: "why?" }));
  });

  it("passes Ask's refusals through, including the upgrade offer", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ quota: true, upgrade: { tiers: [] } }), {
        status: 429,
        headers: { "content-type": "application/json" },
      })
    );
    const response = await POST(
      new NextRequest("http://localhost/api/ask-drawer/ask", { method: "POST", body: "{}" }),
      ctx(["ask"])
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ quota: true });
  });

  it("refuses unknown routes and oversize bodies without calling Ask", async () => {
    const unknown = await GET(
      new NextRequest("http://localhost/api/ask-drawer/console/review"),
      ctx(["console", "review"])
    );
    expect(unknown.status).toBe(400);
    const big = await POST(
      new NextRequest("http://localhost/api/ask-drawer/ask", {
        method: "POST",
        body: "x".repeat(40000),
      }),
      ctx(["ask"])
    );
    expect(big.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is unavailable when the deployment has no Ask secret", async () => {
    vi.stubEnv("ASK_DRAWER_SECRET", "");
    const response = await GET(new NextRequest("http://localhost/api/ask-drawer/me"), ctx(["me"]));
    expect(response.status).toBe(503);
  });

  it("requires a signed-in player", async () => {
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    } as never);
    const response = await GET(new NextRequest("http://localhost/api/ask-drawer/me"), ctx(["me"]));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends chart and map renders to Ask's renderers, with room for chart data", async () => {
    fetchMock.mockResolvedValue(
      new Response("<svg/>", { status: 200, headers: { "content-type": "image/svg+xml" } })
    );
    const big = JSON.stringify({ source: "x".repeat(60000) });
    const chart = await POST(
      new NextRequest("http://localhost/api/ask-drawer/chart/render", {
        method: "POST",
        body: big,
      }),
      ctx(["chart", "render"])
    );
    expect(chart.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("http://ask.internal:9749/api/chart/render");
    await POST(
      new NextRequest("http://localhost/api/ask-drawer/map/render", { method: "POST", body: "{}" }),
      ctx(["map", "render"])
    );
    expect(fetchMock.mock.calls[1][0]).toBe("http://ask.internal:9749/api/map/render");
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
      Authorization: "Bearer drawer-secret",
    });
  });
});
