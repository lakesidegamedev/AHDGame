import { afterEach, describe, expect, it, vi } from "vitest";
import { accountFieldsRefusal, getAccountFieldsMode } from "./mode";
import { FREEZE_MESSAGE } from "./rules";

afterEach(() => vi.unstubAllEnvs());

describe("account fields mode", () => {
  it("is off when unset and never refuses", () => {
    vi.stubEnv("AHD_ACCOUNT_FIELDS_MODE", "");
    expect(getAccountFieldsMode()).toBe("off");
    expect(accountFieldsRefusal("email")).toBeNull();
    expect(accountFieldsRefusal("password")).toBeNull();
    expect(accountFieldsRefusal("reset")).toBeNull();
  });

  it("freeze answers 503 with the plain wording for every kind", async () => {
    vi.stubEnv("AHD_ACCOUNT_FIELDS_MODE", "freeze");
    for (const kind of ["email", "password", "reset"] as const) {
      const res = accountFieldsRefusal(kind);
      expect(res?.status).toBe(503);
      const body = await res!.json();
      expect(body.error).toBe(FREEZE_MESSAGE);
    }
  });

  it("central answers 409 with the account address", async () => {
    vi.stubEnv("AHD_ACCOUNT_FIELDS_MODE", "central");
    const res = accountFieldsRefusal("email");
    expect(res?.status).toBe(409);
    const body = await res!.json();
    expect(body.error).toContain("Change your email at your Lakeside account");
    expect(body.error).toContain("https://lakesidegames.net/account");
    expect(body.accountUrl).toBe("https://lakesidegames.net/account");
    const reset = await accountFieldsRefusal("reset")!.json();
    expect(reset.error).toContain("Reset your password at your Lakeside account");
  });
});
