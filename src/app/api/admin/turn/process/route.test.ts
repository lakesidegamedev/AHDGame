import { afterEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/api/requireAdmin", () => ({
  requireAdmin: vi.fn(async () => ({ ok: true, admin: { username: "egg" } })),
}));
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn(async () => ({})) }));
vi.mock("@/lib/turnSystem", () => ({
  processTurn: vi.fn(async () => ({
    success: true,
    turn: 372,
    message: "ok",
    warnings: [],
    health: null,
  })),
}));
vi.mock("@/lib/turn/queueAdminTurns", () => ({
  queueAdminTurns: vi.fn(async () => NextResponse.json({ queued: true }, { status: 202 })),
}));

import { POST } from "./route";
import { processTurn } from "@/lib/turnSystem";
import { queueAdminTurns } from "@/lib/turn/queueAdminTurns";

const post = (body?: unknown) =>
  new Request("http://localhost/api/admin/turn/process", {
    method: "POST",
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });

describe("POST /api/admin/turn/process", () => {
  const original = process.env.CRON_OWNER;
  afterEach(() => {
    process.env.CRON_OWNER = original;
    vi.clearAllMocks();
  });

  it("queues for the turn worker and never runs a turn in the web server", async () => {
    process.env.CRON_OWNER = "worker";
    const res = await POST(post());
    expect(res.status).toBe(202);
    expect(processTurn).not.toHaveBeenCalled();
    expect(queueAdminTurns).toHaveBeenCalledWith(expect.anything(), {
      count: 1,
      requestedBy: "egg",
    });
  });

  it("queues a batch count in one request", async () => {
    process.env.CRON_OWNER = "worker";
    await POST(post({ count: 5 }));
    expect(queueAdminTurns).toHaveBeenCalledWith(expect.anything(), {
      count: 5,
      requestedBy: "egg",
    });
  });

  it("rejects an out-of-range count", async () => {
    process.env.CRON_OWNER = "worker";
    expect((await POST(post({ count: 21 }))).status).toBe(400);
    expect(queueAdminTurns).not.toHaveBeenCalled();
  });

  it("still runs the turn inline where web owns turns", async () => {
    delete process.env.CRON_OWNER;
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(processTurn).toHaveBeenCalledTimes(1);
    expect(queueAdminTurns).not.toHaveBeenCalled();
  });
});
