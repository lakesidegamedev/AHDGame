import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSingleplayer, getDb } = vi.hoisted(() => ({
  requireSingleplayer: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("@/lib/api/requireSingleplayer", () => ({ requireSingleplayer }));
vi.mock("@/lib/mongodb", () => ({ getDb }));

import { SINGLEPLAYER_USER_ID } from "@/lib/singleplayer";
import { GET, POST } from "./route";

interface World {
  state: Record<string, unknown> | null;
  character: Record<string, unknown> | null;
  /** Collections whose countDocuments should report a match. */
  counts?: Record<string, number>;
}

function database(world: World) {
  const updateOne = vi.fn().mockImplementation(async (_filter, update) => {
    // Apply the $set to the in-memory state the way Mongo would.
    for (const [path, value] of Object.entries(update.$set as Record<string, unknown>)) {
      const keys = path.split(".");
      let target = world.state as Record<string, unknown>;
      for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
      target[keys.at(-1)!] = value;
    }
    return { modifiedCount: 1 };
  });
  const gameState = { findOne: vi.fn(async () => world.state), updateOne };
  const characters = { findOne: vi.fn(async () => world.character) };
  const db = {
    collection: vi.fn((name: string) => {
      if (name === "gameState") return gameState;
      if (name === "characters") return characters;
      return { countDocuments: vi.fn(async () => world.counts?.[name] ?? 0) };
    }),
  };
  return { db, updateOne, characters };
}

const request = (body?: unknown) =>
  new Request("http://127.0.0.1:3000/api/singleplayer/guide", {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const character = {
  _id: "c1",
  countryId: "US",
  party: "independent",
  funds: 50_000,
  actions: 5,
  createdTurn: 3,
};

describe("/api/singleplayer/guide", () => {
  beforeEach(() => {
    requireSingleplayer.mockReset().mockReturnValue(null);
    getDb.mockReset();
  });

  it("answers 404 outside singleplayer before touching the database", async () => {
    requireSingleplayer.mockReturnValue(new Response(null, { status: 404 }));
    expect((await GET(request())).status).toBe(404);
    expect((await POST(request({ action: "dismiss" }))).status).toBe(404);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("reports an inactive guide for a world that never offered it, with one read", async () => {
    const { db, characters } = database({
      state: { currentTurn: 1, singleplayerConfig: { mode: "normal" } },
      character: null,
    });
    getDb.mockResolvedValue(db);
    const body = await (await GET(request())).json();
    expect(body).toMatchObject({ offered: false, active: false, steps: [] });
    expect(characters.findOne).not.toHaveBeenCalled();
  });

  it("starts a fresh world at character creation", async () => {
    const { db } = database({
      state: { currentTurn: 1, singleplayerConfig: { mode: "normal", guide: {} } },
      character: null,
    });
    getDb.mockResolvedValue(db);
    const body = await (await GET(request())).json();
    expect(body.active).toBe(true);
    expect(body.steps.find((s: { id: string }) => s.id === "character").done).toBe(false);
  });

  it("derives progress from the character, the action log and the turn counter", async () => {
    const { db } = database({
      state: { currentTurn: 4, singleplayerConfig: { mode: "normal", guide: {} } },
      character,
      counts: { actionLogs: 1, politicalParties: 3 },
    });
    getDb.mockResolvedValue(db);
    const body = await (await GET(request())).json();
    const done = body.steps
      .filter((s: { done: boolean }) => s.done)
      .map((s: { id: string }) => s.id);
    expect(done).toEqual(["character", "campaign", "end-turn"]);
    expect(body.funds).toBe(50_000);
    expect(body.actions).toBe(5);
  });

  it("looks up the local player's own active character", async () => {
    const { db, characters } = database({
      state: { currentTurn: 4, singleplayerConfig: { mode: "normal", guide: {} } },
      character,
    });
    getDb.mockResolvedValue(db);
    await GET(request());
    const [filter] = characters.findOne.mock.calls[0] as unknown as [
      { userId: { toString(): string }; retiredAt: unknown },
    ];
    expect(filter.userId.toString()).toBe(SINGLEPLAYER_USER_ID);
    expect(filter.retiredAt).toEqual({ $exists: false });
  });

  it("dismiss stores the time on the world and stops the guide", async () => {
    const world: World = {
      state: { currentTurn: 4, singleplayerConfig: { mode: "normal", guide: {} } },
      character,
    };
    const { db, updateOne } = database(world);
    getDb.mockResolvedValue(db);
    const body = await (await POST(request({ action: "dismiss" }))).json();
    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = updateOne.mock.calls[0];
    expect(filter).toMatchObject({
      _id: "current",
      "singleplayerConfig.guide": { $exists: true },
      "singleplayerConfig.guide.dismissedAt": { $exists: false },
    });
    expect(update.$set["singleplayerConfig.guide.dismissedAt"]).toBeInstanceOf(Date);
    expect(body).toMatchObject({ offered: true, active: false });
  });

  it("inbox-opened completes the inbox step and only ever writes the guide path", async () => {
    const world: World = {
      state: { currentTurn: 4, singleplayerConfig: { mode: "normal", guide: {} } },
      character,
    };
    const { db, updateOne } = database(world);
    getDb.mockResolvedValue(db);
    const body = await (await POST(request({ action: "inbox-opened" }))).json();
    expect(Object.keys(updateOne.mock.calls[0][1].$set)).toEqual([
      "singleplayerConfig.guide.inboxOpenedAt",
    ]);
    expect(body.steps.find((s: { id: string }) => s.id === "inbox").done).toBe(true);
  });

  it("rejects an unknown action without writing", async () => {
    const { db, updateOne } = database({
      state: { currentTurn: 4, singleplayerConfig: { mode: "normal", guide: {} } },
      character,
    });
    getDb.mockResolvedValue(db);
    const res = await POST(request({ action: "complete" }));
    expect(res.status).toBe(400);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("sends no-store on reads so a stale step is never cached", async () => {
    const { db } = database({
      state: { currentTurn: 1, singleplayerConfig: { mode: "normal", guide: {} } },
      character: null,
    });
    getDb.mockResolvedValue(db);
    expect((await GET(request())).headers.get("cache-control")).toMatch(/no-store/);
  });
});
