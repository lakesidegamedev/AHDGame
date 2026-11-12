import { beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({ requireSingleplayer: vi.fn() }));
vi.mock("@/lib/api/requireSingleplayer", () => gate);

import { GET } from "./route";

const request = () => new Request("http://127.0.0.1/api/singleplayer/capabilities");

describe("GET /api/singleplayer/capabilities", () => {
  beforeEach(() => gate.requireSingleplayer.mockReset());

  it("serves the manifest to the local player", async () => {
    gate.requireSingleplayer.mockReturnValue(null);
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.schemaVersion).toBe(1);
    expect(body.presets.length).toBeGreaterThan(0);
  });

  it("answers with the gate's refusal outside singleplayer or off loopback", async () => {
    gate.requireSingleplayer.mockReturnValue(new Response(null, { status: 404 }));
    expect((await GET(request())).status).toBe(404);
  });
});
