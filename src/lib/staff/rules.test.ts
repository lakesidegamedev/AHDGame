import { describe, expect, it } from "vitest";
import {
  canCallTier,
  canManageStaffRoles,
  canViewTier,
  canWrite,
  isReadMethod,
  resolveStaffRole,
} from "./rules";

describe("resolveStaffRole", () => {
  it("maps account records to roles, admin winning", () => {
    expect(resolveStaffRole({ role: "admin" })).toBe("admin");
    expect(resolveStaffRole({ role: "player", isAdmin: true })).toBe("admin");
    expect(resolveStaffRole({ role: "moderator" })).toBe("moderator");
    expect(resolveStaffRole({ role: "junior_dev" })).toBe("junior_dev");
    expect(resolveStaffRole({ role: "junior_dev", isAdmin: true })).toBe("admin");
  });

  it("gives players, unknown roles and missing accounts no staff role", () => {
    expect(resolveStaffRole({ role: "player" })).toBeNull();
    expect(resolveStaffRole({ role: "superuser" })).toBeNull();
    expect(resolveStaffRole({})).toBeNull();
    expect(resolveStaffRole(null)).toBeNull();
  });
});

describe("isReadMethod", () => {
  it("allows only GET and HEAD, case-insensitively", () => {
    expect(isReadMethod("GET")).toBe(true);
    expect(isReadMethod("head")).toBe(true);
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "", null, undefined]) {
      expect(isReadMethod(m)).toBe(false);
    }
  });
});

describe("canCallTier", () => {
  it("lets admins call everything", () => {
    for (const method of ["GET", "POST", "DELETE"]) {
      expect(canCallTier("admin", "admin", method)).toBe(true);
      expect(canCallTier("admin", "moderator", method)).toBe(true);
    }
  });

  it("keeps moderators on the moderator tier, reads and writes", () => {
    expect(canCallTier("moderator", "moderator", "POST")).toBe(true);
    expect(canCallTier("moderator", "moderator", "GET")).toBe(true);
    expect(canCallTier("moderator", "admin", "GET")).toBe(false);
    expect(canCallTier("moderator", "admin", "POST")).toBe(false);
  });

  it("gives junior devs reads on both tiers and no writes", () => {
    for (const tier of ["admin", "moderator"] as const) {
      expect(canCallTier("junior_dev", tier, "GET")).toBe(true);
      expect(canCallTier("junior_dev", tier, "HEAD")).toBe(true);
      for (const method of ["POST", "PUT", "PATCH", "DELETE", null]) {
        expect(canCallTier("junior_dev", tier, method)).toBe(false);
      }
    }
  });

  it("denies accounts without a staff role", () => {
    expect(canCallTier(null, "moderator", "GET")).toBe(false);
  });
});

describe("panel visibility and write controls", () => {
  it("shows junior devs everything but lets them write nothing", () => {
    expect(canViewTier("junior_dev", "admin")).toBe(true);
    expect(canWrite("junior_dev", "admin")).toBe(false);
    expect(canWrite("junior_dev", "moderator")).toBe(false);
  });

  it("hides admin tools from moderators", () => {
    expect(canViewTier("moderator", "admin")).toBe(false);
    expect(canViewTier("moderator", "moderator")).toBe(true);
    expect(canWrite("moderator", "moderator")).toBe(true);
    expect(canWrite("moderator", "admin")).toBe(false);
  });
});

describe("canManageStaffRoles", () => {
  it("is admin only", () => {
    expect(canManageStaffRoles("admin")).toBe(true);
    expect(canManageStaffRoles("moderator")).toBe(false);
    expect(canManageStaffRoles("junior_dev")).toBe(false);
    expect(canManageStaffRoles(null)).toBe(false);
  });
});
