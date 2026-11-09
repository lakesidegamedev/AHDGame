import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { getCountryLayer1Model } from "@/lib/seeds/international";
import { editorConfigFromCountryModel } from "@/lib/positionEditor/derive";

vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: vi.fn() }));

import { requireAdmin } from "@/lib/api/requireAdmin";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://test.local/api/admin/position-editor/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

describe("POST /api/admin/position-editor/preview", () => {
  beforeEach(() => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      admin: { username: "admin" },
    } as unknown as Awaited<ReturnType<typeof requireAdmin>>);
  });

  it("refuses a non-admin caller", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as unknown as Awaited<ReturnType<typeof requireAdmin>>);
    expect((await post({ configs: [] })).status).toBe(403);
  });

  it("returns one census preview per config, in order", async () => {
    const model = getCountryLayer1Model("UK", "2019")!;
    const regions = Object.keys(model.census).slice(0, 2);
    const configs = regions.map((id) => editorConfigFromCountryModel(model, id, "2019"));
    const response = await post({ configs });
    expect(response.status).toBe(200);
    const { derived } = (await response.json()) as {
      derived: Array<{ buckets: unknown[]; stateEconomicLean: number; stateSocialLean: number }>;
    };
    expect(derived).toHaveLength(2);
    for (const preview of derived) {
      expect(preview.buckets.length).toBeGreaterThan(0);
      expect(Number.isFinite(preview.stateEconomicLean)).toBe(true);
      expect(Math.abs(preview.stateSocialLean)).toBeLessThanOrEqual(5);
    }
  });

  it("rejects an empty or unknown-era request", async () => {
    expect((await post({ configs: [] })).status).toBe(400);
    const model = getCountryLayer1Model("UK", "2019")!;
    const config = editorConfigFromCountryModel(model, Object.keys(model.census)[0], "2019");
    expect((await post({ configs: [{ ...config, era: "1800" }] })).status).toBe(400);
  });
});
