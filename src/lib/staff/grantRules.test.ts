import { describe, expect, it } from "vitest";
import { planGrant, planRevoke } from "./grantRules";

describe("planGrant", () => {
  it("allows a plain player to receive either role", () => {
    expect(planGrant({ role: "player" }, "moderator")).toEqual({ ok: true });
    expect(planGrant({ role: "player" }, "junior_dev")).toEqual({ ok: true });
  });

  it("refuses admins, including flag-only admins", () => {
    expect(planGrant({ role: "admin" }, "junior_dev").ok).toBe(false);
    expect(planGrant({ role: "player", isAdmin: true }, "moderator").ok).toBe(false);
  });

  it("refuses a repeat grant and a second staff role", () => {
    expect(planGrant({ role: "moderator" }, "moderator").ok).toBe(false);
    expect(planGrant({ role: "moderator" }, "junior_dev").ok).toBe(false);
    expect(planGrant({ role: "junior_dev" }, "moderator").ok).toBe(false);
  });
});

describe("planRevoke", () => {
  it("removes only the exact role", () => {
    expect(planRevoke({ role: "junior_dev" }, "junior_dev")).toEqual({ ok: true });
    expect(planRevoke({ role: "moderator" }, "junior_dev").ok).toBe(false);
    expect(planRevoke({ role: "player" }, "moderator").ok).toBe(false);
  });
});
