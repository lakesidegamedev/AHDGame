import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSingleplayer, getDb, startSingleplayerBatch, getLatest, requestStop } = vi.hoisted(
  () => ({
    requireSingleplayer: vi.fn(),
    getDb: vi.fn(),
    startSingleplayerBatch: vi.fn(),
    getLatest: vi.fn(),
    requestStop: vi.fn(),
  })
);

vi.mock("@/lib/api/requireSingleplayer", () => ({ requireSingleplayer }));
vi.mock("@/lib/mongodb", () => ({ getDb }));
vi.mock("@/lib/singleplayerBatch", () => ({
  BATCH_TURN_CHOICES: [1, 3, 5, 10],
  startSingleplayerBatch,
  getLatestSingleplayerBatch: getLatest,
  requestSingleplayerBatchStop: requestStop,
}));

import { DELETE, GET, POST } from "./route";

const post = (body: unknown) =>
  new Request("http://localhost/api/singleplayer/turn/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("/api/singleplayer/turn/batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSingleplayer.mockReturnValue(null);
    getDb.mockResolvedValue({});
  });

  it("is closed outside singleplayer", async () => {
    requireSingleplayer.mockReturnValue(new Response(null, { status: 404 }));
    expect((await POST(post({ turns: 3 }))).status).toBe(404);
    expect((await GET(new Request("http://localhost/x"))).status).toBe(404);
    expect((await DELETE(new Request("http://localhost/x", { method: "DELETE" }))).status).toBe(
      404
    );
    expect(startSingleplayerBatch).not.toHaveBeenCalled();
  });

  it("starts a batch and answers 202 with the job", async () => {
    startSingleplayerBatch.mockResolvedValue({ ok: true, job: { id: "j", requested: 5 } });
    const response = await POST(post({ turns: 5 }));
    expect(response.status).toBe(202);
    expect(startSingleplayerBatch).toHaveBeenCalledWith({}, 5);
    await expect(response.json()).resolves.toMatchObject({ batch: { id: "j", requested: 5 } });
  });

  it.each([0, 11, 2.5, "3"])("rejects turns=%s before touching the world", async (turns) => {
    const response = await POST(post({ turns }));
    expect(response.status).toBe(400);
    expect(startSingleplayerBatch).not.toHaveBeenCalled();
  });

  it("passes a refusal through with its status", async () => {
    startSingleplayerBatch.mockResolvedValue({
      ok: false,
      status: 409,
      error: "Resume the world before ending a turn.",
    });
    const response = await POST(post({ turns: 3 }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Resume the world before ending a turn.",
    });
  });

  it("reports the latest batch for polling", async () => {
    getLatest.mockReturnValue({ id: "j", status: "running", completed: 2, requested: 5 });
    const response = await GET(new Request("http://localhost/x"));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ batch: { completed: 2 } });
  });

  it("asks the running batch to stop, or says none is running", async () => {
    requestStop.mockReturnValueOnce({ id: "j", stopRequested: true });
    const stopped = await DELETE(new Request("http://localhost/x", { method: "DELETE" }));
    expect(stopped.status).toBe(200);
    requestStop.mockReturnValueOnce(null);
    const idle = await DELETE(new Request("http://localhost/x", { method: "DELETE" }));
    expect(idle.status).toBe(409);
  });
});
