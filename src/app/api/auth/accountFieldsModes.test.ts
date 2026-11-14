import { afterEach, describe, expect, it, vi } from "vitest";

const dbUsed = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/lib/mongodb", () => ({
  getDb: async () => {
    dbUsed.count++;
    throw new Error("database must not be touched");
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("@/lib/utils/network", () => ({ getClientIp: async () => "192.0.2.1" }));
vi.mock("@/lib/api/rateLimit.mongo", () => ({ durableRateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));

import { POST as changeEmail } from "./change-email/route";
import { POST as changePassword } from "./change-password/route";
import { POST as setPassword } from "./set-password/route";
import { POST as forgotPassword } from "./forgot-password/route";
import { POST as resetPassword } from "./reset-password/route";
import { POST as confirmEmail } from "./confirm-email/route";
import { GET as publicMode } from "./account-fields/route";

const FREEZE =
  "Account details are moving to your Lakeside account. This is back in a few minutes.";

function post(): Request {
  return new Request("https://game.example.invalid/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

const routes = [
  ["change-email", changeEmail, "Change your email at your Lakeside account"],
  ["change-password", changePassword, "Change your password at your Lakeside account"],
  ["set-password", setPassword, "Change your password at your Lakeside account"],
  ["forgot-password", forgotPassword, "Reset your password at your Lakeside account"],
  ["reset-password", resetPassword, "Reset your password at your Lakeside account"],
  ["confirm-email", confirmEmail, "Change your email at your Lakeside account"],
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
  dbUsed.count = 0;
});

describe("email and password writes by account fields mode", () => {
  it.each(routes)("%s refuses with 503 in freeze mode", async (_name, handler) => {
    vi.stubEnv("AHD_ACCOUNT_FIELDS_MODE", "freeze");
    const res = await handler(post());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(FREEZE);
    expect(dbUsed.count).toBe(0);
  });

  it.each(routes)(
    "%s refuses with 409 and the account link in central mode",
    async (_n, h, label) => {
      vi.stubEnv("AHD_ACCOUNT_FIELDS_MODE", "central");
      const res = await h(post());
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain(label);
      expect(body.error).toContain("https://lakesidegames.net/account");
      expect(dbUsed.count).toBe(0);
    }
  );

  it.each(routes)("%s is untouched when the mode is off", async (_name, handler) => {
    vi.stubEnv("AHD_ACCOUNT_FIELDS_MODE", "");
    const body = await (await handler(post())).json();
    expect(body.accountFieldsMode).toBeUndefined();
  });

  it("publishes the mode for the settings screens", async () => {
    vi.stubEnv("AHD_ACCOUNT_FIELDS_MODE", "central");
    expect(await (await publicMode()).json()).toEqual({ mode: "central" });
    vi.stubEnv("AHD_ACCOUNT_FIELDS_MODE", "nonsense");
    expect(await (await publicMode()).json()).toEqual({ mode: "off" });
  });
});
