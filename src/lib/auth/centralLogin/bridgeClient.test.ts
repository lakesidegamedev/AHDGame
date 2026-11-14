import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bridgeAccountDelete,
  bridgeAccountUpsert,
  bridgePasswordCheck,
  bridgePasswordSet,
  isBridgeConfigured,
  isSafeBridgeAddress,
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
    const failed = await bridgePasswordSet("u1", "pw");
    // The failure carries a reason, status and node for logs, never the response body.
    expect(failed).toEqual({
      ok: false,
      kind: "error",
      detail: { reason: "http", phase: "call", status: 500 },
    });
    expect(JSON.stringify(failed)).not.toContain("secret detail");
    route(() => json({ result: "ok" }));
    expect(await bridgeAccountDelete("u1")).toEqual({ ok: true, data: null });
  });
});

describe("bridge address safety", () => {
  it.each([
    ["https://bridge.example.invalid/", true],
    ["http://127.0.0.1:8080/realms/x/", true],
    ["http://localhost:8080/", true],
    ["http://[::1]:8080/", true],
    ["http://bridge.example.invalid/", false],
    ["http://10.0.0.5/", false],
    ["ftp://bridge.example.invalid/", false],
    ["https://user:pass@bridge.example.invalid/", false],
    ["not a url", false],
    ["", false],
  ])("%s safe=%s", (url, safe) => {
    expect(isSafeBridgeAddress(url)).toBe(safe);
  });

  it("reads as not configured when either address is plain http to a remote host", () => {
    expect(isBridgeConfigured()).toBe(true);
    vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_URL", "http://bridge.example.invalid/");
    expect(isBridgeConfigured()).toBe(false);
    vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_URL", "https://bridge.example.invalid/");
    vi.stubEnv("LAKESIDE_ACCOUNT_BRIDGE_TOKEN_URL", "http://token.example.invalid/token");
    expect(isBridgeConfigured()).toBe(false);
  });
});

describe("password check failure reasons and the single retry", () => {
  function netError(code: string): Error {
    return Object.assign(new TypeError("fetch failed"), { cause: { code } });
  }

  it("retries once after a timeout and returns the second answer", async () => {
    let calls = 0;
    route(async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      return json({ result: "ok" });
    });
    await expect(
      bridgePasswordCheck("6af6a3f1c51fffa232cd7088", "pw", { enforceEnabled: true })
    ).resolves.toBe("ok");
    expect(calls).toBe(2);
  });

  it("retries once after a refused connection, then fails closed with the error", async () => {
    let calls = 0;
    route(async () => {
      calls += 1;
      throw netError("ECONNREFUSED");
    });
    await expect(
      bridgePasswordCheck("6af6a3f1c51fffa232cd7088", "pw", { enforceEnabled: true })
    ).resolves.toBe("error");
    expect(calls).toBe(2);
  });

  it("never retries a wrong password", async () => {
    let calls = 0;
    route(async () => {
      calls += 1;
      return json({ result: "wrong" });
    });
    await expect(
      bridgePasswordCheck("6af6a3f1c51fffa232cd7088", "pw", { enforceEnabled: true })
    ).resolves.toBe("wrong");
    expect(calls).toBe(1);
  });

  it("never retries an HTTP error answer", async () => {
    let calls = 0;
    route(async () => {
      calls += 1;
      return json({ error: "x" }, 500);
    });
    await expect(
      bridgePasswordCheck("6af6a3f1c51fffa232cd7088", "pw", { enforceEnabled: true })
    ).resolves.toBe("error");
    expect(calls).toBe(1);
  });

  it("sends one request id on both attempts and logs reason, status and node", async () => {
    const ids: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    route(async (_path, init) => {
      calls += 1;
      ids.push(String((init.headers as Record<string, string>)["X-Request-Id"]));
      if (calls === 1) throw netError("ECONNRESET");
      return new Response("busy", {
        status: 503,
        headers: { "X-Lakeside-Node": "127.0.0.1:8082" },
      });
    });
    await expect(
      bridgePasswordCheck("6af6a3f1c51fffa232cd7088", "pw", { enforceEnabled: true })
    ).resolves.toBe("error");
    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[1]).toBe(ids[0]);
    const logged = warn.mock.calls.map((c) => JSON.stringify(c)).join("\n");
    expect(logged).toContain("connection_reset");
    expect(logged).toContain("127.0.0.1:8082");
    expect(logged).toContain("503");
    expect(logged).not.toContain('"pw"');
    warn.mockRestore();
  });
});
