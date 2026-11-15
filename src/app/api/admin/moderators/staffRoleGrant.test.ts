import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
  createAdminLog: vi.fn(),
}));

vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/adminLog", () => ({ createAdminLog: mocks.createAdminLog }));
vi.mock("@/lib/mongodb", () => ({
  getDb: async () => ({
    collection: () => ({ findOne: mocks.findOne, updateOne: mocks.updateOne }),
  }),
}));

import { POST as assign } from "./assign/route";
import { POST as remove } from "./remove/route";

const denied = { ok: false, response: Response.json({ error: "Forbidden" }, { status: 403 }) };
const USER_ID = "507f1f77bcf86cd799439011";

function post(body: unknown) {
  return new Request("http://localhost/api/admin/moderators/assign", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe.each([
  ["assign", assign],
  ["remove", remove],
])("staff role %s", (_name, handler) => {
  it("is refused for moderators and players (requireAdmin denies)", async () => {
    mocks.requireAdmin.mockResolvedValue(denied);
    const res = await handler(post({ userId: USER_ID, role: "junior_dev" }));
    expect(res.status).toBe(403);
    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(mocks.createAdminLog).not.toHaveBeenCalled();
  });

  it("is refused for a junior dev even if the guard let the principal through", async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      admin: { username: "jd", isAdmin: false, isJuniorDev: true },
    });
    const res = await handler(post({ userId: USER_ID, role: "moderator" }));
    expect(res.status).toBe(403);
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });
});

describe("admin grants and removals", () => {
  const admin = { ok: true, admin: { username: "boss", isAdmin: true } };

  it("grants junior dev and writes an audit log entry", async () => {
    mocks.requireAdmin.mockResolvedValue(admin);
    mocks.findOne.mockResolvedValue({ username: "target", role: "player" });
    const res = await assign(post({ userId: USER_ID, role: "junior_dev" }));
    expect(res.status).toBe(200);
    const update = mocks.updateOne.mock.calls[0]![1];
    expect(update.$set.role).toBe("junior_dev");
    expect(update.$set.juniorDevSince).toBeInstanceOf(Date);
    expect(mocks.createAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "junior_dev_assigned",
        username: "target",
        adminUsername: "boss",
      })
    );
  });

  it("still grants moderator when no role is given", async () => {
    mocks.requireAdmin.mockResolvedValue(admin);
    mocks.findOne.mockResolvedValue({ username: "target", role: "player" });
    const res = await assign(post({ userId: USER_ID }));
    expect(res.status).toBe(200);
    expect(mocks.updateOne.mock.calls[0]![1].$set.role).toBe("moderator");
    expect(mocks.createAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "moderator_assigned" })
    );
  });

  it("will not grant to an admin or stack a second staff role", async () => {
    mocks.requireAdmin.mockResolvedValue(admin);
    mocks.findOne.mockResolvedValue({ username: "t", role: "admin" });
    expect((await assign(post({ userId: USER_ID, role: "junior_dev" }))).status).toBe(400);
    mocks.findOne.mockResolvedValue({ username: "t", role: "moderator" });
    expect((await assign(post({ userId: USER_ID, role: "junior_dev" }))).status).toBe(400);
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it("removes junior dev, resets to player and logs it", async () => {
    mocks.requireAdmin.mockResolvedValue(admin);
    mocks.findOne.mockResolvedValue({ username: "target", role: "junior_dev" });
    const res = await remove(post({ userId: USER_ID, role: "junior_dev" }));
    expect(res.status).toBe(200);
    expect(mocks.updateOne.mock.calls[0]![1].$set.role).toBe("player");
    expect(mocks.createAdminLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "junior_dev_removed" })
    );
  });
});
