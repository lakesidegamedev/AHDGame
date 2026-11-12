import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: mocks.requireAdmin }));

import { GET } from "./route";
import { getAllTurnoutTargetOptions } from "@/lib/demographics/turnoutTargets";

describe("GET /api/admin/law-types/turnout-targets", () => {
  beforeEach(() => mocks.requireAdmin.mockReset());

  it("refuses non-admins", async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("serves every country's buckets, uncached", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { options: { id: string }[] };
    expect(body.options).toEqual(getAllTurnoutTargetOptions());
    expect(body.options.length).toBeGreaterThan(0);
    expect(new Set(body.options.map((o) => o.id)).size).toBe(body.options.length);
  });
});
