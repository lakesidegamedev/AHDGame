import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getAuthAdmin: vi.fn(),
  getAuthModerator: vi.fn(),
  getAuthJuniorDev: vi.fn(),
}));
const method = vi.hoisted(() => ({ currentRequestMethod: vi.fn() }));

vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/staff/requestMethod", () => method);

import { requireAdmin } from "./requireAdmin";
import { requireModerator } from "./requireModerator";

const adminUser = { userId: "a", isAdmin: true, isModerator: true };
const modUser = { userId: "m", isAdmin: false, isModerator: true };
const juniorUser = { userId: "j", isAdmin: false, isModerator: false, isJuniorDev: true };

/** Wire the auth mocks the way getAuth* behave for each role. */
function actAs(role: "admin" | "moderator" | "junior_dev" | "player") {
  auth.getAuthAdmin.mockResolvedValue(role === "admin" ? adminUser : null);
  auth.getAuthModerator.mockResolvedValue(
    role === "admin" ? adminUser : role === "moderator" ? modUser : null
  );
  auth.getAuthJuniorDev.mockResolvedValue(role === "junior_dev" ? juniorUser : null);
}

beforeEach(() => vi.resetAllMocks());

describe("requireAdmin", () => {
  it("lets an admin through on writes", async () => {
    actAs("admin");
    method.currentRequestMethod.mockResolvedValue("POST");
    expect((await requireAdmin()).ok).toBe(true);
  });

  it("lets a junior dev read", async () => {
    actAs("junior_dev");
    for (const m of ["GET", "HEAD"]) {
      method.currentRequestMethod.mockResolvedValue(m);
      expect((await requireAdmin()).ok).toBe(true);
    }
  });

  it("returns 403 to a junior dev on every mutating method", async () => {
    actAs("junior_dev");
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      method.currentRequestMethod.mockResolvedValue(m);
      const result = await requireAdmin();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(403);
    }
  });

  it("fails closed for a junior dev when the method is unknown", async () => {
    actAs("junior_dev");
    method.currentRequestMethod.mockResolvedValue(null);
    expect((await requireAdmin()).ok).toBe(false);
  });

  it("keeps moderators and players out of admin-only routes on reads and writes", async () => {
    for (const role of ["moderator", "player"] as const) {
      actAs(role);
      for (const m of ["GET", "POST"]) {
        method.currentRequestMethod.mockResolvedValue(m);
        const result = await requireAdmin();
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.response.status).toBe(403);
      }
    }
  });
});

describe("requireModerator", () => {
  it("lets moderators and admins through on writes", async () => {
    method.currentRequestMethod.mockResolvedValue("POST");
    actAs("moderator");
    expect((await requireModerator()).ok).toBe(true);
    actAs("admin");
    expect((await requireModerator()).ok).toBe(true);
  });

  it("lets a junior dev read and blocks every write", async () => {
    actAs("junior_dev");
    method.currentRequestMethod.mockResolvedValue("GET");
    expect((await requireModerator()).ok).toBe(true);
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      method.currentRequestMethod.mockResolvedValue(m);
      const result = await requireModerator();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(403);
    }
  });

  it("denies players", async () => {
    actAs("player");
    method.currentRequestMethod.mockResolvedValue("GET");
    expect((await requireModerator()).ok).toBe(false);
  });
});
