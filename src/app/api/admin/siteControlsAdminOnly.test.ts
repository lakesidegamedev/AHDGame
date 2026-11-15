import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getAuthAdmin: vi.fn(),
  getAuthModerator: vi.fn(),
  getAuthJuniorDev: vi.fn(),
}));
vi.mock("@/lib/staff/requestMethod", () => ({ currentRequestMethod: vi.fn() }));
vi.mock("@/lib/adminLog", () => ({ createAdminLog: vi.fn() }));
vi.mock("@/lib/turnSystem", () => ({
  startTurnSystem: vi.fn(async () => ({ success: true, message: "started" })),
  stopTurnSystem: vi.fn(async () => ({ success: true, message: "stopped" })),
}));
vi.mock("@/lib/db/collections", () => ({ getGameStateCollection: vi.fn() }));
vi.mock("@/lib/db/repositories/gameConfig", () => ({ gameConfigCollection: vi.fn() }));
vi.mock("@/lib/db/repositories/characters", () => ({ charactersCollection: vi.fn() }));

const staff = { userId: "u1", username: "Sample Staff", isAdmin: false };
const patch = (body: unknown) =>
  new Request("http://localhost/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

type Role = "admin" | "moderator" | "junior_dev";

async function actAs(role: Role | null, method: string) {
  const auth = await import("@/lib/auth");
  vi.mocked(auth.getAuthAdmin).mockResolvedValue((role === "admin" ? staff : null) as never);
  vi.mocked(auth.getAuthModerator).mockResolvedValue(
    (role === "admin" || role === "moderator" ? staff : null) as never
  );
  vi.mocked(auth.getAuthJuniorDev).mockResolvedValue(
    (role === "junior_dev" ? staff : null) as never
  );
  const { currentRequestMethod } = await import("@/lib/staff/requestMethod");
  vi.mocked(currentRequestMethod).mockResolvedValue(method);
}

let db: MockDb;
const updateOne = vi.fn(async () => ({ matchedCount: 1 }));

beforeEach(async () => {
  vi.clearAllMocks();
  db = createMockDb();
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as never);
  const { getGameStateCollection } = await import("@/lib/db/collections");
  vi.mocked(getGameStateCollection).mockResolvedValue({
    findOne: vi.fn(async () => ({ _id: "current", corporationActionsPaused: false })),
    updateOne,
  } as never);
  const { gameConfigCollection } = await import("@/lib/db/repositories/gameConfig");
  vi.mocked(gameConfigCollection).mockReturnValue({
    updateOne,
    findOne: vi.fn(async () => null),
  } as never);
  const { charactersCollection } = await import("@/lib/db/repositories/characters");
  vi.mocked(charactersCollection).mockReturnValue({
    find: () => ({ sort: () => ({ toArray: async () => [] }) }),
  } as never);
});

type Call = () => Promise<Response>;

const writes: Array<[string, string, () => Promise<Call>]> = [
  ["POST turn/start", "POST", async () => (await import("./turn/start/route")).POST],
  ["POST turn/stop", "POST", async () => (await import("./turn/stop/route")).POST],
  [
    "POST turn/toggle-corporation-actions",
    "POST",
    async () => (await import("./turn/toggle-corporation-actions/route")).POST,
  ],
  [
    "PATCH registration",
    "PATCH",
    async () => {
      const { PATCH } = await import("./registration/route");
      return () => PATCH(patch({ enabled: false }));
    },
  ],
  [
    "PATCH ip-collision-check",
    "PATCH",
    async () => {
      const { PATCH } = await import("./ip-collision-check/route");
      return () => PATCH(patch({ enabled: true }));
    },
  ],
];

describe("site controls need an admin to change", () => {
  it.each(writes)(
    "%s: moderator and junior dev get 403, admin succeeds",
    async (_n, method, load) => {
      const call = await load();
      for (const role of ["moderator", "junior_dev", null] as const) {
        await actAs(role, method);
        expect((await call()).status).toBe(403);
      }
      expect(updateOne).not.toHaveBeenCalled();

      await actAs("admin", method);
      expect((await call()).status).toBe(200);
    }
  );

  it("registration and collision status stay readable by moderators", async () => {
    await actAs("moderator", "GET");
    const reg = await import("./registration/route");
    const col = await import("./ip-collision-check/route");
    expect((await reg.GET()).status).toBe(200);
    expect((await col.GET()).status).toBe(200);
  });

  it("the balances list is admin-only", async () => {
    const { GET } = await import("../moderator/resources/characters/route");
    await actAs("moderator", "GET");
    expect((await GET()).status).toBe(403);
    await actAs("admin", "GET");
    expect((await GET()).status).toBe(200);
  });
});
