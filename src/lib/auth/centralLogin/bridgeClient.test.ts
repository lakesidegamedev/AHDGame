import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bridgeAccountDelete,
  bridgeAccountUpsert,
  bridgePasswordCheck,
  bridgePasswordSet,
  resetBridgeTokenCache,
} from "./bridgeClient";

const fetchMock = vi.fn();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function route(handler: (path: string, init: RequestInit) => Response | Promise<Response>) {
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    if (url === "https://token.example.invalid/token") {
      return json({ access_token: "synthetic-token", expires_in: 300 });
    }
    return handler(url.replace("https://bridge.example.invalid/", ""), init);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  resetBridgeTokenCache();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_URL", "https://bridge.example.invalid/");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_TOKEN_URL", "https://token.example.invalid/token");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_CLIENT_ID", "synthetic-client");
  vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_CLIENT_SECRET", "synthetic-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("bridge client", () => {
  it("sends a bearer token and omits enforceEnabled unless asked", async () => {
    route(() => json({ result: "ok", enabled: true }));
    expect(await bridgePasswordCheck("u1", "pw", { enforceEnabled: false })).toBe("ok");
    const [, init] = fetchMock.mock.calls[1];
    expect(init.headers.Authorization).toBe("Bearer synthetic-token");
    expect(JSON.parse(init.body)).toEqual({ ahdUserId: "u1", password: "pw" });

    await bridgePasswordCheck("u1", "pw", { enforceEnabled: true });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      ahdUserId: "u1",
      password: "pw",
      enforceEnabled: true,
    });
  });

  it("caches the token across calls", async () => {
    route(() => json({ result: "wrong", enabled: true }));
    await bridgePasswordCheck("u1", "pw", { enforceEnabled: false });
    await bridgePasswordCheck("u2", "pw", { enforceEnabled: false });
    const tokenCalls = fetchMock.mock.calls.filter(([url]) => url.includes("token.example"));
    expect(tokenCalls).toHaveLength(1);
  });

  it.each(["ok", "wrong", "disabled", "unknown"] as const)("types a %s answer", async (result) => {
    route(() => json({ result, enabled: false }));
    expect(await bridgePasswordCheck("u1", "pw", { enforceEnabled: true })).toBe(result);
  });

  it("maps an unexpected answer or HTTP failure to error", async () => {
    route(() => json({ result: "surprise" }));
    expect(await bridgePasswordCheck("u1", "pw", { enforceEnabled: true })).toBe("error");
    route(() => json({ message: "boom with secrets" }, 500));
    expect(await bridgePasswordCheck("u1", "pw", { enforceEnabled: true })).toBe("error");
  });

  it("maps an aborted request to timeout and a network failure to error", async () => {
    route(() => {
      throw Object.assign(new Error("slow"), { name: "TimeoutError" });
    });
    expect(await bridgePasswordCheck("u1", "pw", { enforceEnabled: true })).toBe("timeout");
    route(() => {
      throw new Error("connect failed to internal-host");
    });
    expect(await bridgePasswordCheck("u1", "pw", { enforceEnabled: true })).toBe("error");
  });

  it("errors when the token endpoint fails and never calls the bridge", async () => {
    fetchMock.mockResolvedValue(json({}, 500));
    expect(await bridgePasswordCheck("u1", "pw", { enforceEnabled: true })).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("errors without config and makes no call", async () => {
    vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_URL", "");
    expect(await bridgePasswordCheck("u1", "pw", { enforceEnabled: true })).toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports write results without echoing response bodies", async () => {
    route(() => json({ result: "ok" }));
    expect(await bridgePasswordSet("u1", "pw")).toEqual({ ok: true, data: null });
    route(() => json({ result: "updated", userId: "k1" }));
    expect(
      await bridgeAccountUpsert({
        ahdUserId: "u1",
        username: "a",
        email: "a@example.invalid",
        emailVerified: true,
      })
    ).toEqual({ ok: true, data: null });
    route(() => json({ error: "secret detail" }, 500));
    expect(await bridgePasswordSet("u1", "pw")).toEqual({ ok: false, kind: "error" });
    route(() => json({ result: "ok" }));
    expect(await bridgeAccountDelete("u1")).toEqual({ ok: true, data: null });
  });
});
